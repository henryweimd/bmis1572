"""BMIS download, parse, and clean.

Source: FDA Bioresearch Monitoring Information System (BMIS) quarterly file.
Page: https://www.fda.gov/drugs/drug-approvals-and-databases/
      bioresearch-monitoring-information-system-bmis

Format: single ~-delimited ASCII file in a ZIP, CRLF line endings, 14 columns:
  INVN~SNAME~FNAME~MINIT~RANK~DEG~SITE~SADDR~CITY~STATE~ZIP~COUNTRY~RCVD~TYPE

Parse hazards (verified Nov 2026 on BMIS_2026_0831):
  * split on CRLF only (a few rows contain lone \\n/\\r inside fields)
  * ~308 rows contain a literal ~ inside SITE/SADDR, right-shifting the tail;
    repair by right-aligning the last 6 fields (CITY..TYPE)
  * ~1.3k rows carry garbage RCVD years (0100..2922); dropped with counts
"""

from __future__ import annotations

import zipfile
from pathlib import Path

import pandas as pd
import requests

from geo_bands import band_for

BMIS_URL = "https://www.fda.gov/media/189929/download?attachment"

COLS = [
    "INVN", "SNAME", "FNAME", "MINIT", "RANK", "DEG", "SITE", "SADDR",
    "CITY", "STATE", "ZIP", "COUNTRY", "RCVD", "TYPE",
]

# Receipt years outside this window are data-entry garbage (verified: clusters
# at years 201-219, 1900, and >2026 one-offs).
MIN_YEAR = 1980
MAX_YEAR = 2026


def ensure_download(raw_dir: Path) -> Path:
    """Download + unzip the BMIS file unless the TXT is already present."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    txts = sorted(raw_dir.glob("BMIS_*.txt"))
    if txts:
        return txts[-1]
    zpath = raw_dir / "bmis.zip"
    if not zpath.exists():
        print(f"downloading {BMIS_URL} ...")
        with requests.get(BMIS_URL, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(zpath, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.upper().endswith(".TXT")]
        assert len(names) == 1, f"expected 1 TXT in zip, got {names}"
        z.extract(names[0], raw_dir)
        return raw_dir / names[0]


def parse_raw(txt_path: Path) -> tuple[pd.DataFrame, dict]:
    """Parse the raw TXT into a DataFrame, repairing ~-shifted rows."""
    blob = txt_path.read_bytes()
    lines = blob.split(b"\r\n")
    header = lines[0].decode("latin-1")
    assert header.split("~") == COLS, f"unexpected header: {header[:120]}"

    rows: list[tuple] = []
    n_repaired = 0
    n_short = 0
    n_empty = 0
    for line in lines[1:]:
        if not line:
            n_empty += 1
            continue
        parts = line.split(b"~")
        if len(parts) == 14:
            rows.append(tuple(p.decode("latin-1") for p in parts))
        elif len(parts) > 14:
            # Literal ~ inside SITE/SADDR: right-align last 6 (CITY..TYPE).
            head6 = [p.decode("latin-1") for p in parts[:6]]
            site = parts[6].decode("latin-1")
            saddr = b"~".join(parts[7:-6]).decode("latin-1")
            tail6 = [p.decode("latin-1") for p in parts[-6:]]
            rows.append(tuple(head6 + [site, saddr] + tail6))
            n_repaired += 1
        else:
            n_short += 1
    df = pd.DataFrame(rows, columns=COLS)
    stats = {
        "physical_lines": len(lines) - 1,
        "parsed_rows": len(df),
        "repaired_rows": n_repaired,
        "short_rows_skipped": n_short,
        "empty_lines": n_empty,
    }
    return df, stats


def _norm(s: pd.Series) -> pd.Series:
    return (
        s.fillna("")
        .astype(str)
        .str.upper()
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def clean(df: pd.DataFrame, dedupe: bool = True) -> tuple[pd.DataFrame, dict]:
    """Clean rows: exact-dupe collapse, dates, garbage years, bands, keys."""
    stats: dict = {"raw_rows": len(df)}

    if dedupe:
        df = df.drop_duplicates()
    stats["exact_dupe_rows_removed"] = int(stats["raw_rows"] - len(df)) if dedupe else 0

    df["RCVD_DT"] = pd.to_datetime(df["RCVD"], format="%d-%b-%Y", errors="coerce")
    bad_date = df["RCVD_DT"].isna()
    stats["unparseable_dates"] = int(bad_date.sum())
    df = df.loc[~bad_date].copy()

    df["year"] = df["RCVD_DT"].dt.year.astype(int)
    garbage = (df["year"] < MIN_YEAR) | (df["year"] > MAX_YEAR)
    stats["garbage_year_rows_dropped"] = int(garbage.sum())
    df = df.loc[~garbage].copy()

    df["COUNTRY"] = _norm(df["COUNTRY"])
    df["band"] = df["COUNTRY"].map(band_for)
    df["STATE"] = _norm(df["STATE"])
    df["CITY"] = _norm(df["CITY"])
    df["TYPE"] = _norm(df["TYPE"])

    # Normalized clustering keys (display keeps raw values).
    df["k_sname"] = _norm(df["SNAME"])
    df["k_fname"] = _norm(df["FNAME"])
    df["k_minit"] = _norm(df["MINIT"])
    df["k_site"] = _norm(df["SITE"])
    df["k_saddr"] = _norm(df["SADDR"])
    df["k_city"] = df["CITY"]
    df["k_zip"] = _norm(df["ZIP"])

    for c in ["COUNTRY", "band", "STATE", "TYPE"]:
        df[c] = df[c].astype("category")
    stats["clean_rows"] = len(df)
    stats["year_min"] = int(df["year"].min())
    stats["year_max"] = int(df["year"].max())
    return df, stats
