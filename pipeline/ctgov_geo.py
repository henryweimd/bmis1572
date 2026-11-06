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
    "AND": "Andorra",
    "ANT": "Netherlands Antilles", "ARE": "United Arab Emirates",
    "ARG": "Argentina", "ARM": "Armenia", "ASM": "American Samoa",
    "AUS": "Australia",
    "AUT": "Austria", "BEL": "Belgium", "BEN": "Benin",
    "BFA": "Burkina Faso",
    "BGD": "Bangladesh", "BGR": "Bulgaria", "BHR": "Bahrain",
    "BHS": "The Bahamas",
    "BIH": "Bosnia and Herzegovina", "BLR": "Belarus", "BLZ": "Belize",
    "BMU": "Bermuda", "BOL": "Bolivia", "BRA": "Brazil",
    "BWA": "Botswana", "CAF": "Central African Republic", "CAN": "Canada",
    "CMR": "Cameroon",
    "CHE": "Switzerland", "CHL": "Chile", "CHN": "China",
    "CIV": "Côte d\u2019Ivoire", "COD": "Democratic Republic of the Congo",
    "COG": "Congo", "COL": "Colombia", "COM": "Comoros",
    "CRI": "Costa Rica", "CYM": "Cayman Islands", "CYP": "Cyprus",
    "CUB": "Cuba",
    "CZE": "Czechia", "DEU": "Germany", "DMA": "Dominica",
    "DNK": "Denmark", "DOM": "Dominican Republic", "DZA": "Algeria",
    "ECU": "Ecuador", "EGY": "Egypt", "ESH": "Western Sahara",
    "ESP": "Spain", "EST": "Estonia", "ETH": "Ethiopia",
    "FIN": "Finland", "FLK": "Falkland Islands", "FRA": "France",
    "FSM": "Micronesia, Federated States of", "GAB": "Gabon",
    "GBR": "United Kingdom", "GEO": "Georgia", "GHA": "Ghana",
    "GIN": "Guinea", "GMB": "The Gambia", "GLP": "Guadeloupe",
    "GNB": "Guinea-Bissau", "GNQ": "Equatorial Guinea",
    "GRC": "Greece", "GRD": "Grenada", "GTM": "Guatemala",
    "GUF": "French Guiana", "GUM": "Guam", "HKG": "Hong Kong",
    "HND": "Honduras", "HRV": "Croatia", "HTI": "Haiti",
    "HUN": "Hungary", "IDN": "Indonesia", "IND": "India",
    "IRL": "Ireland", "IRN": "Iran", "IRQ": "Iraq",
    "ISL": "Iceland",
    "ISR": "Israel", "ITA": "Italy", "JAM": "Jamaica",
    "JOR": "Jordan", "JPN": "Japan", "KAZ": "Kazakhstan",
    "KHM": "Cambodia",
    "KEN": "Kenya", "KIR": "Kiribati", "KNA": "Saint Kitts and Nevis",
    "KOR": "South Korea", "KWT": "Kuwait", "LAO": "Laos",
    "LBN": "Lebanon",
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
    "REU": "Reunion", "ROU": "Romania", "RUS": "Russia",
    "RWA": "Rwanda", "SAU": "Saudi Arabia",
    "SCG": "Serbia and Montenegro", "SDN": "Sudan", "SEN": "Senegal",
    "SGP": "Singapore",
    "SLE": "Sierra Leone", "SLV": "El Salvador", "SOM": "Somalia",
    "SRB": "Serbia", "SUR": "Suriname", "SVK": "Slovakia",
    "SVN": "Slovenia", "SWE": "Sweden", "SWZ": "Eswatini",
    "SYR": "Syria", "THA": "Thailand", "TKM": "Turkmenistan",
    "TTO": "Trinidad and Tobago",
    "TUN": "Tunisia", "TUR": "Turkey (T\u00fcrkiye)", "TWN": "Taiwan",
    "TZA": "Tanzania", "UGA": "Uganda", "UKR": "Ukraine",
    "URY": "Uruguay", "USA": "United States", "UZB": "Uzbekistan",
    "VEN": "Venezuela", "VIR": "Virgin Islands, U.S.",
    "VNM": "Vietnam", "VUT": "Vanuatu", "ZAF": "South Africa",
    "ZMB": "Zambia",
    "ZWE": "Zimbabwe",
}

# CT.gov name aliases with no alpha-3 of their own (band mirrors the
# corresponding code's band_for value).
EXTRA_NAME_BAND = {
    "Republic of the Congo": "Rest of world",  # = COG
    "Virgin Islands": "Rest of world",  # = VIR short form
    "Federal Republic of Yugoslavia": "Rest of world",  # legacy
}


def fetch_global(s, refresh: bool = False) -> list[dict]:
    return ctgov.fetch_subset(s, ctgov.FILTER_BASE, GLOBAL_FIELDS,
                              GLOBAL_CACHE, refresh)


def band_starts(records: list[dict], years: list[int]) -> tuple[pd.DataFrame, dict]:
    """Local band x year start counts + coverage validation."""
    from geo_bands import band_for
    name_band = {name: band_for(code) for code, name in CODE_TO_NAME.items()}
    name_band.update(EXTRA_NAME_BAND)
    rows = []
    unmapped: dict[str, int] = {}
    n_nostart = 0
    n_nocountry = 0
    for rec in records:
        sy, _, _ = ctgov.extract_timing(rec)
        if sy is None:
            n_nostart += 1
            continue
        ps = rec.get("protocolSection", {})
        locs = (ps.get("contactsLocationsModule", {}) or {}).get("locations", [])
        bands = set()
        for loc in locs or []:
            name = (loc.get("country") or "").strip()
            if not name:
                n_nocountry += 1
                continue
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
            "missing_country": n_nocountry,
            "unmapped_countries": dict(sorted(unmapped.items(),
                                              key=lambda kv: -kv[1])[:15]),
            "unmapped_total": sum(unmapped.values())}
    return out, diag
