"""Site identity: address-first clustering with fuzzy consolidation (v1).

A site is a PLACE (street address), not an organization: branches of one org
at different addresses stay split; name/address spelling variants at one
address merge.

Strict site: exact normalized (street core, city, state, country), where the
street core is the ASCII-folded SADDR with suite/floor/room/building markers
(and everything after them) dropped and street suffixes expanded. ZIP is
excluded: typos fragment, and street+city+state+country is precise.

Merged site: union-find over strict keys within a (city, state, country)
block sharing an identical leading house number and street-token Jaccard >=
0.6 (0.8 when no house number). The house-number requirement keeps distinct
house numbers on one street split; the threshold keeps distinct streets
(100 FIRST ST vs 100 FIRST AVE = 0.5) split.
"""

from __future__ import annotations

import re
import time
import unicodedata

import numpy as np
import pandas as pd

SUITE_MARKERS = {
    "STE", "SUITE", "SUIT", "FL", "FLOOR", "RM", "ROOM", "BLDG", "BUILDING",
    "APT", "APARTMENT", "UNIT", "#", "SL", "STE", "FLR",
}

STREET_SUFFIXES = {
    "ST": "STREET", "AVE": "AVENUE", "AV": "AVENUE", "BLVD": "BOULEVARD",
    "DR": "DRIVE", "RD": "ROAD", "LN": "LANE", "CT": "COURT", "PL": "PLACE",
    "WAY": "WAY", "HWY": "HIGHWAY", "PKWY": "PARKWAY", "CIR": "CIRCLE",
    "TER": "TERRACE", "PIKE": "PIKE",
}

SITE_ABBREV = {
    "RES": "RESEARCH", "CTR": "CENTER", "CENT": "CENTER", "DEPT": "DEPARTMENT",
    "UNIV": "UNIVERSITY", "HOSP": "HOSPITAL", "MED": "MEDICAL",
    "CLIN": "CLINIC", "INST": "INSTITUTE", "ASSOC": "ASSOCIATES",
    "SVCS": "SERVICES", "SVC": "SERVICES", "INTL": "INTERNATIONAL",
}

_NON = re.compile(r"[^A-Z0-9 ]")
_WS = re.compile(r"\s+")
_HOUSENUM = re.compile(r"^(\d+[A-Z]?)$")


def _fold(s: str) -> str:
    return (unicodedata.normalize("NFKD", str(s or ""))
            .encode("ascii", "ignore").decode("ascii").upper())


def street_core(saddr: str) -> str:
    """Normalize a street address to its building-level core."""
    s = _fold(saddr).split("#")[0]
    toks = _WS.sub(" ", _NON.sub(" ", s)).split()
    cut = len(toks)
    for i, t in enumerate(toks):
        if t in SUITE_MARKERS:
            cut = i
            break
    toks = toks[:cut]
    toks = [STREET_SUFFIXES.get(t, t) for t in toks]
    return " ".join(toks).strip()


def site_name_key(site: str) -> str:
    """Normalize an org/site name for display comparison (not in key)."""
    toks = _WS.sub(" ", _NON.sub(" ", _fold(site))).split()
    return " ".join(SITE_ABBREV.get(t, t) for t in toks)


def _house_number(street: str) -> str:
    if not street:
        return ""
    m = _HOUSENUM.match(street.split(" ")[0])
    return m.group(1) if m else ""


def cluster_sites(ci: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, dict]:
    """Return (strict_codes, merged_codes, diag) aligned to ci rows."""
    t0 = time.time()
    street = ci["SADDR"].map(street_core)
    log_t = time.time() - t0
    tmp = pd.DataFrame({
        "street": street,
        "city": ci["k_city"].astype(str),
        "state": ci["STATE"].astype(str),
        "country": ci["COUNTRY"].astype(str),
    })
    strict = tmp.groupby(["street", "city", "state", "country"],
                         observed=True, sort=False).ngroup().to_numpy()
    n_strict = int(strict.max()) + 1

    # Union-find over strict keys within (city, state, country, house#).
    parent = np.arange(n_strict, dtype=np.int64)

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    key_tokens: dict[int, frozenset] = {}
    key_street: dict[int, str] = {}
    for sid, s in enumerate(tmp["street"]):
        code = int(strict[sid])
        if code not in key_tokens:
            key_tokens[code] = frozenset(s.split())
            key_street[code] = s
    block = (tmp["city"] + "|" + tmp["state"] + "|" + tmp["country"]).to_numpy()
    house = np.array([_house_number(s) for s in tmp["street"]])
    groups: dict[tuple, set[int]] = {}
    for i in range(len(tmp)):
        groups.setdefault((block[i], house[i]), set()).add(int(strict[i]))

    n_pairs = 0
    n_unions = 0
    n_capped = 0
    for (b, h), ids in groups.items():
        if len(ids) < 2:
            continue
        if len(ids) > 300:
            n_capped += 1
            continue
        thresh = 0.6 if h else 0.8
        ids = sorted(ids)
        for x in range(len(ids)):
            tx = key_tokens[ids[x]]
            if not tx:
                continue
            for y in range(x + 1, len(ids)):
                ty = key_tokens[ids[y]]
                if not ty:
                    continue
                n_pairs += 1
                if len(tx & ty) / len(tx | ty) >= thresh:
                    if find(ids[x]) != find(ids[y]):
                        union(ids[x], ids[y])
                        n_unions += 1
    merged = np.array([find(s) for s in strict], dtype=np.int64)
    _, merged_codes = np.unique(merged, return_inverse=True)
    print(f"sites: {n_strict:,} strict -> {int(merged_codes.max()) + 1:,} merged "
          f"({n_unions:,} unions, {n_pairs:,} pairs, {n_capped} capped blocks, "
          f"street-norm {log_t:.0f}s)")
    diag = {"n_strict": n_strict, "n_merged": int(merged_codes.max()) + 1,
            "unions": n_unions, "pairs": n_pairs, "capped": n_capped}
    return strict, merged_codes, diag


