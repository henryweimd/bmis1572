"""Build the investigator-supply analytics lake.

Usage (from repo root):
    uv run python pipeline/build.py [--from-checkpoint] [--skip-ctgov]
                                    [--refresh-ctgov] [--skip-charts]

Real ingest (replaces the original synthetic generator):
    FDA BMIS quarterly file + clinicaltrials.gov API v2
      -> data/curated/*.parquet (local lake, gitignored)
      -> data/manifest.json
      -> explorer/public/data/* (served snapshot for local dev)
      -> charts/*.png (tracked static charts)

Checkpoints (rerun-friendly):
    data/curated/bmis_clean.parquet       cleaned BMIS rows + person codes
    data/curated/bmis_ci_raw.parquet      uncollapsed CI rows + raw codes
    data/curated/persons_{strict,merged,raw}.parquet
    data/curated/entities.parquet         IRB/CRO entities
"""

from __future__ import annotations

import argparse
import gc
import json
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import aggregate as agg
import bmis
import charts
import china
import cluster
import ctgov
import ctgov_geo
import ctgov_link
import ctgov_people
import ctgov_ta
import deck
import sites
from orgs import ALIAS_CANONICALS, normalize_cro_site, normalize_irb_site
from aggregate import DEFINITIONS
from geo_bands import BAND_ORDER, emit_csv

ROOT = Path(__file__).resolve().parent.parent
LAKE = ROOT / "data"
RAW = LAKE / "raw"
CURATED = LAKE / "curated"
SNAPSHOT = ROOT / "explorer" / "public" / "data"
CHARTS = ROOT / "charts"

YEARS = list(range(2008, 2027))
VERSIONS = ["strict", "merged", "raw"]

STALE = [
    CURATED / "events_2026.parquet",
    CURATED / "daily_summary.parquet",
    SNAPSHOT / "events_2026.parquet",
    SNAPSHOT / "demo-events.csv",
]
# Curated-only tables: used by static charts/deck, never queried by the
# explorer (dead views + bytes if snapshotted).
SNAPSHOT_SKIP = {"trials_year", "trials_band", "tightness_band"}


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def stage_ingest(use_checkpoint: bool):
    stats_path = CURATED / "ingest_stats.json"
    if use_checkpoint and (CURATED / "bmis_clean.parquet").exists():
        log("loading BMIS checkpoints ...")
        df = pd.read_parquet(CURATED / "bmis_clean.parquet")
        ci_raw = pd.read_parquet(CURATED / "bmis_ci_raw.parquet")
        persons = {v: pd.read_parquet(CURATED / f"persons_{v}.parquet")
                   for v in VERSIONS}
        entities = pd.read_parquet(CURATED / "entities.parquet")
        stats = json.loads(stats_path.read_text()) if stats_path.exists() else {}
        stats["checkpoint"] = True
        return df, ci_raw, persons, entities, stats

    txt = bmis.ensure_download(RAW)
    log(f"parsing {txt.name} ...")
    t0 = time.time()
    df_all, pstats = bmis.parse_raw(txt)
    log(f"parsed {pstats['parsed_rows']:,} rows "
        f"({pstats['repaired_rows']} repaired) in {time.time()-t0:.0f}s")

    df_all, cstats = bmis.clean(df_all, dedupe=False)
    ci_raw = df_all[df_all["TYPE"] == "CI"].reset_index(drop=True)
    df = df_all.drop_duplicates(subset=bmis.COLS).reset_index(drop=True)
    cstats["exact_dupe_rows_removed"] = len(df_all) - len(df)
    del df_all
    gc.collect()
    log(f"clean: {len(df):,} rows "
        f"({cstats['exact_dupe_rows_removed']:,} exact dupes removed, "
        f"{cstats['garbage_year_rows_dropped']:,} garbage-year rows dropped)")

    ci = df[df["TYPE"] == "CI"].reset_index(drop=True)
    nonci = df[df["TYPE"] != "CI"].reset_index(drop=True)
    log(f"CI rows: {len(ci):,} | IRB/CRO/other rows: {len(nonci):,}")

    for col in ["RANK", "DEG"]:
        top = ci[col].value_counts().head(8)
        fill = (ci[col].astype(str) != "").mean() * 100
        log(f"CI {col}: {fill:.0f}% filled; top={dict(top)}")

    t0 = time.time()
    s = cluster.strict_persons(ci)
    log(f"strict: {len(s.persons):,} persons in {time.time()-t0:.0f}s")
    t0 = time.time()
    m = cluster.merged_persons(ci, s.row_pid)
    log(f"merged: {len(m.persons):,} persons in {time.time()-t0:.0f}s")
    t0 = time.time()
    r = cluster.raw_persons(ci_raw)
    log(f"raw: {len(r.persons):,} reviewer-IDs in {time.time()-t0:.0f}s")
    e = cluster.cluster_entities(nonci)
    log(f"entities (IRB/CRO): {len(e.persons):,}")

    for _c in ["pid_strict", "pid_merged", "epid"]:
        df[_c] = np.int64(-1)
    _ci_mask = (df["TYPE"] == "CI").to_numpy()
    df.loc[_ci_mask, "pid_strict"] = s.row_pid
    df.loc[_ci_mask, "pid_merged"] = m.row_pid
    df.loc[~_ci_mask, "epid"] = e.row_pid
    ci_raw["pid_raw"] = r.row_pid

    CURATED.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CURATED / "bmis_clean.parquet", index=False)
    ci_raw[["INVN", "year", "band", "pid_raw"]].to_parquet(
        CURATED / "bmis_ci_raw.parquet", index=False)
    for v, res in [("strict", s), ("merged", m), ("raw", r)]:
        res.persons.to_parquet(CURATED / f"persons_{v}.parquet", index=False)
    e.persons.to_parquet(CURATED / "entities.parquet", index=False)
    stats = {"checkpoint": False, "parse": pstats, "clean": cstats,
             "txt_file": txt.name}
    (CURATED / "ingest_stats.json").write_text(json.dumps(stats, indent=2))
    persons = {"strict": s.persons, "merged": m.persons, "raw": r.persons}
    return df, ci_raw, persons, e.persons, stats


