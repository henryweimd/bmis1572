"""Comprehensive unit and invariant tests for the bmis1572 Python pipeline."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import aggregate as agg  # noqa: E402
import bmis  # noqa: E402
import cluster  # noqa: E402
import ctgov_people  # noqa: E402
import eu_break  # noqa: E402
import geo_bands  # noqa: E402
import movers  # noqa: E402
import orgs  # noqa: E402
import retention_decomp  # noqa: E402
import sites  # noqa: E402


# ---------------------------------------------------------------------------
# geo_bands
# ---------------------------------------------------------------------------

def test_geo_bands_assignments():
    assert geo_bands.band_for("USA") == geo_bands.US
    assert geo_bands.band_for("usa") == geo_bands.US
    assert geo_bands.band_for("GBR") == geo_bands.EU
    assert geo_bands.band_for("DEU") == geo_bands.EU
    assert geo_bands.band_for("BRA") == geo_bands.SAM
    assert geo_bands.band_for("ISR") == geo_bands.ME
    assert geo_bands.band_for("IND") == geo_bands.SAS
    assert geo_bands.band_for("NPL") == geo_bands.SAS
    assert "NPL" not in geo_bands._EAP
    assert geo_bands.band_for("CHN") == geo_bands.EAP
    assert geo_bands.band_for("JPN") == geo_bands.EAP
    assert geo_bands.band_for("CAN") == geo_bands.REST
    for unk in ("", "NG", "XXX", "??", "UNK"):
        assert geo_bands.band_for(unk) == geo_bands.UNK


# ---------------------------------------------------------------------------
# bmis parse & clean
# ---------------------------------------------------------------------------

def test_bmis_parse_and_clean(tmp_path: Path):
    header = "~".join(bmis.COLS)
    # 1) Normal row
    r1 = "1001~SMITH~JOHN~A~PI~MD~MAYO CLINIC~200 FIRST ST~ROCHESTER~MN~55905~USA~15-MAR-2020~CI"
    # 2) Exact duplicate of r1
    r2 = r1
    # 3) Tilde-shifted row (literal ~ inside SADDR)
    r3 = "1002~DOE~JANE~~PI~MD~GENERAL HOSP~100 MAIN~BLDG B~BOSTON~MA~02114~USA~01-JUN-2021~CI"
    # 4) Garbage year row (valid date outside MIN_YEAR..MAX_YEAR window)
    r4 = "1003~BAD~YEAR~~PI~MD~CLINIC~1 ST~NYC~NY~10001~USA~01-JAN-1950~CI"
    # 5) Short corrupted row
    r5 = "1004~SHORT~ROW"
    # 6) Unparseable date row
    r6 = "1005~BAD~DATE~~PI~MD~CLINIC~1 ST~NYC~NY~10001~USA~NOT-A-DATE~CI"

    txt = tmp_path / "BMIS_TEST.txt"
    txt.write_bytes(("\r\n".join([header, r1, r2, r3, r4, r5, r6, ""])).encode("latin-1"))

    df, pstats = bmis.parse_raw(txt)
    assert pstats["parsed_rows"] == 5
    assert pstats["repaired_rows"] == 1
    assert pstats["short_rows_skipped"] == 1
    assert df.loc[df["INVN"] == "1002", "SADDR"].iloc[0] == "100 MAIN~BLDG B"
    assert df.loc[df["INVN"] == "1002", "CITY"].iloc[0] == "BOSTON"

    clean_df, cstats = bmis.clean(df, dedupe=True)
    assert cstats["exact_dupe_rows_removed"] == 1
    assert cstats["unparseable_dates"] == 1
    assert cstats["garbage_year_rows_dropped"] == 1
    assert len(clean_df) == 2
    assert set(clean_df["band"].astype(str)) == {geo_bands.US}


# ---------------------------------------------------------------------------
# orgs normalization
# ---------------------------------------------------------------------------

def test_org_normalization():
    assert orgs.normalize_cro_site("PPD Development, L.P.") == "PPD"
    assert orgs.normalize_cro_site("Quintiles Transnational Corp.") == "IQVIA"
    assert orgs.normalize_cro_site("INC Research LLC") == "SYNEOS HEALTH"
    assert orgs.normalize_cro_site("ICON Clinical Research") == "ICON"
    # Token match prevents false positive on ICONIC
    assert orgs.normalize_cro_site("ICONIC THERAPEUTICS INC") != "ICON"
    assert orgs.normalize_cro_site("NG") == "UNKNOWN"
    assert orgs.normalize_cro_site("") == "UNKNOWN"

    assert orgs.normalize_irb_site("Western Institutional Review Board") == "WCG"
    assert orgs.normalize_irb_site("Advarra IRB") == "ADVARRA"
    assert orgs.normalize_irb_site("IRB/UNIVERSITY OF UTAH RM 412") == "UTAH"
    assert orgs.normalize_irb_site("Washington Univ in St Louis") == "WASHINGTON UNIVERSITY"
    assert orgs.normalize_irb_site("University of Washington") == "UNIVERSITY OF WASHINGTON"


# ---------------------------------------------------------------------------
# sites clustering & rollups
# ---------------------------------------------------------------------------

def test_street_core_and_site_clustering():
    assert sites.street_core("1515 Holcombe Blvd, Suite 400") == "1515 HOLCOMBE BOULEVARD"
    assert sites.street_core("1515 HOLCOMBE BLVD #400") == "1515 HOLCOMBE BOULEVARD"
    assert sites.site_name_key("M.D. Anderson Cancer Ctr.") == "M D ANDERSON CANCER CENTER"

    ci = pd.DataFrame({
        "SITE": ["MD ANDERSON", "MD ANDERSON", "OTHER HOSP"],
        "SADDR": ["1515 HOLCOMBE BLVD", "1515 HOLCOMBE BOULEVARD NORTH", "1515 FIRST ST"],
        "CITY": ["HOUSTON", "HOUSTON", "HOUSTON"],
        "k_city": ["HOUSTON", "HOUSTON", "HOUSTON"],
        "STATE": ["TX", "TX", "TX"],
        "COUNTRY": ["USA", "USA", "USA"],
        "band": [geo_bands.US] * 3,
        "year": [2019, 2020, 2020],
        "RCVD_DT": pd.to_datetime(["2019-01-01", "2020-01-01", "2020-02-01"]),
    })
    s_codes, m_codes, diag = sites.cluster_sites(ci)
    assert diag["n_strict"] == 3
    # 1515 HOLCOMBE BOULEVARD vs 1515 HOLCOMBE BOULEVARD NORTH -> Jaccard 3/4 = 0.75 >= 0.6 -> merged!
    # 1515 FIRST STREET stays split (Jaccard 1/5 = 0.2)
    assert m_codes[0] == m_codes[1]
    assert m_codes[0] != m_codes[2]
    assert diag["n_merged"] == 2

    idx = sites.build_site_index(ci, m_codes, np.array([0, 1, 2]), "merged")
    assert len(idx) == 2

    # Empty guard
    empty_ci = ci.iloc[0:0]
    es, em, ed = sites.cluster_sites(empty_ci)
    assert len(es) == 0 and len(em) == 0 and ed["n_strict"] == 0
    assert len(sites.build_site_index(empty_ci, es, np.empty(0, dtype=np.int64), "strict")) == 0


# ---------------------------------------------------------------------------
# person clustering
# ---------------------------------------------------------------------------

def _make_ci_df(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(records)
    for col in ["INVN", "SNAME", "FNAME", "MINIT", "RANK", "DEG", "SITE", "SADDR", "CITY", "STATE", "ZIP", "COUNTRY", "TYPE"]:
        if col not in df.columns:
            df[col] = ""
    df["TYPE"] = "CI"
    df["RCVD_DT"] = pd.to_datetime(df["RCVD"])
    df["year"] = df["RCVD_DT"].dt.year
    df["band"] = df["COUNTRY"].map(geo_bands.band_for)
    for src, dst in [("SNAME", "k_sname"), ("FNAME", "k_fname"), ("MINIT", "k_minit"),
                     ("SITE", "k_site"), ("SADDR", "k_saddr"), ("CITY", "k_city"), ("ZIP", "k_zip")]:
        df[dst] = df[src].str.upper().str.strip()
    return df


def test_person_clustering_strict_merged_and_junk():
    ci = _make_ci_df([
        # Same person at two addresses in same city -> strict=2, merged=1
        {"INVN": "1", "SNAME": "SMITH", "FNAME": "ALICE", "SITE": "CLINIC A", "SADDR": "100 MAIN ST", "CITY": "BOSTON", "STATE": "MA", "ZIP": "02114", "COUNTRY": "USA", "RCVD": "2015-01-01"},
        {"INVN": "2", "SNAME": "SMITH", "FNAME": "ALICE", "SITE": "CLINIC B", "SADDR": "200 ELM ST", "CITY": "BOSTON", "STATE": "MA", "ZIP": "02115", "COUNTRY": "USA", "RCVD": "2016-01-01"},
        # Same name in different state + different site -> stays split in merged
        {"INVN": "3", "SNAME": "SMITH", "FNAME": "ALICE", "SITE": "CLINIC C", "SADDR": "300 OAK ST", "CITY": "AUSTIN", "STATE": "TX", "ZIP": "78701", "COUNTRY": "USA", "RCVD": "2017-01-01"},
        # Junk names (NG) in same city must NEVER merge
        {"INVN": "4", "SNAME": "NG", "FNAME": "", "SITE": "CLINIC X", "SADDR": "1 ST", "CITY": "BOSTON", "STATE": "MA", "ZIP": "02114", "COUNTRY": "USA", "RCVD": "2015-01-01"},
        {"INVN": "5", "SNAME": "NG", "FNAME": "", "SITE": "CLINIC Y", "SADDR": "2 ST", "CITY": "BOSTON", "STATE": "MA", "ZIP": "02115", "COUNTRY": "USA", "RCVD": "2016-01-01"},
    ])
    strict_res = cluster.strict_persons(ci)
    assert len(strict_res.persons) == 5

    merged_res = cluster.merged_persons(ci, strict_res.row_pid)
    assert len(merged_res.persons) == 4
    assert merged_res.row_pid[0] == merged_res.row_pid[1]
    assert merged_res.row_pid[0] != merged_res.row_pid[2]
    assert merged_res.row_pid[3] != merged_res.row_pid[4]

    # Empty guard
    empty = ci.iloc[0:0]
    er = cluster.strict_persons(empty)
    assert len(er.persons) == 0
    em = cluster.merged_persons(empty, er.row_pid)
    assert len(em.persons) == 0


# ---------------------------------------------------------------------------
# retention_decomp conservation invariant
# ---------------------------------------------------------------------------

def test_retention_decomp_conservation():
    persons = pd.DataFrame({
        "first_year": [2015, 2015, 2015, 2015],
        "band": [geo_bands.US, geo_bands.US, geo_bands.US, geo_bands.US],
    })
    # pid 0: continuous 2015, 2016, 2017
    # pid 1: active 2015, missed 2016 (gapped), re-entered 2017
    # pid 2: active 2015 only (dormant in 2016, 2017)
    # pid 3: active 2015, 2016, dormant 2017
    py = pd.DataFrame({
        "pid": [0, 0, 0, 1, 1, 2, 3, 3],
        "year": [2015, 2016, 2017, 2015, 2017, 2015, 2015, 2016],
    })
    out = retention_decomp.build(persons, py, "strict")
    k1 = out[(out["cohort"] == 2015) & (out["k"] == 1)].iloc[0]
    assert k1["n_cohort"] == 4
    assert k1["n_continuous"] == 2  # pids 0, 3
    assert k1["n_reentered"] == 0
    assert k1["n_gapped_future"] == 1  # pid 1 (returns 2017)
    assert k1["n_dormant"] == 1  # pid 2

    k2 = out[(out["cohort"] == 2015) & (out["k"] == 2)].iloc[0]
    assert k2["n_continuous"] == 1  # pid 0
    assert k2["n_reentered"] == 1  # pid 1
    assert k2["n_gapped_future"] == 0
    assert k2["n_dormant"] == 2  # pids 2, 3


# ---------------------------------------------------------------------------
# movers verdicts
# ---------------------------------------------------------------------------

def test_movers_verdicts():
    persons = pd.DataFrame({
        "person_id": ["M:0", "M:1", "M:2", "M:3", "M:4", "M:5", "M:6", "M:7"],
        "display_name": [
            "MOVER, JANE", "MOVER, JANE",        # sequential -> mover-likely
            "COLLIDE, JOHN", "COLLIDE, JOHN",    # overlap across countries -> collision-likely
            "AMBIG, PAT", "AMBIG, PAT",          # overlap same country -> ambiguous
            "NG", "NG",                          # junk -> excluded
        ],
        "country": ["USA", "USA", "USA", "GBR", "USA", "USA", "USA", "USA"],
        "first_year": [2010, 2015, 2015, 2015, 2015, 2015, 2015, 2016],
        "last_year": [2012, 2018, 2018, 2018, 2018, 2018, 2015, 2016],
        "n_trials": [3, 4, 2, 2, 2, 2, 1, 1],
    })
    py = pd.DataFrame({
        "pid": [0, 1, 2, 3, 4, 5, 6, 7],
        "year": [2011, 2016, 2016, 2016, 2016, 2016, 2015, 2016],
    })
    res = movers.build(persons, py)
    cl = res["mover_cluster"].set_index("name_key")
    assert cl.loc["MOVER JANE", "verdict"] == "mover-likely"
    assert cl.loc["COLLIDE JOHN", "verdict"] == "collision-likely"
    assert cl.loc["AMBIG PAT", "verdict"] == "ambiguous"
    assert "NG" not in cl.index
    assert res["mover_summary"].iloc[0]["adj_movers_only"] == 1
    assert res["mover_summary"].iloc[0]["adj_merge_all"] == 3


# ---------------------------------------------------------------------------
# eu_break
# ---------------------------------------------------------------------------

def test_eu_break_causal_consistent_synthetic():
    rows = []
    for y in range(2009, 2026):
        eu_n = 2000 if y < 2021 else 400  # -80% drop at 2021
        for b, n in [
            (geo_bands.EU, eu_n),
            (geo_bands.US, 6000),
            (geo_bands.EAP, 1000),
            (geo_bands.SAM, 1000),
        ]:
            rows.append({"version": "merged", "year": y, "band": b, "n_active": n})
    res = eu_break.build(pd.DataFrame(rows))
    eu_main = res["eu_break_summary"]
    eu_row = eu_main[(eu_main["run"] == "2021") & (eu_main["band"] == geo_bands.EU)].iloc[0]
    assert eu_row["post_gap_n"] == pytest.approx(-1600.0, abs=1.0)
    assert eu_row["verdict"] in ("causal-consistent", "descriptive-only")


# ---------------------------------------------------------------------------
# aggregate concentration & trial_bin
# ---------------------------------------------------------------------------

def test_aggregate_helpers():
    assert agg.trial_bin(1) == "1"
    assert agg.trial_bin(7) == "7"
    assert agg.trial_bin(15) == "15+"
    assert agg.trial_bin(99) == "15+"

    # Uniform distribution -> Gini == 0
    pids = np.arange(10)
    yrs = np.full(10, 2020)
    c = agg.concentration(pids, yrs, "strict")
    assert c.iloc[0]["gini"] == pytest.approx(0.0, abs=1e-4)

    # Empty guard
    empty_c = agg.concentration(np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64), "strict")
    assert len(empty_c) == 0


# ---------------------------------------------------------------------------
# ctgov_people name parsing & sponsor normalization
# ---------------------------------------------------------------------------

def test_ctgov_people_parsing():
    assert ctgov_people.parse_name("Smith, John M.D.") == ("SMITH", "JOHN")
    assert ctgov_people.parse_name("Jane Q. Doe, Ph.D., Jr.") == ("DOE", "JANE")
    assert ctgov_people.parse_name("John Smith, M.D., Ph.D.") == ("SMITH", "JOHN")
    assert ctgov_people.parse_name("SingleWord") == ("", "")
    assert ctgov_people.norm_sponsor("Pfizer, Inc.") == "PFIZER"
    assert ctgov_people.norm_sponsor("Eli Lilly and Company") == "ELI LILLY AND"
    toks = ctgov_people._tokens("MD Anderson Cancer Center (Houston) john@mdanderson.org")
    assert "ANDERSON" in toks and "HOUSTON" not in toks