def build_site_index(ci: pd.DataFrame, codes: np.ndarray, pid: np.ndarray,
                     version: str, top_refine: int = 500) -> pd.DataFrame:
    """Per-site rollup: display, geography, investigators, span, variants."""
    sidx = np.argsort(ci["RCVD_DT"].to_numpy(), kind="stable")
    n = int(codes.max()) + 1
    first_pos = np.zeros(n, dtype=np.int64)
    seen = np.zeros(n, dtype=bool)
    for rank, c in enumerate(codes[sidx]):
        if not seen[c]:
            seen[c] = True
            first_pos[c] = sidx[rank]
    disp = ci.iloc[first_pos]
    keys = pd.Series(codes)
    inv_ever = pd.Series(pid).groupby(keys, sort=True).nunique().to_numpy()
    receipts = keys.value_counts(sort=False).sort_index().to_numpy()
    yrs = pd.Series(ci["year"].to_numpy())
    ymin = yrs.groupby(keys, sort=True).min().to_numpy()
    ymax = yrs.groupby(keys, sort=True).max().to_numpy()
    nyears = yrs.groupby(keys, sort=True).nunique().to_numpy()
    variants = (pd.Series(ci["SADDR"].to_numpy())
                .groupby(keys, sort=True).nunique().to_numpy())

    top = np.argsort(-receipts)[:top_refine]
    mask = np.isin(codes, top)
    sub = ci[mask]
    sub_codes = codes[mask]
    mode_name = (sub["SITE"].groupby(sub_codes, sort=True)
                 .agg(lambda s: s.value_counts().index[0]))
    mode_addr = (sub["SADDR"].groupby(sub_codes, sort=True)
                 .agg(lambda s: s.value_counts().index[0]))

    idx = pd.DataFrame({
        "site_n": np.arange(n),
        "site_id": [f"{version}:{i}" for i in range(n)],
        "display_name": [mode_name.get(c, disp["SITE"].iloc[k])
                         for k, c in enumerate(range(n))],
        "display_addr": [mode_addr.get(c, disp["SADDR"].iloc[k])
                         for k, c in enumerate(range(n))],
        "city": disp["CITY"].to_numpy().astype(str),
        "state": disp["STATE"].to_numpy().astype(str),
        "zip": disp["ZIP"].to_numpy().astype(str),
        "country": disp["COUNTRY"].to_numpy().astype(str),
        "band": disp["band"].to_numpy().astype(str),
        "n_inv_ever": inv_ever,
        "n_receipts": receipts,
        "first_year": ymin,
        "last_year": ymax,
        "n_years": nyears,
        "n_variants": variants,
    })
    idx["version"] = version
    return idx


def site_year_stats(codes: np.ndarray, pid: np.ndarray, year: np.ndarray,
                    band: np.ndarray, version: str):
    """Aggregate site stats without persisting per-site rows.

    Returns (sites_year_geo, site_size_year, churn_year). Per-site drill-down
    series are computed client-side from person_receipts.
    """
    tri = (pd.DataFrame({"site": codes, "pid": pid, "year": year})
           .drop_duplicates())
    site_band = (pd.DataFrame({"site": codes, "band": band})
                 .drop_duplicates("site").set_index("site")["band"])
    _raw = (pd.DataFrame({"site": codes, "year": year})
            .groupby(["site", "year"]).size().rename("n_receipts"))
    _inv = (tri.groupby(["site", "year"])["pid"].nunique().rename("n_inv"))
    per_sy = pd.concat([_inv, _raw], axis=1).reset_index()
    per_sy["band"] = per_sy["site"].map(site_band).astype(str)
    syg = (per_sy.groupby(["year", "band"], observed=True)
           .agg(n_sites=("site", "nunique"),
                n_receipts=("n_receipts", "sum")).reset_index())
    syg["version"] = version
    syg["partial"] = syg["year"].isin({2008, 2026})

    def size_bin(v: int) -> str:
        if v <= 1:
            return "1"
        if v <= 5:
            return "2-5"
        if v <= 20:
            return "6-20"
        return "21+"

    per_sy["bin"] = per_sy["n_inv"].map(size_bin)
    ssz = (per_sy.groupby(["year", "bin"]).size().rename("n_sites")
           .reset_index())
    ssz["version"] = version

    mm = tri.groupby(["site", "pid"])["year"].agg(["min", "max"]).reset_index()
    links = tri.groupby("year").size().rename("n_links")
    new = mm.groupby("min").size().rename("n_new")
    ended = mm.groupby("max").size().rename("n_ended")
    churn = pd.concat([links, new, ended], axis=1).fillna(0).astype(int)
    churn.index.name = "year"
    churn = churn.reset_index()
    churn["version"] = version
    churn["partial"] = churn["year"].isin({2008, 2026})
    return (syg[["version", "year", "band", "n_sites", "n_receipts", "partial"]],
            ssz[["version", "year", "bin", "n_sites"]],
            churn[["version", "year", "n_links", "n_new", "n_ended", "partial"]])
