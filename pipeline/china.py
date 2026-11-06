"""China CFDI investigator registry ingest.

Partial extract (coverage_type is uniformly "Partial, with defined scope")
of institution filings; filing year is the INSTITUTION's registration
vintage, not investigator activity -- there is no longitudinal signal, so
YoY reads as registry composition by vintage, never retention.

Person = (investigator_name_zh, institution_id) pair: bare names collide
across institutions (~23% do), so name-only counts are reported alongside
pair counts with the collision caveat.
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from china_i18n import (CITY_EN, PROVINCE_EN, ROLE_EN, group_specialty,
                        site_name_en)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
RAW_FILE = RAW / "china_investigators.csv"
YEAR_RE = re.compile(r"(\d{4})\d+$")

USECOLS = ["investigator_name_zh", "canonical_institution_id", "filing_number",
           "institution_name_zh", "specialty_name_zh", "role_as_reported",
           "province", "city"]


def load_china() -> pd.DataFrame:
    t0 = time.time()
    df = pd.read_csv(RAW_FILE, usecols=USECOLS, low_memory=False, dtype=str)
    df["filing_year"] = (df["filing_number"].str.extract(YEAR_RE)[0].astype(int))
    assert df["filing_year"].notna().all(), "unparsed filing years"
    assert df["filing_year"].between(2019, 2026).all(), "filing year out of range"
    df["pair_id"] = pd.factorize(
        list(zip(df["investigator_name_zh"], df["canonical_institution_id"])))[0].astype(
        "int32")
    g = df["specialty_name_zh"].map(group_specialty)
    df["group_en"] = [x[0] for x in g]
    df["group_zh"] = [x[1] for x in g]
    df["specialty_en"] = [x[2] for x in g]
    df["province_en"] = df["province"].map(PROVINCE_EN).fillna(df["province"])
    df["city_en"] = df["city"].map(CITY_EN)
    df["role_en"] = df["role_as_reported"].map(ROLE_EN).fillna(df["role_as_reported"])
    print(f"china: {len(df):,} rows, {df['pair_id'].nunique():,} pairs, "
          f"{df['investigator_name_zh'].nunique():,} names, "
          f"{df['canonical_institution_id'].nunique():,} institutions "
          f"({time.time()-t0:.0f}s)")
    other = (df["group_en"] == "Other").mean()
    print(f"china: ungrouped specialty share: {other:.3f}; "
          f"specialty_en coverage: {df['specialty_en'].notna().mean():.3f}")
    return df


def build_china_tables(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    tables: dict[str, pd.DataFrame] = {}

    fy = (df.groupby("filing_year")
          .agg(n_rows=("filing_year", "size"),
               n_pairs=("pair_id", "nunique"),
               n_institutions=("canonical_institution_id", "nunique"))
          .reset_index().rename(columns={"filing_year": "year"})
          .sort_values("year"))
    # Cumulative from first-vintage per pair/institution: a few institutions
    # filed in multiple years, so naive cumsum would double-count.
    new_pairs = df.groupby("pair_id")["filing_year"].min().value_counts()
    new_inst = df.groupby("canonical_institution_id")["filing_year"].min().value_counts()
    fy["cum_pairs"] = fy["year"].map(new_pairs).fillna(0).cumsum().astype(int)
    fy["cum_institutions"] = fy["year"].map(new_inst).fillna(0).cumsum().astype(int)
    tables["cn_filing_year"] = fy

    tables["cn_province_year"] = (
        df.groupby(["province", "province_en", "filing_year"])
        .agg(n_rows=("filing_year", "size"),
             n_pairs=("pair_id", "nunique"),
             n_institutions=("canonical_institution_id", "nunique"))
        .reset_index().rename(columns={"province": "province_zh",
                                       "filing_year": "year"})
        .sort_values(["year", "n_pairs"], ascending=[True, False]))

    tables["cn_specialty_year"] = (
        df.groupby(["group_en", "group_zh", "filing_year"])
        .agg(n_rows=("filing_year", "size"),
             n_pairs=("pair_id", "nunique"))
        .reset_index().rename(columns={"filing_year": "year"})
        .sort_values(["year", "n_pairs"], ascending=[True, False]))

    lb = (df.groupby("investigator_name_zh")
          .agg(n_rows=("filing_year", "size"),
               n_inst=("canonical_institution_id", "nunique"),
               n_spec=("specialty_name_zh", "nunique"),
               n_prov=("province", "nunique"),
               first_year=("filing_year", "min"),
               province_zh=("province", "first"))
          .reset_index().rename(columns={"investigator_name_zh": "name_zh"}))
    lb["province_en"] = lb["province_zh"].map(PROVINCE_EN).fillna(lb["province_zh"])
    tables["cn_leaderboard"] = lb.sort_values(
        ["n_rows", "n_inst"], ascending=False).reset_index(drop=True)

    g = df.groupby("canonical_institution_id", sort=False)
    names = g["institution_name_zh"].agg(lambda s: s.value_counts().index[0])
    prov = g["province"].agg(lambda s: s.value_counts().index[0])
    city = g["city"].agg(lambda s: s.value_counts().index[0] if s.notna().any() else None)
    fyear = g["filing_year"].agg(["min", "max"])
    topg = g["group_en"].agg(lambda s: s.value_counts().index[0])
    si = pd.DataFrame({
        "inst_id": names.index.to_numpy(),
        "name_zh": names.to_numpy(),
        "province_zh": prov.to_numpy(),
        "city_zh": city.to_numpy(),
        "filing_year": fyear["min"].to_numpy(),
        "filing_year_max": fyear["max"].to_numpy(),
        "n_pairs": g["pair_id"].nunique().to_numpy(),
        "n_rows": g.size().to_numpy(),
        "n_spec": g["specialty_name_zh"].nunique().to_numpy(),
        "top_group_en": topg.to_numpy(),
    })
    en_cur = [site_name_en(n, i, p) for n, i, p in
              zip(si["name_zh"], si["inst_id"], si["province_zh"])]
    si["name_en"] = [x[0] for x in en_cur]
    si["name_en_curated"] = [x[1] for x in en_cur]
    si["province_en"] = si["province_zh"].map(PROVINCE_EN).fillna(si["province_zh"])
    si["city_en"] = si["city_zh"].map(CITY_EN)
    tables["cn_site_index"] = si.sort_values("n_pairs", ascending=False).reset_index(drop=True)

    p = (df.groupby("pair_id", sort=False)
         .agg(name_zh=("investigator_name_zh", "first"),
              inst_id=("canonical_institution_id", "first"),
              inst_zh=("institution_name_zh", "first"),
              province_zh=("province", "first"),
              n_rows=("filing_year", "size"),
              n_spec=("specialty_name_zh", "nunique"),
              filing_year=("filing_year", "min"))
         .reset_index())
    en_map = dict(zip(si["inst_id"], si["name_en"]))
    p["inst_en"] = p["inst_id"].map(en_map)
    p["province_en"] = p["province_zh"].map(PROVINCE_EN).fillna(p["province_zh"])
    tables["cn_person_index"] = p.sort_values(
        ["n_rows", "name_zh"], ascending=[False, True]).reset_index(drop=True)

    rows = df[["pair_id", "filing_year", "institution_name_zh", "specialty_name_zh",
               "specialty_en", "group_en", "group_zh", "role_as_reported",
               "role_en", "province", "province_en"]].copy()
    rows = rows.rename(columns={"institution_name_zh": "inst_zh",
                                "specialty_name_zh": "specialty_zh",
                                "role_as_reported": "role_zh",
                                "province": "province_zh"})
    rows["inst_en"] = df["canonical_institution_id"].map(en_map)
    tables["cn_person_rows"] = rows.sort_values(
        ["pair_id", "filing_year"], ascending=[True, False]).reset_index(drop=True)
    return tables