def org_tables(nonci, entities, org_type, normalize_fn, key):
    """Year + index rollups for one BMIS org type (CRO/IRB).

    Light-rule keys materially spanning geographies (second geo >= 5%
    of receipts) are qualified by US state, or by country where state is
    NG (all foreign rows); city strings are too noisy (ST LOUIS vs SAINT
    LOUIS vs ST. LOUIS). Known-giant aliases stay global. UNKNOWN
    therefore always qualifies by state/country.
    """
    rows = nonci[nonci["TYPE"] == org_type].reset_index(drop=True)
    ent_org = entities["site"].map(normalize_fn).to_numpy()
    ent_band = entities["band"].to_numpy().astype(str)
    ent_country = entities["country"].to_numpy().astype(str)
    ent_state = entities["state"].astype(str).to_numpy()
    rows = rows.assign(
        org=ent_org[rows["epid"].to_numpy()],
        ent_band=ent_band[rows["epid"].to_numpy()],
        ent_country=ent_country[rows["epid"].to_numpy()],
        ent_state=ent_state[rows["epid"].to_numpy()],
    )
    rows["ent_geo"] = rows["ent_state"].where(
        rows["ent_state"] != "NG", rows["ent_country"])
    st_counts = rows.groupby(["org", "ent_geo"]).size()
    second_share = 1 - (st_counts.groupby("org").max()
                        / st_counts.groupby("org").sum())
    multi = set(second_share[second_share >= 0.05].index) - ALIAS_CANONICALS
    mask = rows["org"].isin(multi).to_numpy()
    rows.loc[mask, "org"] = (rows.loc[mask, "org"] + " x "
                             + rows.loc[mask, "ent_geo"])
    g = rows.groupby(["year", "ent_band", "org"], observed=True)
    year = (g.agg(n_entities=("epid", "nunique"),
                  n_receipts=("epid", "size"))
            .reset_index().rename(columns={"ent_band": "band", "org": key}))
    year["partial"] = year["year"].isin(agg.PARTIAL_YEARS)
    gi = rows.groupby("org", observed=True)
    index = pd.DataFrame({
        key: gi.size().index,
        "n_entities": gi["epid"].nunique().to_numpy(),
        "n_receipts": gi.size().to_numpy(),
        "first_year": gi["year"].min().to_numpy(),
        "last_year": gi["year"].max().to_numpy(),
        "n_countries": gi["ent_country"].nunique().to_numpy(),
        "top_country": gi["ent_country"].agg(
            lambda s: s.value_counts().index[0]).to_numpy(),
        "n_variants": gi["SITE"].nunique().to_numpy(),
        "example_site": gi["SITE"].agg(
            lambda s: s.value_counts().index[0]).to_numpy(),
    })
    return year.reset_index(drop=True), index.reset_index(drop=True)


def downcast(t: pd.DataFrame) -> pd.DataFrame:
    """Slim int64 columns to int32 where values fit (snapshot diet)."""
    for c in t.columns:
        if t[c].dtype == np.int64 and len(t):
            lo, hi = t[c].min(), t[c].max()
            if lo >= -(2 ** 31) and hi < 2 ** 31:
                t[c] = t[c].astype("int32")
    return t


