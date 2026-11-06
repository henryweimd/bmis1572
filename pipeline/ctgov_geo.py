"""CT.gov per-band trial counts (starts only; running stays US-only).

One global industry-interventional sparse fetch (NCTId|StartDate|LocationCountry,
cached) powers exact local band x year start counts. Bands come from
geo_bands.csv via BMIS alpha-3 codes; CODE_TO_NAME bridges to CT.gov
LocationCountry spellings. Multi-country trials count in every band they
touch (documented overlap: bands do not sum to global).

Validation: every observed LocationCountry must resolve to a band;
unmapped names are reported (not silently dropped).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ctgov

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
GLOBAL_CACHE = RAW / "ctgov_global.jsonl"
GLOBAL_FIELDS = "NCTId|StartDate|LocationCountry"

# BMIS alpha-3 -> clinicaltrials.gov LocationCountry spelling.
CODE_TO_NAME = {
    "ABW": "Aruba", "AFG": "Afghanistan", "ALB": "Albania",
    "ANT": "Netherlands Antilles", "ARE": "United Arab Emirates",
    "ARG": "Argentina", "ARM": "Armenia", "AUS": "Australia",
    "AUT": "Austria", "BEL": "Belgium", "BFA": "Burkina Faso",
    "BGD": "Bangladesh", "BGR": "Bulgaria", "BHS": "Bahamas",
    "BIH": "Bosnia and Herzegovina", "BLR": "Belarus", "BLZ": "Belize",
    "BMU": "Bermuda", "BOL": "Bolivia", "BRA": "Brazil",
    "BWA": "Botswana", "CAF": "Central African Republic", "CAN": "Canada",
    "CHE": "Switzerland", "CHL": "Chile", "CHN": "China",
    "CIV": "Cote d'Ivoire", "COD": "Congo, Democratic Republic of the",
    "COG": "Congo", "COL": "Colombia", "COM": "Comoros",
    "CRI": "Costa Rica", "CYM": "Cayman Islands", "CYP": "Cyprus",
    "CZE": "Czech Republic", "DEU": "Germany", "DMA": "Dominica",
    "DNK": "Denmark", "DOM": "Dominican Republic", "DZA": "Algeria",
    "ECU": "Ecuador", "EGY": "Egypt", "ESH": "Western Sahara",
    "ESP": "Spain", "EST": "Estonia", "ETH": "Ethiopia",
    "FIN": "Finland", "FLK": "Falkland Islands", "FRA": "France",
    "FSM": "Micronesia, Federated States of", "GAB": "Gabon",
    "GBR": "United Kingdom", "GEO": "Georgia", "GHA": "Ghana",
    "GIN": "Guinea", "GMB": "Gambia", "GNB": "Guinea-Bissau",
    "GRC": "Greece", "GRD": "Grenada", "GTM": "Guatemala",
    "GUF": "French Guiana", "GUM": "Guam", "HKG": "Hong Kong",
    "HND": "Honduras", "HRV": "Croatia", "HTI": "Haiti",
    "HUN": "Hungary", "IDN": "Indonesia", "IND": "India",
    "IRL": "Ireland", "IRN": "Iran", "ISL": "Iceland",
    "ISR": "Israel", "ITA": "Italy", "JAM": "Jamaica",
    "JOR": "Jordan", "JPN": "Japan", "KAZ": "Kazakhstan",
    "KEN": "Kenya", "KIR": "Kiribati", "KNA": "Saint Kitts and Nevis",
    "KOR": "Korea, Republic of", "KWT": "Kuwait", "LBN": "Lebanon",
    "LBR": "Liberia", "LIE": "Liechtenstein", "LKA": "Sri Lanka",
    "LSO": "Lesotho", "LTU": "Lithuania", "LUX": "Luxembourg",
    "LVA": "Latvia", "MAR": "Morocco", "MCO": "Monaco",
    "MDA": "Moldova", "MDG": "Madagascar", "MEX": "Mexico",
    "MKD": "North Macedonia", "MLI": "Mali", "MLT": "Malta",
    "MMR": "Myanmar", "MNE": "Montenegro", "MNG": "Mongolia",
    "MOZ": "Mozambique", "MRT": "Mauritania", "MTQ": "Martinique",
    "MUS": "Mauritius", "MWI": "Malawi", "MYS": "Malaysia",
    "NAM": "Namibia", "NCL": "New Caledonia", "NER": "Niger",
    "NFK": "Norfolk Island", "NGA": "Nigeria", "NIC": "Nicaragua",
    "NIU": "Niue", "NLD": "Netherlands", "NOR": "Norway",
    "NPL": "Nepal", "NZL": "New Zealand", "OMN": "Oman",
    "PAK": "Pakistan", "PAN": "Panama", "PCN": "Pitcairn",
    "PER": "Peru", "PHL": "Philippines", "POL": "Poland",
    "PRI": "Puerto Rico", "PRK": "Korea, Democratic People's Republic of",
    "PRT": "Portugal", "PRY": "Paraguay", "QAT": "Qatar",
    "REU": "Reunion", "ROU": "Romania", "RUS": "Russian Federation",
    "RWA": "Rwanda", "SAU": "Saudi Arabia",
    "SCG": "Serbia and Montenegro", "SDN": "Sudan", "SGP": "Singapore",
    "SLE": "Sierra Leone", "SLV": "El Salvador", "SOM": "Somalia",
    "SRB": "Serbia", "SUR": "Suriname", "SVK": "Slovakia",
    "SVN": "Slovenia", "SWE": "Sweden", "SWZ": "Eswatini",
    "SYR": "Syria", "THA": "Thailand", "TKM": "Turkmenistan",
    "TUN": "Tunisia", "TUR": "Turkey", "TWN": "Taiwan",
    "TZA": "Tanzania", "UGA": "Uganda", "UKR": "Ukraine",
    "URY": "Uruguay", "USA": "United States", "UZB": "Uzbekistan",
    "VEN": "Venezuela", "VIR": "Virgin Islands, U.S.",
    "VNM": "Vietnam", "ZAF": "South Africa", "ZMB": "Zambia",
    "ZWE": "Zimbabwe",
}


def fetch_global(s, refresh: bool = False) -> list[dict]:
    return ctgov.fetch_subset(s, ctgov.FILTER_BASE, GLOBAL_FIELDS,
                              GLOBAL_CACHE, refresh)


def band_starts(records: list[dict], years: list[int]) -> tuple[pd.DataFrame, dict]:
    """Local band x year start counts + coverage validation."""
    import csv as _csv
    code_band = {}
    with open(ROOT / "pipeline" / "geo_bands.csv") as f:
        for row in _csv.DictReader(f):
            code_band[row["country_code"]] = row["band"]
    name_band = {CODE_TO_NAME[c]: b for c, b in code_band.items()
                 if c in CODE_TO_NAME}
    rows = []
    unmapped: dict[str, int] = {}
    n_nostart = 0
    for rec in records:
        sy, _, _ = ctgov.extract_timing(rec)
        if sy is None:
            n_nostart += 1
            continue
        ps = rec.get("protocolSection", {})
        locs = (ps.get("contactsLocationsModule", {}) or {}).get("locations", [])
        bands = set()
        for loc in locs or []:
            name = loc.get("country", "")
            b = name_band.get(name)
            if b is None:
                unmapped[name] = unmapped.get(name, 0) + 1
            elif b != "Unknown":
                bands.add(b)
        for b in bands:
            rows.append({"band": b, "year": sy})
    df = pd.DataFrame(rows)
    out = (df[df["year"].isin(years)].groupby(["band", "year"]).size()
           .rename("n_starts").reset_index()) if len(df) else pd.DataFrame(
               columns=["band", "year", "n_starts"])
    diag = {"records": len(records), "missing_start": n_nostart,
            "unmapped_countries": dict(sorted(unmapped.items(),
                                              key=lambda kv: -kv[1])[:15]),
            "unmapped_total": sum(unmapped.values())}
    return out, diag
