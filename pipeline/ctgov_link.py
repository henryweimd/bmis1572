"""CT.gov institution-level cross-check (experimental).

Joins BMIS US sites to industry-interventional CT.gov studies by
(normalized city) + fuzzy facility-name match, gated on year overlap.
CT.gov facilities carry no street address, so the join is inherently
INSTITUTION x CITY, not address-level: every address of one institution
in a city shares the same plausible-trial count. Neither source carries
a person/trial join key, so output is counts -- not attribution.

Usage (from repo root):
    uv run python pipeline/ctgov_link.py [--refresh] [--audit N]

Writes data/curated/site_ctgov_xcheck.parquet (matched sites only).
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ctgov
from sites import site_name_key

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CURATED = ROOT / "data" / "curated"
LOC_CACHE = RAW / "ctgov_locations.jsonl"
LOC_FIELDS = "NCTId|StartDate|OverallStatus|LocationCity|LocationCountry|LocationFacility"
LOC_FILTER = f"{ctgov.FILTER_BASE} AND {ctgov.FILTER_US}"

_WS = re.compile(r"\s+")
_GENERIC = re.compile(r"INVESTIGATIONAL SITE|CLINICAL (TRIAL|RESEARCH) SITE"
                      r"|RESEARCH SITE( NO\.?| #)? ?\d*$")
_INDEX_STOP = {"THE", "AND", "OF", "FOR", "AT", "DE", "LA", "EL"}
_BIG_CITY = 4000  # blocks above this need 2 shared index tokens


def norm_city(s: str) -> str:
    return _WS.sub(" ", re.sub(r"[^A-Z0-9 ]", "",
                   site_name_key(s).replace(".", ""))).strip()


def idx_tokens(s: str) -> set[str]:
    return {t for t in s.split() if len(t) >= 4 and t not in _INDEX_STOP}


def flatten(records: list[dict]) -> pd.DataFrame:
    rows = []
    for rec in records:
        try:
            ps = rec.get("protocolSection", {})
            nct = ps.get("identificationModule", {}).get("nctId", "")
            sy, _, _ = ctgov.extract_timing(rec)
            locs = (ps.get("contactsLocationsModule", {}) or {}).get("locations", [])
            for loc in locs or []:
                if (loc.get("country") or "") != "United States":
                    continue
                fac = site_name_key(loc.get("facility", ""))
                if not fac or _GENERIC.search(fac):
                    continue
                rows.append({"nct": nct, "start_y": sy,
                             "city": norm_city(loc.get("city", "")),
                             "fac": fac, "fac_raw": loc.get("facility", "")})
        except Exception:
            continue
    return pd.DataFrame(rows)


def join_institutions(insts: pd.DataFrame, locs: pd.DataFrame) -> list[dict]:
    locs = locs.reset_index(drop=True)
    ftok = [frozenset(f.split()) for f in locs["fac"]]
    fidx = [idx_tokens(f) for f in locs["fac"]]
    post: dict[str, dict[str, list[int]]] = {}
    for i in range(len(locs)):
        for t in fidx[i]:
            post.setdefault(locs["city"][i], {}).setdefault(t, []).append(i)
    big = set(locs["city"].value_counts().loc[lambda v: v > _BIG_CITY].index)
    out = []
    for _, s in insts.iterrows():
        stok = set(s["key"].split())
        if not stok:
            continue
        block = post.get(s["city"], {})
        counts: dict[int, int] = {}
        for t in idx_tokens(s["key"]):
            for i in block.get(t, []):
                counts[i] = counts.get(i, 0) + 1
        need = 2 if s["city"] in big else 1
        best: dict[str, tuple] = {}
        for i, c in counts.items():
            if c < need:
                continue
            sy = locs["start_y"][i]
            if sy is not None and not (s["first_y"] - 1 <= sy <= s["last_y"] + 1):
                continue
            inter = len(stok & ftok[i])
            if inter < 2:
                continue
            j = inter / len(stok | ftok[i])
            if j < 0.34:
                continue
            nct = locs["nct"][i]
            prev = best.get(nct)
            if prev is None or j > prev[0]:
                best[nct] = (j, locs["fac_raw"][i])
        if best:
            strong = sorted([n for n, (j, _) in best.items() if j >= 0.6])
            weak = sorted([n for n, (j, _) in best.items() if j < 0.6])
            sample = (strong + weak)[:5]
            out.append({"inst": s["inst"], "n_plausible": len(best),
                        "n_strong": len(strong),
                        "best_j": round(max(j for j, _ in best.values()), 3),
                        "sample": ";".join(sample),
                        "sample_fac": best[sample[0]][1]})
    return out


def run(refresh: bool = False, audit_n: int = 30) -> pd.DataFrame | None:
    t0 = time.time()
    s = ctgov.session()
    recs = ctgov.fetch_subset(s, LOC_FILTER, LOC_FIELDS, LOC_CACHE, refresh)
    locs = flatten(recs)
    print(f"link: {len(recs):,} studies -> {len(locs):,} US location rows "
          f"({locs['city'].nunique():,} cities, {time.time()-t0:.0f}s)")
    frames = []
    for ver in ["strict", "merged"]:
        si = pd.read_parquet(CURATED / "site_index.parquet",
                             columns=["site_n", "site_id", "display_name",
                                      "city", "country", "first_year",
                                      "last_year"])
        si = si[(si["site_id"].str.startswith(f"{ver}:")) & (si["country"] == "USA")]
        si = si.assign(key=si["display_name"].map(site_name_key),
                       ncity=si["city"].map(norm_city))
        si = si[si["ncity"] != ""]
        insts = (si.groupby(["key", "ncity"], sort=False)
                 .agg(first_y=("first_year", "min"),
                      last_y=("last_year", "max"),
                      n_sites=("site_n", "size"))
                 .reset_index().rename(columns={"ncity": "city"}))
        insts.insert(0, "inst", range(len(insts)))
        t1 = time.time()
        matches = join_institutions(insts, locs)
        m = pd.DataFrame(matches)
        print(f"link: {ver}: {len(m):,}/{len(insts):,} US institutions matched "
              f"({time.time()-t1:.0f}s)")
        if len(m):
            m["version"] = ver
            m = m.merge(insts[["inst", "key", "city", "n_sites"]], on="inst")
            members = si.merge(
                m[["key", "city", "n_plausible", "n_strong", "best_j",
                   "sample", "sample_fac", "n_sites"]],
                left_on=["key", "ncity"], right_on=["key", "city"],
                how="inner")
            members["version"] = ver
            members["site_id"] = ver + ":" + members["site_n"].astype(str)
            members = members.rename(columns={"n_sites": "n_sibling_sites",
                                              "city_x": "city_raw"})
            frames.append(members[["version", "site_n", "site_id", "display_name",
                                    "n_plausible", "n_strong", "best_j", "sample",
                                    "sample_fac", "n_sibling_sites"]])
    if frames:
        xc = pd.concat(frames, ignore_index=True)
        xc.to_parquet(CURATED / "site_ctgov_xcheck.parquet", index=False)
        print(f"link: wrote site_ctgov_xcheck.parquet ({len(xc):,} rows)")
        top = xc[xc["version"] == "strict"].sort_values(
            "n_plausible", ascending=False).head(audit_n)
        print(f"--- audit top {audit_n} (strict) ---")
        for _, r in top.iterrows():
            nct0 = str(r["sample"]).split(";")[0]
            fac0 = str(r["sample_fac"])[:38]
            nm = str(r["display_name"])[:40]
            print(f"{nm:40s} | n={r['n_plausible']:4d} "
                  f"strong={r['n_strong']:4d} sib={r['n_sibling_sites']:3d} | "
                  f"{nct0} | {fac0}")
        return xc
    else:
        print("link: no matches -- check normalization")
        return None


def main() -> None:
    refresh = "--refresh" in sys.argv
    audit_n = 30
    if "--audit" in sys.argv:
        audit_n = int(sys.argv[sys.argv.index("--audit") + 1])
    run(refresh=refresh, audit_n=audit_n)


if __name__ == "__main__":
    main()