def stage_aggregate(df, ci_raw, persons, entities) -> dict[str, pd.DataFrame]:
    if "site_strict" not in df.columns:
        log("site clustering (strict + merged) ...")
        _ci = df[df["TYPE"] == "CI"]
        s_codes, m_codes, sdiag = sites.cluster_sites(_ci)
        df["site_strict"] = np.int64(-1)
        df["site_merged"] = np.int64(-1)
        df.loc[_ci.index, "site_strict"] = s_codes
        df.loc[_ci.index, "site_merged"] = m_codes
        df.to_parquet(CURATED / "bmis_clean.parquet", index=False)
        log(f"site checkpoints updated: {sdiag}")
    ci = df[df["TYPE"] == "CI"].reset_index(drop=True)
    nonci = df[df["TYPE"] != "CI"].reset_index(drop=True)
    ci_disp = cluster.add_display_cols(ci)
    tables: dict[str, pd.DataFrame] = {}
    iyg, cy, sy, coh, ab, lb, rt, cc = [], [], [], [], [], [], [], []

    receipts = (ci.groupby(["year", "band"], observed=True).size()
                .rename("n_receipts").reset_index())
    receipts_raw = (ci_raw.groupby(["year", "band"], observed=True).size()
                    .rename("n_receipts").reset_index())

    pid_cols = {"strict": "pid_strict", "merged": "pid_merged"}
    for v in ["strict", "merged"]:
        p = persons[v]
        pid = ci[pid_cols[v]].to_numpy()
        py = agg.person_years(p, pid, ci["year"].to_numpy())
        iyg.append(agg.investigators_year_geo(p, py, receipts, v))
        cy.append(agg.country_year(py, v))
        sy.append(agg.us_state_year(py, v))
        coh.append(agg.cohort_summary(p, v))
        ab.append(agg.active_bins(py, v))
        rt.append(agg.retention(p, py, v))
        cc.append(agg.concentration(pid, ci["year"].to_numpy(), v))
        lb.append(agg.leaderboard(p, ci_disp, pid, v))
    # raw version runs over uncollapsed rows
    p = persons["raw"]
    pid = ci_raw["pid_raw"].to_numpy()
    py = agg.person_years(p, pid, ci_raw["year"].to_numpy())
    iyg.append(agg.investigators_year_geo(p, py, receipts_raw, "raw"))
    cy.append(agg.country_year(py, "raw"))
    sy.append(agg.us_state_year(py, "raw"))
    coh.append(agg.cohort_summary(p, "raw"))
    ab.append(agg.active_bins(py, "raw"))
    rt.append(agg.retention(p, py, "raw"))
    cc.append(agg.concentration(pid, ci_raw["year"].to_numpy(), "raw"))
    ci_raw_disp = ci_raw.copy()
    ci_raw_disp["disp_name"] = "?"
    ci_raw_disp["SITE"] = "?"
    lb.append(agg.leaderboard(p, ci_raw_disp, pid, "raw"))

    # Investigator search (strict persons only, v1)
    sp = persons["strict"]
    spid = ci["pid_strict"].to_numpy()
    idx = pd.DataFrame({
        "person_id": sp["person_id"].to_numpy(),
        "display_name": sp["display_name"].to_numpy(),
        "site": sp["site"].to_numpy(),
        "country": sp["country"].to_numpy(),
        "band": sp["band"].to_numpy(),
        "state": sp["state"].to_numpy(),
        "n_trials": sp["n_trials"].to_numpy(),
        "n_years": sp["n_years"].to_numpy(),
        "first_year": sp["first_year"].to_numpy(),
        "last_year": sp["last_year"].to_numpy(),
    })
    idx["name_key"] = (
        idx["display_name"].str.normalize("NFKD")
        .str.encode("ascii", "ignore").str.decode("ascii").str.upper()
        .str.replace(r"[^A-Z ]", "", regex=True)
        .str.replace(r"\s+", " ", regex=True).str.strip())
    keep = ~idx["name_key"].isin(["", "NG", "NG NG"])
    idx = idx[keep].reset_index(drop=True)
    keep_rows = keep.to_numpy()[spid]
    rc = pd.DataFrame({
        "pid": spid[keep_rows],
        "rcvd": pd.to_datetime(ci["RCVD_DT"][keep_rows]).dt.date,
        "site": ci["SITE"].to_numpy()[keep_rows],
        "city": ci["CITY"].to_numpy()[keep_rows],
        "state": ci["STATE"].astype(str).to_numpy()[keep_rows],
        "country": ci["COUNTRY"].astype(str).to_numpy()[keep_rows],
        "invn": ci["INVN"].to_numpy()[keep_rows],
        "site_strict": ci["site_strict"].to_numpy()[keep_rows],
        "site_merged": ci["site_merged"].to_numpy()[keep_rows],
    }).sort_values(["pid", "rcvd"], ascending=[True, False])
    rc["person_id"] = sp["person_id"].to_numpy()[rc["pid"].to_numpy()]
    tables["person_index"] = idx
    tables["person_receipts"] = rc.drop(columns=["pid"]).reset_index(drop=True)

    # CRO company + IRB board views
    tables["cro_year"], tables["cro_index"] = org_tables(
        nonci, entities, "CRO", normalize_cro_site, "cro")
    tables["irb_year"], tables["irb_index"] = org_tables(
        nonci, entities, "IRB", normalize_irb_site, "irb")

    # Site rollups (strict persons; strict + merged site versions)
    _si, _syg, _ssz, _sch = [], [], [], []
    _pid_s = ci["pid_strict"].to_numpy()
    _yr = ci["year"].to_numpy()
    _bd = ci["band"].to_numpy().astype(str)
    for _sv, _sc in [("strict", "site_strict"), ("merged", "site_merged")]:
        _codes = ci[_sc].to_numpy()
        _si.append(sites.build_site_index(ci, _codes, _pid_s, _sv))
        _a, _b, _c = sites.site_year_stats(_codes, _pid_s, _yr, _bd, _sv)
        _syg.append(_a)
        _ssz.append(_b)
        _sch.append(_c)
    tables["site_index"] = pd.concat(_si).reset_index(drop=True)
    tables["sites_year_geo"] = pd.concat(_syg).reset_index(drop=True)
    tables["site_size_year"] = pd.concat(_ssz).reset_index(drop=True)
    tables["site_churn"] = pd.concat(_sch).reset_index(drop=True)
    if ctgov_link.LOC_CACHE.exists():
        xc = ctgov_link.run(audit_n=0, write_pairs=True)
        if xc is not None and len(xc):
            tables["site_ctgov_xcheck"] = xc.reset_index(drop=True)
    if ctgov_ta.COND_CACHE.exists() and ctgov_link.LOC_CACHE.exists():
        tm = ctgov_ta.run()
        if tm is not None and len(tm):
            tables["site_ta_mix"] = tm.reset_index(drop=True)

    tables["investigators_year_geo"] = agg.reorder_bands(pd.concat(iyg))
    tables["country_year"] = pd.concat(cy).reset_index(drop=True)
    tables["us_state_year"] = pd.concat(sy).reset_index(drop=True)
    tables["cohort_summary"] = pd.concat(coh).reset_index(drop=True)
    tables["active_bins"] = pd.concat(ab).reset_index(drop=True)
    tables["retention"] = pd.concat(rt).reset_index(drop=True)
    tables["concentration"] = pd.concat(cc).reset_index(drop=True)
    tables["leaderboard"] = pd.concat(lb).reset_index(drop=True)

    # IRB/CRO context
    ent_py = (pd.DataFrame({"pid": nonci["epid"].to_numpy(),
                            "year": nonci["year"].to_numpy()})
              .drop_duplicates())
    ent_type = nonci[["epid", "TYPE"]].drop_duplicates().set_index("epid")["TYPE"]
    ent_py["type"] = ent_py["pid"].map(ent_type).astype(str)
    ent_active = (ent_py.groupby(["year", "type"]).size()
                  .rename("n_entities").reset_index())
    ent_receipts = (nonci.groupby(["year", "TYPE"], observed=True).size()
                    .rename("n_receipts").reset_index()
                    .rename(columns={"TYPE": "type"}))
    ent = ent_active.merge(ent_receipts, on=["year", "type"], how="outer")
    ent["partial"] = ent["year"].isin(agg.PARTIAL_YEARS)
    tables["irb_cro_year"] = ent.sort_values(["year", "type"]).reset_index(drop=True)

    for name, t in tables.items():
        t = downcast(t)
        tables[name] = t
        t.to_parquet(CURATED / f"{name}.parquet", index=False,
                     compression="zstd", compression_level=9)
        log(f"curated/{name}.parquet: {len(t):,} rows")
    return tables


