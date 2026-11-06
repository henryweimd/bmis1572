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
import cluster
import ctgov
from cro import normalize_cro_site
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


def stage_aggregate(df, ci_raw, persons, entities) -> dict[str, pd.DataFrame]:
    ci = df[df["TYPE"] == "CI"].reset_index(drop=True)
    nonci = df[df["TYPE"] != "CI"].reset_index(drop=True)
    ci_disp = cluster.add_display_cols(ci)
    tables: dict[str, pd.DataFrame] = {}
    iyg, cy, sy, coh, ab, lb = [], [], [], [], [], []

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
        "zip": ci["ZIP"].astype(str).to_numpy()[keep_rows],
        "country": ci["COUNTRY"].astype(str).to_numpy()[keep_rows],
        "invn": ci["INVN"].to_numpy()[keep_rows],
    }).sort_values(["pid", "rcvd"], ascending=[True, False])
    rc["person_id"] = sp["person_id"].to_numpy()[rc["pid"].to_numpy()]
    tables["person_index"] = idx
    tables["person_receipts"] = rc.drop(columns=["pid"]).reset_index(drop=True)

    # CRO company views
    cro_rows = nonci[nonci["TYPE"] == "CRO"].reset_index(drop=True)
    ent_cro = entities["site"].map(normalize_cro_site).to_numpy()
    ent_band = entities["band"].to_numpy().astype(str)
    ent_country = entities["country"].to_numpy().astype(str)
    cro_rows = cro_rows.assign(
        cro=ent_cro[cro_rows["epid"].to_numpy()],
        ent_band=ent_band[cro_rows["epid"].to_numpy()],
        ent_country=ent_country[cro_rows["epid"].to_numpy()],
    )
    g = cro_rows.groupby(["year", "ent_band", "cro"], observed=True)
    cro_year = (g.agg(n_entities=("epid", "nunique"),
                      n_receipts=("epid", "size"))
                .reset_index().rename(columns={"ent_band": "band"}))
    cro_year["partial"] = cro_year["year"].isin(agg.PARTIAL_YEARS)
    gi = cro_rows.groupby("cro", observed=True)
    cro_index = pd.DataFrame({
        "cro": gi.size().index,
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
    tables["cro_year"] = cro_year.reset_index(drop=True)
    tables["cro_index"] = cro_index.reset_index(drop=True)

    tables["investigators_year_geo"] = agg.reorder_bands(pd.concat(iyg))
    tables["country_year"] = pd.concat(cy).reset_index(drop=True)
    tables["us_state_year"] = pd.concat(sy).reset_index(drop=True)
    tables["cohort_summary"] = pd.concat(coh).reset_index(drop=True)
    tables["active_bins"] = pd.concat(ab).reset_index(drop=True)
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
        t.to_parquet(CURATED / f"{name}.parquet", index=False)
        log(f"curated/{name}.parquet: {len(t):,} rows")
    return tables


def stage_ctgov(skip: bool, refresh: bool) -> tuple[pd.DataFrame, dict]:
    starts_cache = RAW / "ctgov_starts.json"
    subset_cache = RAW / "ctgov_subset.jsonl"
    if skip:
        log("ctgov: skipped (--skip-ctgov); trials tables will be empty")
        return pd.DataFrame(columns=["scope", "year", "n_starts", "n_running",
                                      "partial"]), {"skipped": True}
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
    trials.to_parquet(CURATED / "trials_year.parquet", index=False)
    return trials, {"meta": meta, "diag": diag}


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
    tight.to_parquet(CURATED / "tightness.parquet", index=False)
    tables["tightness"] = tight
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


def write_manifest(tables, persons, ingest_stats, ctgov_info, stats) -> dict:
    titles = {
        "investigators_year_geo": "Active investigators by year, band, version",
        "country_year": "Active investigators by year and country",
        "us_state_year": "Active US investigators by year and state",
        "cohort_summary": "Trials-per-person by first-seen cohort",
        "active_bins": "Active investigators by lifetime-trial bin",
        "leaderboard": "Top investigators by lifetime IND references",
        "trials_year": "Industry trials by year (starts vs running)",
        "tightness": "Investigators per trial by year",
        "irb_cro_year": "IRB/CRO entities and receipts by year",
        "person_index": "Investigator search index (strict persons)",
        "person_receipts": "Per-investigator receipt history, newest first",
        "cro_year": "CRO receipts/entities by year, band, company",
        "cro_index": "CRO company summary with site-variant audit",
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
        },
        "versions": {
            "strict": DEFINITIONS["person_strict"],
            "merged": DEFINITIONS["person_merged"],
            "raw": DEFINITIONS["person_raw"],
        },
        "definitions": DEFINITIONS,
        "stats": stats,
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
        shutil.copy2(CURATED / f"{name}.parquet", SNAPSHOT / f"{name}.parquet")
    (SNAPSHOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    demo = tables["investigators_year_geo"]
    demo = demo[(demo["version"] == "strict") & (demo["year"] >= 2008)].drop(columns=["version"])
    demo_path = SNAPSHOT / "demo-investigators.csv"
    demo.to_csv(demo_path, index=False)
    manifest["demo"]["row_count"] = len(demo)
    (SNAPSHOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
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

    trials, ctgov_info = stage_ctgov(args.skip_ctgov, args.refresh_ctgov)
    tables["trials_year"] = trials
    stage_tightness(tables)

    stats = headline_stats(persons, tables)
    log("headline: " + json.dumps(stats, indent=None)[:600])

    emit_csv(persons["strict"]["country"].unique().tolist(),
             ROOT / "pipeline" / "geo_bands.csv")

    if not args.skip_charts:
        names = charts.build_all(tables, CHARTS)
        log(f"charts: {names}")

    manifest = write_manifest(tables, persons, ingest_stats, ctgov_info, stats)
    write_snapshot(tables, manifest)
    check = verify_with_duckdb(tables)
    log(f"verified with duckdb: {check}")
    log(f"TOTAL {time.time()-t_all:.0f}s; manifest {manifest['generated_at']}")


if __name__ == "__main__":
    main()
