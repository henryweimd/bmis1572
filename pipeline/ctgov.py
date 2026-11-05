"""clinicaltrials.gov Data API v2 client for the trial-demand benchmark.

Scopes (locked in design review):
  * unadjusted — interventional + industry lead sponsor, global, by StartDate
  * adjusted   — unadjusted + >=1 US site (LocationCountry), by StartDate
Counts additionally computed for running-in-year (start <= Y, completion >= Y
or missing-with-active-status) from a cached sparse-field subset fetch.

API: https://clinicaltrials.gov/data-api/api (no key). YoY start counts need
one cheap query per year; the running subset pages full records sparsely.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter, Retry

BASE = "https://clinicaltrials.gov/api/v2"

STATUS_ACTIVE = {
    "NOT_YET_RECRUITING",
    "RECRUITING",
    "ENROLLING_BY_INVITATION",
    "ACTIVE_NOT_RECRUITING",
    "AVAILABLE",
    "UNKNOWN",
}

FILTER_BASE = "AREA[StudyType]INTERVENTIONAL AND AREA[LeadSponsorClass]INDUSTRY"
FILTER_US = 'AREA[LocationCountry]"United States"'


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = "bmis-supply-analysis/1.0 (research)"
    retry = Retry(total=5, backoff_factor=2.0,
                  status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=["GET"])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def api_meta(s: requests.Session) -> dict:
    v = s.get(f"{BASE}/version", timeout=60).json()
    size = s.get(f"{BASE}/stats/size", timeout=60).json()
    return {"api_version": v, "stats_size": size}


def count_studies(s: requests.Session, filter_advanced: str) -> int:
    params = {
        "filter.advanced": filter_advanced,
        "pageSize": 1,
        "countTotal": "true",
        "fields": "NCTId",
    }
    r = s.get(f"{BASE}/studies", params=params, timeout=120)
    r.raise_for_status()
    return int(r.json()["totalCount"])


def starts_yoy(
    s: requests.Session, years: list[int], cache_path: Path,
    refresh: bool = False,
) -> pd.DataFrame:
    """Yearly industry-interventional starts, both scopes (cached)."""
    cached: dict = {}
    if cache_path.exists() and not refresh:
        cached = json.loads(cache_path.read_text())
    rows = []
    for scope, extra in [
        ("unadjusted", ""),
        ("adjusted", f" AND {FILTER_US}"),
    ]:
        for y in years:
            key = f"{scope}:{y}"
            if key in cached:
                n = cached[key]
            else:
                f = f"{FILTER_BASE}{extra} AND AREA[StartDate]RANGE[{y}-01-01,{y}-12-31]"
                n = count_studies(s, f)
                cached[key] = n
                cache_path.write_text(json.dumps(cached, indent=1))
                time.sleep(0.4)  # stay well under community rate guidance
            rows.append({"scope": scope, "year": y, "n_starts": n})
    return pd.DataFrame(rows)


def _year_of(datestr: str | None) -> int | None:
    if not datestr or len(datestr) < 4 or not datestr[:4].isdigit():
        return None
    return int(datestr[:4])


def extract_timing(rec: dict) -> tuple[int | None, int | None, str]:
    """Return (start_year, completion_year, STATUS) from a study record."""
    ps = rec.get("protocolSection", {}) if isinstance(rec, dict) else {}
    sm = ps.get("statusModule", {}) if isinstance(ps, dict) else {}
    start = ((sm.get("startDateStruct", {}) or {}).get("date")
             or rec.get("StartDate"))
    comp = ((sm.get("completionDateStruct", {}) or {}).get("date")
            or rec.get("CompletionDate"))
    status = sm.get("overallStatus") or rec.get("OverallStatus") or ""
    return _year_of(start), _year_of(comp), str(status).upper()


def probe_sparse_fields(s: requests.Session, filter_advanced: str) -> str | None:
    """Find a working sparse `fields` selector; None => full records needed."""
    candidates = [
        "NCTId|StartDate|CompletionDate|OverallStatus",
        "NCTId,StartDate,CompletionDate,OverallStatus",
        "protocolSection.statusModule.startDateStruct.startDate,"
        "protocolSection.statusModule.completionDateStruct.date,"
        "protocolSection.statusModule.overallStatus",
    ]
    for fields in candidates:
        try:
            r = s.get(f"{BASE}/studies", params={
                "filter.advanced": filter_advanced, "pageSize": 1,
                "fields": fields,
            }, timeout=120)
            if r.status_code != 200:
                continue
            body = r.json()
            studies = body.get("studies", [])
            if not studies:
                continue
            rec = studies[0]
            sy, _, _ = extract_timing(rec)
            if sy is not None:
                print(f"ctgov: sparse fields OK ({len(r.content)/1024:.1f} KB/record): {fields[:60]}")
                return fields
            print(f"ctgov: fields {fields[:40]} unparseable, trying next")
        except Exception as e:  # noqa: BLE001 - probe, try next
            print(f"ctgov: fields probe failed for {fields[:40]}: {e}")
    return None


def fetch_subset(
    s: requests.Session, filter_advanced: str, fields: str,
    cache_path: Path, refresh: bool = False,
) -> list[dict]:
    """Page the full subset sparsely; cache as JSONL."""
    if cache_path.exists() and not refresh:
        recs = [json.loads(line) for line in cache_path.read_text().splitlines()]
        print(f"ctgov: loaded {len(recs):,} cached subset records")
        return recs
    recs: list[dict] = []
    page_token: str | None = None
    while True:
        params = {"filter.advanced": filter_advanced, "pageSize": 1000,
                  "fields": fields, "countTotal": "true"}
        if page_token:
            params["pageToken"] = page_token
        r = s.get(f"{BASE}/studies", params=params, timeout=300)
        r.raise_for_status()
        body = r.json()
        recs.extend(body.get("studies", []))
        print(f"ctgov: fetched {len(recs):,} / {body.get('totalCount', '?')} ...")
        page_token = body.get("nextPageToken")
        time.sleep(0.5)
        if not page_token:
            break
    with open(cache_path, "w") as f:
        for rec in recs:
            f.write(json.dumps(rec) + "\n")
    return recs


def running_yoy(records: list[dict], years: list[int]) -> tuple[pd.DataFrame, dict]:
    """Compute running-in-year counts from subset records."""
    starts: list[int | None] = []
    comps: list[int] = []  # resolved: 9999 = open-ended, -1 = never-running
    n_missing_start = 0
    for rec in records:
        sy, cy, status = extract_timing(rec)
        if sy is None:
            n_missing_start += 1
            continue
        starts.append(sy)
        if cy is not None:
            comps.append(cy)
        elif status in STATUS_ACTIVE:
            comps.append(9999)
        else:
            comps.append(-1)
    df = pd.DataFrame({"start_y": starts, "comp_y": comps})
    rows = [
        {"year": y,
         "n_running": int(((df["start_y"] <= y) & (df["comp_y"] >= y)).sum())}
        for y in years
    ]
    diag = {"records_used": len(df), "records_missing_start": n_missing_start,
            "records_total": len(records)}
    return pd.DataFrame(rows), diag
