"""WHO ICTRP aggregate counts via the public Advanced Search interface.

Source (cite everywhere): https://trialsearch.who.int/AdvSearch.aspx
(ICDTRP Search Portal; WHO International Clinical Trials Registry Platform,
https://www.who.int/clinical-trials-registry-platform)

Scope: AGGREGATE COUNTS ONLY — "N records for M trials found" per search.
No trial-level or investigator-level data is fetched or stored. Each search
sets Recruitment Status = ALL and optionally a Date-of-registration year
window; one country per search (or none = global).

Phases (resumable JSONL checkpoint):
  --phase1  per-country totals (all 199 portal countries) + global per-year
            2000-2026 (registration date).
  --phase2  top-20 countries (by total trials) x registration years 2000-2026.
  --build   JSONL -> curated who_country / who_year / who_country_year parquets.

Politeness: ~1s sleep between searches, 3 retries, browser UA.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CURATED = ROOT / "data" / "curated"
JSONL = RAW / "who_counts.jsonl"
META = RAW / "who_meta.json"
BANDS_CSV = Path(__file__).resolve().parent / "who_bands.csv"

WHO_ADV = "https://trialsearch.who.int/AdvSearch.aspx"
WHO_ABOUT = "https://www.who.int/clinical-trials-registry-platform"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
P = "ctl00$ContentPlaceHolder1$"
YEARS = list(range(2000, 2027))
COUNT_RE = re.compile(r"([\d,]+)\s+records?\s+for\s+([\d,]+)\s+trials?\s+found")

DEFAULTS = {
    f"{P}ddlTitle": "OperatorNone",
    f"{P}ddlOperatorCondition": "OperatorAND",
    f"{P}ddlOperatorIntervention": "OperatorAND",
    f"{P}ddlRecruitingStatus": "ALL",
    f"{P}ListBoxPhase": "All",
}


def hidden(html: str, name: str) -> str:
    m = re.search(r'name="%s"[^>]*value="([^"]*)"' % re.escape(name), html)
    return m.group(1) if m else ""


def base_fields(html: str) -> dict:
    out = {n: hidden(html, n) for n in
           ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION",
            "__EVENTTARGET", "__EVENTARGUMENT", "__VIEWSTATEENCRYPTED"]}
    out.update(DEFAULTS)
    return out


def get_countries(s: requests.Session) -> list[str]:
    h = s.get(WHO_ADV, timeout=60).text
    m = re.search(r'<select[^>]*lstCountries"[^>]*>(.*?)</select>', h, re.S)
    if not m:
        raise RuntimeError("country listbox not found")
    return [html.unescape(v) for v in re.findall(r'<option value="([^"]*)">', m.group(1))]


def search(s: requests.Session, country: str | None,
           dstart: str = "", dend: str = "") -> tuple[int, int]:
    """One AdvSearch query; returns (records, trials). Raises on failure."""
    h = s.get(WHO_ADV, timeout=60).text
    if country:
        d1 = base_fields(h)
        d1.update({f"{P}lstCountries": country, f"{P}butAdd": ">>"})
        h = s.post(WHO_ADV, data=d1, timeout=120).text
        sel = re.search(r'<select[^>]*lstCountriesSelected"[^>]*>(.*?)</select>', h, re.S)
        if not sel or f'value="{country}"' not in html.unescape(sel.group(1)):
            raise RuntimeError(f"country add failed: {country}")
    d2 = base_fields(h)
    d2.update({f"{P}txtDateStart": dstart, f"{P}txtDateEnd": dend,
               f"{P}btnSearch": "Search"})
    if country:
        d2[f"{P}lstCountriesSelected"] = country
    h2 = s.post(WHO_ADV, data=d2, timeout=180).text
    m = COUNT_RE.search(h2)
    if not m:
        raise RuntimeError("count text not found")
    return int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))


def load_done() -> dict[str, dict]:
    done = {}
    if JSONL.exists():
        for line in JSONL.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                done[r["key"]] = r
    return done


def append(rec: dict) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    with open(JSONL, "a") as f:
        f.write(json.dumps(rec) + "\n")


def run_queries(plan: list[tuple[str, str | None, str, str]], sleep: float) -> None:
    """plan: (key, country, dstart, dend). Resumes past completed keys."""
    done = load_done()
    todo = [q for q in plan if q[0] not in done]
    print(f"plan={len(plan)} done={len(done)} todo={len(todo)}", flush=True)
    s = requests.Session()
    s.headers.update(UA)
    for i, (key, country, ds, de) in enumerate(todo):
        err = ""
        for attempt in range(3):
            try:
                rec, tri = search(s, country, ds, de)
                append({"key": key, "country": country or "GLOBAL",
                        "dstart": ds, "dend": de, "records": rec, "trials": tri,
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "scope": "ALL-status; registration-date window"})
                print(f"[{i + 1}/{len(todo)}] {key} -> {rec}/{tri}", flush=True)
                err = ""
                break
            except Exception as e:  # noqa: BLE001 - retry then record
                err = str(e)[:160]
                time.sleep(2 * (attempt + 1))
        if err:
            append({"key": key, "country": country or "GLOBAL",
                    "dstart": ds, "dend": de, "records": None, "trials": None,
                    "ts": datetime.now(timezone.utc).isoformat(), "error": err})
            print(f"[{i + 1}/{len(todo)}] {key} FAILED: {err}", flush=True)
        time.sleep(sleep)


def phase1(sleep: float) -> None:
    s = requests.Session()
    s.headers.update(UA)
    countries = get_countries(s)
    print(f"portal countries: {len(countries)}", flush=True)
    plan = [(f"total::{c}", c, "", "") for c in countries]
    plan += [(f"year::GLOBAL::{y}", None, f"01/01/{y}", f"31/12/{y}") for y in YEARS]
    run_queries(plan, sleep)
    META.write_text(json.dumps({
        "source_search": WHO_ADV, "source_about": WHO_ABOUT,
        "scope": "aggregate counts only (records/trials found); ALL recruitment statuses",
        "date_semantics": "Date of registration (dd/MM/yyyy ranges)",
        "countries": countries, "years": YEARS,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2))


def phase2(sleep: float, top_n: int = 20) -> None:
    done = load_done()
    totals = [(k.split("::", 1)[1], v["trials"]) for k, v in done.items()
              if k.startswith("total::") and v.get("trials") is not None]
    if len(totals) < top_n:
        raise SystemExit(f"phase1 incomplete: {len(totals)} totals")
    tops = [c for c, _ in sorted(totals, key=lambda t: -t[1])[:top_n]]
    print(f"top{top_n}: {tops}", flush=True)
    plan = [(f"cy::{c}::{y}", c, f"01/01/{y}", f"31/12/{y}")
            for c in tops for y in YEARS]
    run_queries(plan, sleep)


def fetch_global(sleep: float) -> None:
    """Single unfiltered global search (no country, no dates)."""
    run_queries([("global::total", None, "", "")], sleep)


def build_tables() -> dict:
    import pandas as pd

    bands = {}
    with open(BANDS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            bands[row["country"].strip()] = row["band"].strip()
    done = load_done()
    missing_countries = sorted({v["country"] for v in done.values()
                                if v["country"] != "GLOBAL" and v["country"] not in bands})
    if missing_countries:
        raise SystemExit(f"countries missing from who_bands.csv: {missing_countries}")

    def rows(prefix: str):
        for k, v in done.items():
            if k.startswith(prefix) and v.get("trials") is not None:
                yield v

    ct = [{"country": v["country"], "band": bands[v["country"]],
           "records": v["records"], "trials": v["trials"]}
          for v in rows("total::")]
    yr = [{"year": int(k.rsplit("::", 1)[1]), "records": v["records"], "trials": v["trials"]}
          for k, v in done.items()
          if k.startswith("year::") and v.get("trials") is not None]
    cy = [{"country": v["country"], "band": bands[v["country"]],
           "year": int(k.rsplit("::", 1)[1]),
           "records": v["records"], "trials": v["trials"]}
          for k, v in done.items()
          if k.startswith("cy::") and v.get("trials") is not None]
    CURATED.mkdir(parents=True, exist_ok=True)
    out = {}
    g = done.get("global::total")
    gb = [{"records": g["records"], "trials": g["trials"]}] if g and g.get("trials") is not None else []
    for name, data in [("who_country", ct), ("who_year", yr),
                       ("who_country_year", cy), ("who_global", gb)]:
        df = pd.DataFrame(data)
        for c in df.columns:
            if df[c].dtype == "int64":
                df[c] = df[c].astype("int32")
        df.to_parquet(CURATED / f"{name}.parquet", index=False,
                      compression="zstd", compression_level=9)
        out[name] = len(df)
    fails = sum(1 for v in done.values() if v.get("trials") is None)
    print(f"tables={out} failed_queries={fails}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="WHO ICTRP aggregate counts")
    ap.add_argument("--phase1", action="store_true")
    ap.add_argument("--phase2", action="store_true")
    ap.add_argument("--global", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--sleep", type=float, default=1.0)
    ap.add_argument("--top-n", type=int, default=20)
    args = ap.parse_args()
    if args.phase1:
        phase1(args.sleep)
    if args.phase2:
        phase2(args.sleep, args.top_n)
    if getattr(args, "global"):
        fetch_global(args.sleep)
    if args.build:
        build_tables()
    if not (args.phase1 or args.phase2 or getattr(args, "global") or args.build):
        ap.print_help()


if __name__ == "__main__":
    main()