def stage_china() -> dict[str, pd.DataFrame]:
    if not china.RAW_FILE.exists():
        log("china: raw extract absent; skipping")
        return {}
    df = china.load_china()
    tables = china.build_china_tables(df)
    for name, t in tables.items():
        t = downcast(t)
        tables[name] = t
        t.to_parquet(CURATED / f"{name}.parquet", index=False,
                     compression="zstd", compression_level=9)
        log(f"curated/{name}.parquet: {len(t):,} rows")
    return tables


def stage_people() -> dict[str, pd.DataFrame]:
    try:
        tables = ctgov_people.run(audit_n=0)
    except Exception as e:
        log(f"people: skipped ({e})")
        return {}
    for name, t in tables.items():
        t = downcast(t)
        tables[name] = t
        t.to_parquet(CURATED / f"{name}.parquet", index=False,
                     compression="zstd", compression_level=9)
        log(f"curated/{name}.parquet: {len(t):,} rows")
    return tables


def stage_ctgov(skip: bool, refresh: bool):
    starts_cache = RAW / "ctgov_starts.json"
    subset_cache = RAW / "ctgov_subset.jsonl"
    if skip:
        log("ctgov: skipped (--skip-ctgov); trials tables will be empty")
        return (pd.DataFrame(columns=["scope", "year", "n_starts", "n_running",
                                      "partial"]),
                pd.DataFrame(columns=["band", "year", "n_starts", "partial"]),
                {"skipped": True})
    s = ctgov.session()
    meta = ctgov.api_meta(s)
    log(f"ctgov: api={meta['api_version']} total={meta['stats_size']}")
    starts = ctgov.starts_yoy(s, YEARS, starts_cache, refresh)
    log(f"ctgov: starts fetched "
        f"(adj 2023={starts[(starts.scope=='adjusted') & (starts.year==2023)]['n_starts'].iloc[0]:,})")

    filt = f"{ctgov.FILTER_BASE} AND {ctgov.FILTER_US}"
    fields = ctgov.probe_sparse_fields(s, filt)
    running = pd.DataFrame({"year": YEARS, "n_running": [pd.NA] * len(YEARS)})
    diag: dict = {"sparse_fields": fields}
    if fields is None:
        log("ctgov: no sparse field selector works; running-in-year deferred "
            "(starts-only fallback per design)")
        diag["running"] = "deferred"
    else:
        recs = ctgov.fetch_subset(s, filt, fields, subset_cache, refresh)
        running, rdiag = ctgov.running_yoy(recs, YEARS)
        diag["running"] = rdiag
        log(f"ctgov: running computed from {rdiag['records_used']:,} records")

    trials = starts.merge(running, on="year", how="left")
    # running applies to adjusted scope only
    trials.loc[trials["scope"] != "adjusted", "n_running"] = pd.NA
    trials["partial"] = trials["year"] == 2026
    trials = trials.sort_values(["scope", "year"]).reset_index(drop=True)
    trials = downcast(trials)
    trials.to_parquet(CURATED / "trials_year.parquet", index=False)
    grec = ctgov_geo.fetch_global(s)
    band_tr, bdiag = ctgov_geo.band_starts(grec, YEARS)
    band_tr["partial"] = band_tr["year"] == 2026
    band_tr = downcast(band_tr)
    band_tr.to_parquet(CURATED / "trials_band.parquet", index=False)
    log(f"ctgov: band starts ({len(band_tr)} rows, "
        f"unmapped={bdiag['unmapped_total']})")
    return trials, band_tr, {"meta": meta, "diag": diag, "bands": bdiag}


