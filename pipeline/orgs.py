"""Organization-name normalization for company/board-level grouping (v1).

BMIS site strings vary per filing (suffixes, slashes, room numbers,
punctuation), so raw SITE fragments organizations (7+ PPD spellings, 5+
WCG/Western spellings in the top rows alone). v1: ASCII-fold, check
evidence-based giant aliases first, else take the segment before the first
'/', strip stopwords/punctuation (IRB also drops room markers and pure
numbers). Residual variants stay split; the index tables carry n_variants +
example_site for audit, and a curated alias table is parked follow-up.
"""

from __future__ import annotations

import re
import unicodedata

CORP_SUFFIXES = {
    "INC", "INCORPORATED", "LLC", "LTD", "LIMITED", "CORP", "CORPORATION",
    "CO", "COMPANY", "LP", "LLP", "GMBH", "AG", "SA", "SRL", "SRO", "BV",
    "NV", "PLC", "PTY", "AB", "AS", "SAS", "SARL", "SPA", "GROUPE", "GROUP",
    "HOLDINGS", "HOLDING", "INTERNATIONAL", "GLOBAL", "HQ", "CORP",
}

IRB_STOPWORDS = CORP_SUFFIXES | {
    "IRB", "BOARD", "REVIEW", "INSTITUTIONAL", "INST", "INSTITUTION",
    "INSTITUTE", "ETHICAL", "INDEPENDENT", "COMMITTEE", "COMM",
    "PROTECTION", "PROTE", "PROTECT", "SYST",
    "HUMAN", "SUBJECTS", "SUBJ", "SUBJECT", "RES", "RESEARCH", "OFFICE",
    "PROGRAM", "PROG", "SCHOOL", "SCH", "CENTER", "CTR", "CENTRE",
    "MEDICAL", "MED", "MEDICINE", "UNIVERSITY", "UNIV", "HOSPITAL", "HOSP",
    "CLINIC", "CLINICAL", "CANCER", "HEALTH", "HLTH", "SCIENCES", "SCIENCE",
    "SCI", "SERVICES", "SERVICE", "SYSTEM", "SYSTEMS", "FOUNDATION", "FDN",
    "OF", "AT", "DE", "LA", "FOR", "THE", "AND",
    "RM", "MC", "HSB", "BLDG", "BLD", "FL", "FLOOR", "STE", "SUITE",
    "ROOM", "FWA",
}

# (canonical, keys, token_match) — token match for short keys to avoid
# false positives (ICON vs ICONIC); substring otherwise.
CRO_ALIASES: list[tuple[str, list[str], bool]] = [
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

IRB_ALIASES: list[tuple[str, list[str], bool]] = [
    ("ADVARRA", ["ADVARRA"], False),
    ("WCG", ["WCG"], True),
    ("WCG", ["WESTERN INSTITUTIONAL", "WESTERN INST", "WESTERN IRB"], False),
    ("COPERNICUS", ["COPERNICUS"], False),
    ("INTEGREVIEW", ["INTEGREVIEW"], False),
    ("SCHULMAN", ["SCHULMAN"], False),
    ("QUORUM", ["QUORUM"], False),
    ("STERLING", ["STERLING"], False),
    ("CHESAPEAKE", ["CHESAPEAKE"], False),
    ("IRB SERVICES", ["IRB SERVICES"], False),
    ("WASHINGTON UNIVERSITY", ["WASHINGTON UNIVERSITY", "WASHINGTON UNIV",
                               "WASHINGTON IN ST LOUIS"], False),
    ("UNIVERSITY OF WASHINGTON", ["UNIVERSITY OF WASHINGTON",
                                  "UNIV WASHINGTON"], False),
]

ALIAS_CANONICALS = {canon for canon, _, _ in CRO_ALIASES + IRB_ALIASES}

_NON = re.compile(r"[^A-Z0-9 ]")
_WS = re.compile(r"\s+")


def _fold(site: str) -> str:
    return (unicodedata.normalize("NFKD", str(site or ""))
            .encode("ascii", "ignore").decode("ascii").upper())


def _normalize(site: str, aliases: list[tuple[str, list[str], bool]],
               stopwords: set[str], drop_digits: bool,
               inc_research_rule: bool) -> str:
    s = _WS.sub(" ", _fold(site)).strip()
    if not s or s == "NG":
        return "UNKNOWN"
    toks = set(_WS.sub(" ", _NON.sub(" ", s)).split())
    for canon, keys, token_match in aliases:
        if token_match:
            hit = any((k in toks) if " " not in k else (k in s)
                      for k in keys)
        else:
            hit = any(k in s for k in keys)
        if hit:
            return canon
    if inc_research_rule and "INC" in toks and "RESEARCH" in toks:
        return "SYNEOS HEALTH"
    # First segment that yields a non-empty key (org name is often behind
    # a generic first segment: "IRB/UNIVERSITY OF UTAH").
    for seg in s.split("/"):
        out = []
        for t in _WS.sub(" ", _NON.sub(" ", seg)).split():
            if t in stopwords or len(t) <= 1:
                continue
            if drop_digits and t.isdigit():
                continue
            out.append(t)
        if out:
            return " ".join(out).strip()
    return "UNKNOWN"


def normalize_cro_site(site: str) -> str:
    """Map a raw BMIS SITE string to a v1 CRO company key."""
    return _normalize(site, CRO_ALIASES, CORP_SUFFIXES,
                      drop_digits=False, inc_research_rule=True)


def normalize_irb_site(site: str) -> str:
    """Map a raw BMIS SITE string to a v1 IRB board key."""
    return _normalize(site, IRB_ALIASES, IRB_STOPWORDS,
                      drop_digits=True, inc_research_rule=False)
