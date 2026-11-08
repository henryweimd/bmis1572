"""CT.gov investigator + trial-attribute extract (experimental).

Sparse fetch of US industry-interventional studies: overall officials
(name/role/affiliation) + lead sponsor + phase + timing. Officials are
STUDY-level (chairs/directors), NOT site PIs, so person linkage is
name-based with affiliation gating: coverage is thin and KOL-skewed
by construction, and weak-tier links may be name collisions.

Curated outputs:
  ctgov_officials: one row per (nct, official).
  person_ctgov_link: BMIS strict person_id <-> nct links with tier.
  site_ctgov_phase_mix: per matched site, phase counts over plausible
    trials (inherits all site_ctgov_xcheck caveats; needs
    site_ctgov_pairs from ctgov_link). No per-site sponsor mix: sponsor
    fan-out over fuzzy matches is noise; per-trial sponsor lives in
    ctgov_officials (exact) for drill-downs and global roll-ups.

Usage (from repo root):
    uv run python pipeline/ctgov_people.py [--refresh] [--audit N]
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ctgov
import ctgov_ta
from ctgov_link import LOC_FILTER

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CURATED = ROOT / "data" / "curated"
OFF_CACHE = RAW / "ctgov_officials.jsonl"
OFF_FIELDS = (
    "protocolSection.identificationModule.nctId,"
    "protocolSection.contactsLocationsModule.overallOfficials,"
    "protocolSection.sponsorCollaboratorsModule.leadSponsor,"
    "protocolSection.designModule.phases,"
    "protocolSection.statusModule.startDateStruct,"
    "protocolSection.statusModule.overallStatus"
)
PAIRS_FILE = CURATED / "site_ctgov_pairs.parquet"

_CRED = re.compile(
    r"\b(M\.?D\.?|D\.?O\.?|PH\.?D\.?|M\.?B\.?A\.?|M\.?P\.?H\.?|M\.?S\.?|"
    r"B\.?S\.?|B\.?A\.?|R\.?N\.?|N\.?P\.?|P\.?A\.?|F\.?A\.?C\.?P\.?|"
    r"F\.?A\.?C\.?C\.?|F\.?A\.?C\.?S\.?|M\.?R\.?C\.?P\.?)\b\.?", re.I)
_NONLET = re.compile(r"[^A-Z, ]")
_WS = re.compile(r"\s+")
_CORP = re.compile(
    r"\b(INC|INCORPORATED|LLC|LTD|LIMITED|CORP|CORPORATION|CO|COMPANY|"
    r"LP|LLP|PLC|AG|GMBH|SA|SAS|BV|NV|PTY|HOLDINGS|HOLDING)\.?$", re.I)
_SUFFIX = re.compile(r"\b(JR|SR|II|III|IV|V|2ND|3RD)\b\.?", re.I)
_EMAIL = re.compile(r"\S+@\S+")
_PARENS = re.compile(r"\([^)]*\)")
_ASTOP = {"THE", "AND", "OF", "FOR", "AT", "DE", "LA", "EL", "INC", "LLC",
          "LTD", "CORP", "CO", "UNIVERSITY", "UNIV", "HOSPITAL", "HOSP",
          "MEDICAL", "MED", "CENTER", "CENTRE", "CTR", "CLINIC", "HEALTH",
          "RESEARCH", "RES", "SCHOOL", "DEPARTMENT", "DEPT", "DIVISION"}


def parse_name(raw: str) -> tuple[str, str]:
    """Return (last_key, first) from a person name in either order.

    last_key is spaceless/punctless uppercase for blocking; first is the
    first given-name token (may be ''). Unparseable -> ('', '').
    """
    if not raw:
        return "", ""
    s = _SUFFIX.sub(" ", str(raw))
    s = _CRED.sub(" ", s.upper())
    s = s.replace("'", "").replace("-", " ").replace(".", " ")
    s = _WS.sub(" ", _NONLET.sub(" ", s)).strip().strip(",").strip()
    if "," in s:
        last, _, first = s.partition(",")
    else:
        parts = s.split()
        if len(parts) < 2:
            return "", ""
        *firsts, last = parts
        first = " ".join(firsts)
    last_key = _WS.sub("", last).strip()
    first_tok = (first.strip().split() or [""])[0]
    if not last_key or len(last_key) < 2:
        return "", ""
    return last_key, first_tok


def _tokens(s: str) -> set[str]:
    s = _EMAIL.sub(" ", str(s or ""))
    s = _PARENS.sub(" ", s)
    s = _CRED.sub(" ", s)
    return {t for t in _WS.sub(" ", re.sub(r"[^A-Z0-9 ]", " ", s.upper())).split()
            if len(t) >= 4 and t not in _ASTOP}


def norm_sponsor(raw: str) -> str:
    s = _WS.sub(" ", re.sub(r"[^A-Z0-9 &]", " ", str(raw or "").upper())).strip()
    s = _CORP.sub("", s).strip()
    return s or str(raw or "").upper().strip() or "UNKNOWN"


def flatten(records: list[dict]) -> tuple[pd.DataFrame, pd.DataFrame]:
    trials, offs = [], []
    for rec in records:
        try:
            ps = rec.get("protocolSection", {})
            nct = (ps.get("identificationModule", {}) or {}).get("nctId", "")
            if not nct:
                continue
            sy, _, _ = ctgov.extract_timing(rec)
            sp = ((ps.get("sponsorCollaboratorsModule", {}) or {}).get("leadSponsor", {}) or {})
            sponsor = sp.get("name", "") or "UNKNOWN"
            phases = sorted({str(p).replace("PHASE", "P") for p in
                             ((ps.get("designModule", {}) or {}).get("phases", []) or [])})
            trials.append({"nct": nct, "sponsor_raw": sponsor,
                           "sponsor": norm_sponsor(sponsor),
                           "phase": "+".join(phases) if phases else "NA",
                           "start_y": sy})
            clm = ps.get("contactsLocationsModule", {}) or {}
            for o in clm.get("overallOfficials", []) or []:
                last, first = parse_name(o.get("name", ""))
                if not last:
                    continue
                offs.append({"nct": nct, "name_raw": o.get("name", ""),
                             "last": last, "first": first,
                             "role": o.get("role", "") or "UNKNOWN",
                             "affiliation": o.get("affiliation", "") or ""})
        except Exception:
            continue
    return pd.DataFrame(trials), pd.DataFrame(offs)


def link_persons(offs: pd.DataFrame) -> pd.DataFrame:
    """Link officials to BMIS strict persons by name + affiliation overlap."""
    pi = pd.read_parquet(CURATED / "person_index.parquet",
                         columns=["person_id", "display_name", "site",
                                  "city", "state"])
    pl = [parse_name(n) for n in pi["display_name"].tolist()]
    pi = pi.assign(last=[p[0] for p in pl], first=[p[1] for p in pl])
    pi = pi[pi["last"] != ""].reset_index(drop=True)
    by_last: dict[str, list[int]] = {}
    for i, last in enumerate(pi["last"].tolist()):
        by_last.setdefault(last, []).append(i)
    site_tok = [_tokens(f"{s} {c} {st}") for s, c, st in
                zip(pi["site"].tolist(), pi["city"].tolist(),
                    pi["state"].tolist())]
    links = []
    for o in offs.itertuples():
        cands = by_last.get(o.last, [])
        if not cands:
            continue
        atok = _tokens(o.affiliation)
        for i in cands:
            pf = pi["first"].iloc[i]
            if not pf or not o.first:
                name_tier = 0
            elif pf == o.first:
                name_tier = 2
            elif pf[0] == o.first[0]:
                name_tier = 1
            else:
                continue
            ov = len(atok & site_tok[i]) if atok else -1
            if name_tier == 2 and ov >= 2:
                tier = "strong"
            elif name_tier == 2 and (ov == 1 or ov == -1):
                tier = "weak"
            elif name_tier == 1 and ov >= 2:
                tier = "weak"
            else:
                continue
            links.append({"person_id": pi["person_id"].iloc[i], "nct": o.nct,
                          "off_name": o.name_raw, "role": o.role,
                          "tier": tier, "affil_overlap": max(ov, 0),
                          "n_cands": len(cands)})
    lk = pd.DataFrame(links)
    if len(lk):
        lk = lk.sort_values(["person_id", "nct", "tier"]).reset_index(drop=True)
    return lk


def site_phase_mix(trials: pd.DataFrame) -> pd.DataFrame | None:
    if not PAIRS_FILE.exists():
        print("people: no site_ctgov_pairs.parquet; phase mix skipped")
        return None
    pairs = pd.read_parquet(PAIRS_FILE, columns=["version", "site_n", "nct"])
    disp = trials.drop_duplicates("nct").set_index("nct")
    m = pairs.merge(disp[["phase"]], left_on="nct", right_index=True,
                    how="inner")
    pm = (m.groupby(["version", "site_n", "phase"], sort=False)
          .size().rename("n_trials").reset_index())
    pm = pm.sort_values(["version", "site_n", "n_trials"],
                        ascending=[True, True, False]).reset_index(drop=True)
    return pm


def run(refresh: bool = False, audit_n: int = 10) -> dict[str, pd.DataFrame]:
    t0 = time.time()
    s = ctgov.session()
    recs = ctgov.fetch_subset(s, LOC_FILTER, OFF_FIELDS, OFF_CACHE, refresh)
    trials, offs = flatten(recs)
    print(f"people: {len(recs):,} studies -> {len(trials):,} trials, "
          f"{len(offs):,} officials ({time.time()-t0:.0f}s)")
    tables: dict[str, pd.DataFrame] = {}
    ta_map = ctgov_ta.load_cond_tas() if ctgov_ta.COND_CACHE.exists() else {}
    if len(trials):
        sdisp = (trials.groupby("sponsor")["sponsor_raw"]
                 .agg(lambda s: s.value_counts().index[0]))
        trials["sponsor_disp"] = trials["sponsor"].map(sdisp)
        trials["ta"] = trials["nct"].map(lambda n: ";".join(ta_map.get(n, [])))
        tables["ctgov_trials"] = trials[["nct", "sponsor", "sponsor_disp",
                                        "phase", "ta",
                                        "start_y"]].reset_index(drop=True)
    if len(offs):
        off = offs.merge(trials[["nct", "sponsor_raw", "sponsor", "phase", "start_y"]],
                         on="nct", how="left")
        off["sponsor_disp"] = off["sponsor_raw"]
        off["ta"] = off["nct"].map(lambda n: ";".join(ta_map.get(n, [])))
        print(f"people: TA attached to {(off['ta'] != '').mean():.1%} of officials")
        tables["ctgov_officials"] = off[["nct", "name_raw", "role", "affiliation",
                                        "sponsor", "sponsor_disp", "phase", "ta",
                                        "start_y"]].reset_index(drop=True)
        lk = link_persons(offs)
        print(f"people: {lk['person_id'].nunique():,} persons linked "
              f"({(lk['tier'] == 'strong').sum():,} strong / "
              f"{(lk['tier'] == 'weak').sum():,} weak links)")
        tables["person_ctgov_link"] = lk
        aud = (lk.groupby("tier")
               .agg(n_links=("nct", "size"),
                    n_persons=("person_id", "nunique"),
                    single_cand_share=("n_cands", lambda s: float((s == 1).mean())),
                    mean_overlap=("affil_overlap", "mean"),
                    median_cands=("n_cands", "median"))
               .reset_index())
        aud["officials_total"] = offs["nct"].count()
        aud["officials_linked"] = lk["nct"].nunique()
        tables["link_audit_summary"] = aud.reset_index(drop=True)
        if audit_n and len(lk):
            print(f"--- audit {audit_n} strong ---")
            for _, r in lk[lk["tier"] == "strong"].head(audit_n).iterrows():
                print(f"  {r['person_id'][:24]:24s} {str(r['off_name'])[:28]:28s} "
                      f"{r['role'][:16]:16s} {r['nct']} cands={r['n_cands']}")
    pm = site_phase_mix(trials)
    if pm is not None:
        tables["site_ctgov_phase_mix"] = pm
        print(f"people: phase mix covers {pm['site_n'].nunique():,} sites")
    for name, t in tables.items():
        t.to_parquet(CURATED / f"{name}.parquet", index=False)
        print(f"curated/{name}.parquet: {len(t):,} rows")
    return tables


def main() -> None:
    refresh = "--refresh" in sys.argv
    audit_n = 10
    if "--audit" in sys.argv:
        audit_n = int(sys.argv[sys.argv.index("--audit") + 1])
    run(refresh=refresh, audit_n=audit_n)


if __name__ == "__main__":
    main()
