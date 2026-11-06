"""CRO company-name normalization for company-level grouping (v1).

BMIS site strings vary per filing (suffixes, slashes, punctuation), so raw
SITE fragments companies (7+ PPD spellings, 3+ Medpace spellings in the top
40 alone). v1: ASCII-fold, check evidence-based giant aliases first, else
take the segment before the first '/', strip corporate suffixes and
one-letter tokens. Residual variants stay split; a curated alias table is
parked follow-up. cro_index carries n_variants + example_site for audit.
"""

from __future__ import annotations

import re
import unicodedata

SUFFIXES = {
    "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "CORP", "CORPORATION",
    "CO", "COMPANY", "LP", "LLP", "GMBH", "AG", "SA", "SRL", "SRO", "BV",
    "NV", "PLC", "PTY", "AB", "AS", "SAS", "SARL", "SPA", "GROUPE", "GROUP",
    "HOLDINGS", "HOLDING", "INTERNATIONAL", "GLOBAL", "HQ", "CORP",
}

# (canonical, distinctive substrings) — substring match on the folded string.
# Short tokens use token match to avoid false positives (ICON vs ICONIC).
_ALIASES: list[tuple[str, list[str], bool]] = [
    ("PPD", ["PPD"], True),
    ("MEDPACE", ["MEDPACE"], False),
    ("IQVIA", ["IQVIA", "QUINTILES"], False),
    ("PRA HEALTH SCIENCES", ["PRA", "RESEARCH ASSOCIATES"], True),
    ("SYNEOS HEALTH", ["SYNEOS"], False),
    ("ICON", ["ICON"], True),
    ("PAREXEL", ["PAREXEL"], False),
    ("COVANCE", ["COVANCE"], False),
    ("CELERION", ["CELERION"], False),
    ("CHARLES RIVER", ["CHARLES RIVER"], False),
    ("FORTREA", ["FORTREA"], False),
    ("LABCORP", ["LABCORP"], False),
    ("EUROFINS", ["EUROFINS"], False),
    ("WUXI", ["WUXI"], False),
    ("THERMO FISHER", ["THERMO FISHER", "THERMOFISHER"], False),
    ("SGS", ["SGS"], True),
]

_NON = re.compile(r"[^A-Z0-9 ]")
_WS = re.compile(r"\s+")


def _fold(site: str) -> str:
    return (unicodedata.normalize("NFKD", str(site or ""))
            .encode("ascii", "ignore").decode("ascii").upper())


def normalize_cro_site(site: str) -> str:
    """Map a raw BMIS SITE string to a v1 company key."""
    s = _fold(site).strip()
    if not s or s == "NG":
        return "UNKNOWN"
    toks = set(_WS.sub(" ", _NON.sub(" ", s)).split())
    for canon, keys, token_match in _ALIASES:
        if token_match:
            hit = any((k in toks) if " " not in k else (k in s)
                      for k in keys)
        else:
            hit = any(k in s for k in keys)
        if hit:
            return canon
    # SYNEOS via legacy INC RESEARCH filings without the SYNEOS token.
    if "INC" in toks and "RESEARCH" in toks:
        return "SYNEOS HEALTH"
    first = s.split("/")[0]
    toks = [t for t in _WS.sub(" ", _NON.sub(" ", first)).split()
            if t not in SUFFIXES and len(t) > 1]
    return " ".join(toks).strip() or "UNKNOWN"