def stage_tightness(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    iyg = tables["investigators_year_geo"]
    trials = tables["trials_year"]
    rows = []
    for v in VERSIONS:
        for scope in ["adjusted", "unadjusted"]:
            iv = iyg[(iyg["version"] == v)]
            inv = (iv[iv["band"] == "United States"] if scope == "adjusted"
                   else iv.groupby("year", as_index=False)["n_active"].sum())
            if scope == "adjusted":
                inv = iv[iv["band"] == "United States"][["year", "n_active"]]
            tr = trials[trials["scope"] == scope][["year", "n_starts", "n_running"]]
            m = inv.merge(tr, on="year", how="outer")
            for _, r in m.iterrows():
                na = 0 if pd.isna(r.get("n_active")) else int(r["n_active"])
                ns = 0 if pd.isna(r.get("n_starts")) else int(r["n_starts"])
                nr = None if pd.isna(r.get("n_running")) else int(r["n_running"])
                rows.append({
                    "version": v, "scope": scope, "year": int(r["year"]),
                    "investigators": na,
                    "trials_starts": ns,
                    "trials_running": nr,
                    "per_start": (na / ns if ns else None),
                    "per_running": (na / nr if nr else None),
                    "partial": bool(int(r["year"]) in agg.PARTIAL_YEARS),
                })
    tight = pd.DataFrame(rows).sort_values(["version", "scope", "year"])
    tight = downcast(tight)
    tight.to_parquet(CURATED / "tightness.parquet", index=False)
    tables["tightness"] = tight
    band_tr = tables.get("trials_band")
    if band_tr is not None and len(band_tr):
        rows_b = []
        for v in VERSIONS:
            iv = iyg[iyg["version"] == v][["year", "band", "n_active"]]
            m = iv.merge(band_tr[["band", "year", "n_starts"]],
                         on=["band", "year"], how="left")
            for _, r in m.iterrows():
                na = int(r["n_active"])
                ns = 0 if pd.isna(r["n_starts"]) else int(r["n_starts"])
                rows_b.append({
                    "version": v, "band": str(r["band"]), "year": int(r["year"]),
                    "investigators": na, "trials_starts": ns,
                    "per_start": (na / ns if ns else None),
                    "partial": bool(int(r["year"]) in agg.PARTIAL_YEARS),
                })
        tb = pd.DataFrame(rows_b).sort_values(["version", "band", "year"])
        tb = downcast(tb)
        tb.to_parquet(CURATED / "tightness_band.parquet", index=False)
        tables["tightness_band"] = tb
    return tight


def headline_stats(persons, tables) -> dict:
    s = persons["strict"]
    iyg = tables["investigators_year_geo"]
    act = {(r["version"], r["year"], r["band"]): r["n_active"]
           for _, r in iyg.iterrows()}
    us = {(v, y): act.get((v, y, "United States"), 0)
          for v in VERSIONS for y in YEARS}
    tot = {(v, y): sum(act.get((v, y, b), 0) for b in BAND_ORDER)
           for v in VERSIONS for y in YEARS}

    def growth(v, d, a=2009, b=2025):
        return round((d[(v, b)] - d[(v, a)]) / d[(v, a)] * 100, 1) \
            if d[(v, a)] else None

    return {
        "persons_ever": {v: int(len(persons[v])) for v in VERSIONS},
        "strict_one_trial_share": round(float((s["n_trials"] == 1).mean()), 4),
        "strict_median_trials": float(s["n_trials"].median()),
        "strict_mean_trials": round(float(s["n_trials"].mean()), 2),
        "active_2009_2025": {v: [tot[(v, 2009)], tot[(v, 2025)]] for v in VERSIONS},
        "active_growth_pct_09_25": {v: growth(v, tot) for v in VERSIONS},
        "us_active_2009_2025": {v: [us[(v, 2009)], us[(v, 2025)]] for v in VERSIONS},
        "us_active_growth_pct_09_25": {v: growth(v, us) for v in VERSIONS},
    }


def write_manifest(tables, persons, ingest_stats, ctgov_info, stats,
                   exports: list | None = None) -> dict:
    titles = {
        "investigators_year_geo": "Active investigators by year, band, version",
        "country_year": "Active investigators by year and country",
        "us_state_year": "Active US investigators by year and state",
        "cohort_summary": "Trials-per-person by first-seen cohort",
        "active_bins": "Active investigators by lifetime-trial bin",
        "retention": "Cohort retention: active share k years after first seen",
        "concentration": "Annual top-1%/10% receipt shares + Gini",
        "leaderboard": "Top investigators by lifetime IND references",
        "trials_year": "Industry trials by year (starts vs running)",
        "tightness": "Investigators per trial by year",
        "trials_band": "Industry starts by year and band (multi-country overlap)",
        "tightness_band": "Investigators per start by year and band",
        "cn_filing_year": "China registry by institution filing vintage",
        "cn_province_year": "China registry by province and vintage",
        "cn_specialty_year": "China registry by specialty group and vintage",
        "cn_leaderboard": "China investigators by affiliations (name-level)",
        "cn_site_index": "China institution rollup with EN names",
        "cn_person_index": "China investigator search index (pairs)",
        "cn_person_rows": "China per-investigator affiliation rows",
        "irb_cro_year": "IRB/CRO entities and receipts by year",
        "person_index": "Investigator search index (strict persons)",
        "person_receipts": "Per-investigator receipt history, newest first",
        "cro_year": "CRO receipts/entities by year, band, company",
        "cro_index": "CRO company summary with site-variant audit",
        "irb_year": "IRB receipts/entities by year, band, board",
        "irb_index": "IRB board summary with site-variant audit",
        "site_index": "Site summary: display, geo, investigators, span",
        "sites_year_geo": "Active sites by year, band, site version",
        "site_size_year": "Sites by investigator headcount bin and year",
        "site_churn": "Site roster churn: links, joins, ends by year",
        "site_ctgov_xcheck": "CT.gov institution cross-check per site (experimental)",
        "site_ta_mix": "Therapeutic-area mix of matched trials per site (experimental)",
        "ctgov_officials": "CT.gov study officials + sponsor/phase per trial (experimental)",
        "ctgov_trials": "CT.gov US industry trials: sponsor/phase/start per NCT (experimental)",
        "person_ctgov_link": "BMIS person to CT.gov trial links, tiered (experimental)",
        "site_ctgov_phase_mix": "Phase mix of matched trials per site (experimental)",
    }
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "pipeline/build.py (BMIS + CT.gov ingest)",
        "sources": {
            "bmis_file": ingest_stats.get("txt_file"),
            "bmis_through": "2026-08-31",
            "bmis_parse": ingest_stats.get("parse"),
            "bmis_clean": ingest_stats.get("clean"),
            "ctgov": ctgov_info,
            "china": {"extract": "investigator_affiliations_2026-11-06_FINAL.csv",
                      "retrieved": "2026-11-06",
                      "coverage": "Partial, with defined scope"},
        },
        "versions": {
            "strict": DEFINITIONS["person_strict"],
            "merged": DEFINITIONS["person_merged"],
            "raw": DEFINITIONS["person_raw"],
        },
        "definitions": DEFINITIONS,
        "stats": stats,
        "exports": exports or [],
        "datasets": [
            {"id": name, "title": titles[name], "format": "parquet",
             "files": [f"data/{name}.parquet"],
             "row_count": int(len(t)),
             "columns": list(t.columns)}
            for name, t in tables.items()
        ],
        "demo": {"file": "data/demo-investigators.csv",
                 "row_count": "see file"},
    }
    (LAKE / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def write_snapshot(tables, manifest) -> None:
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    for name in tables:
        if name in SNAPSHOT_SKIP:
            continue
        shutil.copy2(CURATED / f"{name}.parquet", SNAPSHOT / f"{name}.parquet")
    for name in SNAPSHOT_SKIP:
        stale = SNAPSHOT / f"{name}.parquet"
        if stale.exists():
            stale.unlink()
            log(f"removed snapshot-only skip {stale.relative_to(ROOT)}")
    snap = {**manifest, "datasets": [d for d in manifest["datasets"]
                                    if d["id"] not in SNAPSHOT_SKIP]}
    (SNAPSHOT / "manifest.json").write_text(json.dumps(snap, indent=2))
    exp_src = ROOT / "exports"
    if exp_src.exists():
        (SNAPSHOT / "exports").mkdir(exist_ok=True)
        for p in sorted(exp_src.glob(f"{deck.SLUG}.*")):
            shutil.copy2(p, SNAPSHOT / "exports" / p.name)
    demo = tables["investigators_year_geo"]
    demo = demo[(demo["version"] == "strict") & (demo["year"] >= 2008)].drop(columns=["version"])
    demo_path = SNAPSHOT / "demo-investigators.csv"
    demo.to_csv(demo_path, index=False)
    manifest["demo"]["row_count"] = len(demo)
    snap["demo"]["row_count"] = len(demo)
    (SNAPSHOT / "manifest.json").write_text(json.dumps(snap, indent=2))
    (LAKE / "manifest.json").write_text(json.dumps(manifest, indent=2))
    for stale in STALE:
        if stale.exists():
            stale.unlink()
            log(f"removed stale scaffold file {stale.relative_to(ROOT)}")


def verify_with_duckdb(tables) -> dict:
    con = duckdb.connect()
    for name in tables:
        con.execute(
            f"CREATE VIEW {name} AS SELECT * FROM read_parquet("
            f"'{(CURATED / f'{name}.parquet').as_posix()}')")
    ya, yn, yr = con.execute(
        "SELECT SUM(n_active), SUM(n_new), SUM(n_returning)"
        " FROM investigators_year_geo").fetchone()
    assert ya == yn + yr, "active != new + returning"
    lb = con.execute(
        "SELECT version, metric, scope, scope_value, COUNT(*), MIN(rank), MAX(rank)"
        " FROM leaderboard GROUP BY 1, 2, 3, 4").fetchall()
    assert all(mn == 1 and mx == n for _, _, _, _, n, mn, mx in lb), \
        "leaderboard ranks not contiguous"
    ng = con.execute(
        "SELECT COUNT(*) FROM leaderboard "
        "WHERE display_name LIKE 'NG,%' OR display_name = ''").fetchone()[0]
    assert ng == 0, "junk names in leaderboard"
    t = con.execute(
        "SELECT COUNT(*), SUM(CASE WHEN per_running > 0 THEN 1 ELSE 0 END)"
        " FROM tightness WHERE trials_running IS NOT NULL").fetchone()
    if t[0] == 0:
        log("verify: running-in-year deferred (starts-only); "
            "per_running check skipped")
    else:
        assert t[0] == t[1], "tightness ratios invalid"
    gb = con.execute(
        "SELECT COUNT(*) FROM (SELECT DISTINCT band FROM investigators_year_geo)"
    ).fetchone()[0]
    assert gb == len(BAND_ORDER), f"expected {len(BAND_ORDER)} bands, got {gb}"
    nb = con.execute(
        "SELECT COUNT(*) FROM (SELECT DISTINCT bin FROM active_bins"
        " WHERE version = 'strict')").fetchone()[0]
    assert nb == len(agg.BIN_ORDER), \
        f"expected {len(agg.BIN_ORDER)} trial bins, got {nb}"
    c_idx, c_rc, c_sum = con.execute(
        "SELECT (SELECT COUNT(*) FROM person_index),"
        " (SELECT COUNT(*) FROM person_receipts),"
        " (SELECT SUM(n_trials) FROM person_index)").fetchone()
    assert c_idx > 0 and c_rc == c_sum, \
        "person index/receipts mismatch"
    cy_sum, ci_sum, ppd = con.execute(
        "SELECT (SELECT SUM(n_receipts) FROM cro_year),"
        " (SELECT SUM(n_receipts) FROM cro_index),"
        " (SELECT COUNT(*) FROM cro_index WHERE cro = 'PPD')").fetchone()
    assert cy_sum > 0 and cy_sum == ci_sum and ppd == 1, \
        "CRO rollups inconsistent"
    iy_sum, ii_sum, adv = con.execute(
        "SELECT (SELECT SUM(n_receipts) FROM irb_year),"
        " (SELECT SUM(n_receipts) FROM irb_index),"
        " (SELECT COUNT(*) FROM irb_index WHERE irb = 'ADVARRA')").fetchone()
    assert iy_sum > 0 and iy_sum == ii_sum and adv == 1, \
        "IRB rollups inconsistent"
    r0lo, r0hi, rmax = con.execute(
        "SELECT MIN(retention), MAX(retention), "
        "(SELECT MAX(retention) FROM retention)"
        " FROM retention WHERE k = 0").fetchone()
    assert r0lo == 1.0 and r0hi == 1.0 and rmax <= 1.0, \
        "retention out of bounds"
    bad_conc = con.execute(
        "SELECT COUNT(*) FROM concentration WHERE top1_share < 0"
        " OR top1_share > top10_share OR top10_share > 1"
        " OR gini < 0 OR gini > 1").fetchone()[0]
    assert bad_conc == 0, "concentration out of bounds"
    s_idx, s_rc, s_yr = con.execute(
        "SELECT (SELECT SUM(n_receipts) FROM site_index"
        " WHERE version = 'strict'),"
        " (SELECT COUNT(*) FROM person_receipts),"
        " (SELECT SUM(n_receipts) FROM sites_year_geo"
        " WHERE version = 'strict')").fetchone()
    assert s_idx > 0 and s_idx == s_yr and s_rc <= s_idx, \
        "site rollups inconsistent (strict)"
    s_idx_m, s_yr_m = con.execute(
        "SELECT (SELECT SUM(n_receipts) FROM site_index"
        " WHERE version = 'merged'),"
        " (SELECT SUM(n_receipts) FROM sites_year_geo"
        " WHERE version = 'merged')").fetchone()
    assert s_idx_m == s_idx == s_yr_m, \
        "site rollups inconsistent (merged)"
    n_s, n_m = con.execute(
        "SELECT (SELECT COUNT(*) FROM site_index WHERE version = 'strict'),"
        " (SELECT COUNT(*) FROM site_index"
        " WHERE version = 'merged')").fetchone()
    assert n_m <= n_s, "merged sites exceed strict sites"
    if "site_ctgov_xcheck" in tables:
        x_orph = con.execute(
            "SELECT COUNT(*) FROM site_ctgov_xcheck x"
            " LEFT JOIN site_index s ON x.site_id = s.site_id"
            " WHERE s.site_id IS NULL").fetchone()[0]
        assert x_orph == 0, "xcheck sites missing from site_index"
    if "site_ta_mix" in tables:
        t_orph = con.execute(
            "SELECT COUNT(*) FROM site_ta_mix x"
            " LEFT JOIN site_index s ON x.site_id = s.site_id"
            " WHERE s.site_id IS NULL").fetchone()[0]
        assert t_orph == 0, "TA-mix sites missing from site_index"
    bu, au = con.execute(
        "SELECT (SELECT n_starts FROM trials_band"
        " WHERE band = 'United States' AND year = 2025),"
        " (SELECT n_starts FROM trials_year"
        " WHERE scope = 'adjusted' AND year = 2025)").fetchone()
    assert bu > 0 and abs(bu - au) / au < 0.02, \
        f"band US cross-foot failed ({bu} vs {au})"
    if "person_ctgov_link" in tables:
        lk_orph = con.execute(
            "SELECT COUNT(*) FROM person_ctgov_link l"
            " LEFT JOIN person_index p ON l.person_id = p.person_id"
            " WHERE p.person_id IS NULL").fetchone()[0]
        assert lk_orph == 0, "person links missing from person_index"
        lk_nct = con.execute(
            "SELECT COUNT(*) FROM (SELECT DISTINCT nct FROM person_ctgov_link)"
            " WHERE nct NOT IN (SELECT DISTINCT nct FROM ctgov_officials)").fetchone()[0]
        assert lk_nct == 0, "person links reference unknown trials"
    if "ctgov_trials" in tables:
        tr_orph = con.execute(
            "SELECT COUNT(*) FROM (SELECT DISTINCT nct FROM ctgov_officials)"
            " WHERE nct NOT IN (SELECT nct FROM ctgov_trials)").fetchone()[0]
        assert tr_orph == 0, "officials reference unknown trials"
    for mt in ("site_ctgov_phase_mix",):
        if mt in tables:
            m_orph = con.execute(
                f"SELECT COUNT(*) FROM {mt} m"
                " LEFT JOIN site_index s ON m.version = s.version"
                " AND m.site_n = s.site_n WHERE s.site_n IS NULL").fetchone()[0]
            assert m_orph == 0, f"{mt} sites missing from site_index"
    if "cn_person_rows" in tables:
        cn = con.execute(
            "SELECT (SELECT COUNT(*) FROM cn_person_rows),"
            " (SELECT SUM(n_rows) FROM cn_leaderboard),"
            " (SELECT SUM(n_rows) FROM cn_site_index),"
            " (SELECT COUNT(*) FROM cn_person_index),"
            " (SELECT SUM(n_pairs) FROM cn_site_index)").fetchone()
        assert cn[0] > 0 and cn[0] == cn[1] == cn[2], \
            "china row conservation failed"
        assert cn[4] == cn[3], "china pair conservation failed"
        cn_cum = con.execute(
            "SELECT MAX(cum_pairs) FROM cn_filing_year").fetchone()[0]
        assert cn_cum == cn[3], "china cumulative mismatch"
    check = con.execute(
        "SELECT version, SUM(n_active) FROM investigators_year_geo "
        "GROUP BY 1 ORDER BY 1").fetchall()
    return {"person_years_by_version": [[v, int(n)] for v, n in check]}


def main() -> None:
    ap = argparse.ArgumentParser(description="Build investigator-supply lake.")
    ap.add_argument("--from-checkpoint", action="store_true")
    ap.add_argument("--skip-ctgov", action="store_true")
    ap.add_argument("--refresh-ctgov", action="store_true")
    ap.add_argument("--skip-charts", action="store_true")
    args = ap.parse_args()

    t_all = time.time()
    df, ci_raw, persons, entities, ingest_stats = stage_ingest(
        args.from_checkpoint)
    log(f"ingest done in {time.time()-t_all:.0f}s")

    tables = stage_aggregate(df, ci_raw, persons, entities)
    del df, ci_raw
    gc.collect()

    trials, band_tr, ctgov_info = stage_ctgov(args.skip_ctgov, args.refresh_ctgov)
    tables["trials_year"] = trials
    tables["trials_band"] = band_tr
    tables.update(stage_china())
    tables.update(stage_people())
    stage_tightness(tables)

    stats = headline_stats(persons, tables)
    log("headline: " + json.dumps(stats, indent=None)[:600])

    emit_csv(persons["strict"]["country"].unique().tolist(),
             ROOT / "pipeline" / "geo_bands.csv")

    if not args.skip_charts:
        names = charts.build_all(tables, CHARTS)
        log(f"charts: {names}")
        dinfo = deck.build_all(stats)
        log(f"deck: {dinfo['slides']} slides")

    manifest = write_manifest(
        tables, persons, ingest_stats, ctgov_info, stats,
        exports=[{"id": "pptx", "file": f"data/exports/{deck.SLUG}.pptx",
                  "title": "Slide deck (PowerPoint)"},
                 {"id": "pdf", "file": f"data/exports/{deck.SLUG}.pdf",
                  "title": "Slide deck (PDF)"}]
        if not args.skip_charts else None)
    write_snapshot(tables, manifest)
    check = verify_with_duckdb(tables)
    log(f"verified with duckdb: {check}")
    log(f"TOTAL {time.time()-t_all:.0f}s; manifest {manifest['generated_at']}")


if __name__ == "__main__":
    main()
