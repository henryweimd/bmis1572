"""Integrity and schema tests against the shipped explorer/public/data snapshot."""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow.parquet as pq
import pytest

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "explorer" / "public" / "data"
MANIFEST = DATA / "manifest.json"


@pytest.fixture(scope="module")
def manifest() -> dict:
    assert MANIFEST.exists(), "manifest.json must exist in explorer/public/data"
    return json.loads(MANIFEST.read_text())


def test_manifest_datasets_exist_and_match_row_counts(manifest: dict):
    datasets = manifest.get("datasets", [])
    assert len(datasets) >= 35
    for ds in datasets:
        rel = ds["files"][0].removeprefix("data/")
        path = DATA / rel
        assert path.exists(), f"Missing snapshot file {rel}"
        if ds["format"] == "parquet":
            pf = pq.ParquetFile(path)
            assert pf.metadata.num_rows == ds["row_count"], (
                f"{ds['id']}: manifest says {ds['row_count']}, parquet has {pf.metadata.num_rows}"
            )


def test_critical_explorer_columns_exist():
    """Verify columns queried by frontend tabs exist in shipped Parquet files."""
    required = {
        "investigators_year_geo": {"version", "year", "band", "n_active", "n_new", "n_returning"},
        "cro_year": {"cro", "year", "band", "n_entities", "n_receipts"},
        "cro_index": {"cro", "n_entities", "n_receipts", "first_year", "last_year", "n_variants"},
        "irb_year": {"irb", "year", "band", "n_entities", "n_receipts"},
        "irb_index": {"irb", "n_entities", "n_receipts", "first_year", "last_year", "n_variants"},
        "org_retention": {"org_type", "cohort", "k", "n_cohort", "n_active", "retention"},
        "site_index": {"version", "site_id", "site_n", "display_name", "display_addr", "n_inv_ever", "n_receipts"},
        "site_size_year": {"version", "year", "bin", "n_sites"},
        "eu_break_band": {"run", "year", "band", "exp_n"},
        "eu_break_summary": {"run", "band", "post_gap_n", "post_gap_share", "verdict"},
        "retention_decomp": {"version", "cohort", "band", "k", "n_cohort", "n_continuous", "n_reentered", "n_gapped_future", "n_dormant"},
        "mover_cluster": {"display_name", "n_persons", "verdict", "countries", "first_year", "last_year", "n_trials"},
        "mover_summary": {"n_clusters", "n_mover_likely", "n_collision_likely", "n_ambiguous", "adj_merge_all", "adj_movers_only"},
        "who_global": {"records", "trials"},
        "who_country": {"country", "band", "records", "trials"},
        "who_country_year": {"country", "year", "records", "trials"},
        "cn_site_index": {"inst_id", "name_zh", "name_en", "name_en_curated", "n_pairs", "n_rows"},
    }
    for name, cols in required.items():
        schema_cols = set(pq.read_schema(DATA / f"{name}.parquet").names)
        missing = cols - schema_cols
        assert not missing, f"{name}.parquet missing columns: {missing}"


def test_retention_decomp_shipped_conservation():
    df = pq.read_table(DATA / "retention_decomp.parquet").to_pandas()
    tot = df["n_continuous"] + df["n_reentered"] + df["n_gapped_future"] + df["n_dormant"]
    assert (tot == df["n_cohort"]).all(), "Shipped retention_decomp violates partition conservation"


def test_who_and_site_invariants():
    wg = pq.read_table(DATA / "who_global.parquet").to_pandas()
    assert len(wg) == 1
    assert wg.iloc[0]["records"] >= wg.iloc[0]["trials"] > 1_000_000

    ssz = pq.read_table(DATA / "site_size_year.parquet").to_pandas()
    assert set(ssz["bin"].unique()).issubset({"1", "2-5", "6-20", "21+"})

    eu = pq.read_table(DATA / "eu_break_summary.parquet").to_pandas()
    main_eu = eu[(eu["run"] == "2021") & (eu["band"] == "Europe (EU+UK)")]
    assert len(main_eu) == 1
    assert main_eu.iloc[0]["verdict"] in ("causal-consistent", "descriptive-only")
