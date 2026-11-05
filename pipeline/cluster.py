"""Person clustering for BMIS investigators (TYPE=CI).

Three sensitivity versions (locked in design review):
  * strict — person = exact match on normalized (name + site/address/country).
    Conservative: same human at two address spellings stays split.
  * merged — strict clusters unioned within a (name, country) block when they
    share a normalized site OR city+state. Catches multi-site investigators
    (e.g. one oncologist with an ID per clinic). Cross-state movers stay
    split (documented limitation); junk names (NG/blank) are never merged.
  * raw — person keyed by Reviewer ID (INVN) on un-deduplicated rows: the
    naive ID-counting bound. INVN is one-per-site-record, so this overcounts
    humans and bounds the assumption effect from above.

Exact-duplicate rows are collapsed before strict/merged (see bmis.clean).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

STRICT_KEYS = [
    "k_sname", "k_fname", "k_minit", "k_site", "k_saddr",
    "k_city", "STATE", "k_zip", "COUNTRY",
]
BLOCK_KEYS = ["k_sname", "k_fname", "k_minit", "COUNTRY"]
JUNK_NAMES = {"NG", "", "??"}

ENT_KEYS = ["TYPE", "k_site", "k_saddr", "k_city", "STATE", "k_zip", "COUNTRY"]


@dataclass
class ClusterResult:
    persons: pd.DataFrame
    # person codes aligned to the input rows (row -> persons row position)
    row_pid: np.ndarray


def add_display_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["disp_name"] = (
        df["SNAME"].fillna("").astype(str).str.strip()
        + ", "
        + df["FNAME"].fillna("").astype(str).str.strip()
        + " "
        + df["MINIT"].fillna("").astype(str).str.strip()
    ).str.replace(r"\s+", " ", regex=True).str.strip().str.rstrip(",")
    return df


def _sort_idx(df: pd.DataFrame) -> np.ndarray:
    return np.argsort(df["RCVD_DT"].to_numpy(), kind="stable")


def _aggregate(
    df_sorted: pd.DataFrame, codes_sorted: np.ndarray,
    id_prefix: str, id_col: str,
) -> pd.DataFrame:
    df_sorted = df_sorted.copy()
    df_sorted["_pid"] = codes_sorted
    g = df_sorted.groupby("_pid", sort=True)
    n = int(codes_sorted.max()) + 1
    return pd.DataFrame({
        id_col: [f"{id_prefix}:{i}" for i in range(n)],
        "display_name": g["disp_name"].first().to_numpy(),
        "deg": g["DEG"].first().to_numpy(),
        "site": g["SITE"].first().to_numpy(),
        "city": g["CITY"].first().to_numpy(),
        "state": g["STATE"].first().astype(str).to_numpy(),
        "zip": g["ZIP"].first().astype(str).to_numpy(),
        "country": g["COUNTRY"].first().astype(str).to_numpy(),
        "band": g["band"].first().astype(str).to_numpy(),
        "first_year": g["year"].min().to_numpy(),
        "last_year": g["year"].max().to_numpy(),
        "n_trials": g["year"].size().to_numpy(),
        "n_years": g["year"].nunique().to_numpy(),
    })


def _invert(sort_idx: np.ndarray, codes_sorted: np.ndarray, n: int) -> np.ndarray:
    inv = np.empty(n, dtype=np.int64)
    inv[sort_idx] = codes_sorted
    return inv


def strict_persons(ci: pd.DataFrame) -> ClusterResult:
    ci = ci.reset_index(drop=True)
    sidx = _sort_idx(ci)
    ci_sorted = add_display_cols(ci).iloc[sidx].reset_index(drop=True)
    codes = ci_sorted.groupby(STRICT_KEYS, observed=True).ngroup().to_numpy()
    persons = _aggregate(ci_sorted, codes, "S", "person_id")
    return ClusterResult(persons, _invert(sidx, codes, len(ci)))


def merged_persons(ci: pd.DataFrame, strict_inv: np.ndarray) -> ClusterResult:
    """Union strict clusters within (name, country) blocks on shared site/city."""
    ci = ci.reset_index(drop=True)
    n_strict = int(strict_inv.max()) + 1
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

    block = ci.groupby(BLOCK_KEYS, observed=True).ngroup().to_numpy()
    site_c, _ = pd.factorize(ci["k_site"])
    city_c, _ = pd.factorize(
        ci["k_city"].astype(str) + "|" + ci["STATE"].astype(str))
    sname = ci["k_sname"].to_numpy()

    groups: dict[int, list[int]] = {}
    for i, b in enumerate(block):
        groups.setdefault(int(b), []).append(i)

    n_unions = 0
    for idx in groups.values():
        if len(idx) < 2 or sname[idx[0]] in JUNK_NAMES:
            continue
        if len({int(strict_inv[i]) for i in idx}) < 2:
            continue
        by_site: dict[int, int] = {}
        by_city: dict[int, int] = {}
        for i in idx:
            s = int(strict_inv[i])
            sk, ck = int(site_c[i]), int(city_c[i])
            if sk in by_site:
                union(by_site[sk], s)
                n_unions += 1
            else:
                by_site[sk] = s
            if ck in by_city:
                union(by_city[ck], s)
                n_unions += 1
            else:
                by_city[ck] = s

    merged = np.array([find(int(s)) for s in strict_inv], dtype=np.int64)
    _, merged_inv = np.unique(merged, return_inverse=True)
    print(f"merged: {n_strict:,} strict clusters -> "
          f"{int(merged_inv.max()) + 1:,} merged ({n_unions:,} unions)")

    sidx = _sort_idx(ci)
    ci_sorted = add_display_cols(ci).iloc[sidx].reset_index(drop=True)
    persons = _aggregate(ci_sorted, merged_inv[sidx], "M", "person_id")
    return ClusterResult(persons, merged_inv)


def raw_persons(ci_raw: pd.DataFrame) -> ClusterResult:
    """Naive bound: person = Reviewer ID on un-deduplicated rows."""
    ci_raw = ci_raw.reset_index(drop=True)
    sidx = _sort_idx(ci_raw)
    ci_sorted = add_display_cols(ci_raw).iloc[sidx].reset_index(drop=True)
    codes, _ = pd.factorize(ci_sorted["INVN"])
    persons = _aggregate(ci_sorted, codes, "R", "person_id")
    return ClusterResult(persons, _invert(sidx, codes, len(ci_raw)))


def cluster_entities(non_ci: pd.DataFrame) -> ClusterResult:
    """IRB/CRO entity clustering (institutions, names intentionally blank)."""
    non_ci = non_ci.reset_index(drop=True)
    sidx = _sort_idx(non_ci)
    df_sorted = add_display_cols(non_ci).iloc[sidx].reset_index(drop=True)
    codes = df_sorted.groupby(ENT_KEYS, observed=True).ngroup().to_numpy()
    persons = _aggregate(df_sorted, codes, "E", "entity_id")
    return ClusterResult(persons, _invert(sidx, codes, len(non_ci)))
