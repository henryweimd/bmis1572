"""Country -> geography band mapping for BMIS analysis.

Bands (locked in design review): United States / Europe (EU+UK) /
South America / Middle East / South Asia / East Asia & Pacific /
Rest of world / Unknown.

The mapping is published as pipeline/geo_bands.csv (via `emit_csv`) so the
band assignment for every observed COUNTRY code is auditable.
"""

from __future__ import annotations

from pathlib import Path

US = "United States"
EU = "Europe (EU+UK)"
SAM = "South America"
ME = "Middle East"
SAS = "South Asia"
EAP = "East Asia & Pacific"
REST = "Rest of world"
UNK = "Unknown"

BAND_ORDER = [US, EU, SAM, ME, SAS, EAP, REST, UNK]

# EU-27 + United Kingdom.
_EU = {
    "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
    "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
    "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "GBR",
}

_SAM = {
    "ARG", "BOL", "BRA", "CHL", "COL", "ECU", "FLK", "GUF", "GUY", "PRY",
    "PER", "SGS", "SUR", "URY", "VEN",
}

# MENA-ish: includes Egypt and Turkiye by convention (documented).
_ME = {
    "ARE", "BHR", "EGY", "IRN", "IRQ", "ISR", "JOR", "KWT", "LBN", "OMN",
    "PSE", "QAT", "SAU", "SYR", "TUR", "YEM",
}

_SAS = {"AFG", "BGD", "BTN", "IND", "LKA", "MDV", "NPL", "PAK"}

_EAP = {
    "AUS", "ASM", "BRN", "CHN", "COK", "FJI", "GUM", "HKG", "IDN", "JPN",
    "KHM", "KIR", "KOR", "LAO", "MHL", "MYS", "MMR", "MNG", "MNP", "NCL",
    "NIU", "NPL", "NRU", "NZL", "PHL", "PLW", "PNG", "PYF", "SGP", "SLB",
    "THA", "TKL", "TON", "TUV", "TWN", "VNM", "VUT", "WSM",
}
_EAP.discard("NPL")  # Nepal is South Asia, not Pacific.

_UNKNOWN_CODES = {"XXX", "", "NG", "??", "UNK"}

# NPL appears in South Asia (kept out of EAP above).
_SAS = _SAS | {"NPL"}


def band_for(code: str) -> str:
    """Map a 3-letter BMIS COUNTRY code to a geography band."""
    c = (code or "").strip().upper()
    if c in _UNKNOWN_CODES:
        return UNK
    if c == "USA":
        return US
    if c in _EU:
        return EU
    if c in _SAM:
        return SAM
    if c in _ME:
        return ME
    if c in _SAS:
        return SAS
    if c in _EAP:
        return EAP
    return REST


def emit_csv(observed_codes: list[str], path: Path) -> None:
    """Write the auditable code->band mapping for observed codes."""
    import csv

    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["country_code", "band"])
        for code in sorted(set(observed_codes)):
            w.writerow([code, band_for(code)])
