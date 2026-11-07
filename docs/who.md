# WHO ICTRP aggregate counts — methods

## What

Country-level trial counts from the WHO International Clinical Trials Registry
Platform (ICTRP) Search Portal, for the explorer's WHO ICTRP tab (global demand
context next to BMIS supply and CT.gov demand).

## Source (cite as)

- Query interface: <https://trialsearch.who.int/AdvSearch.aspx>
- Registry programme: <https://www.who.int/clinical-trials-registry-platform>
- Retrieved: 7 Nov 2026. Scope: aggregate counts only.

## How (`pipeline/who.py`)

Each figure is the portal's own “N records for M trials found” line for one
Advanced Search submission:

- One country per search via the country listbox (`lstCountries` → Add →
  `lstCountriesSelected`), or no country (= global).
- Recruitment Status forced to **ALL** (the portal defaults to Recruiting).
- Optional Date-of-registration window in dd/MM/yyyy (`01/01/Y`–`31/12/Y`).
- ASP.NET postback flow: GET (viewstate) → Add-country POST → Search POST,
  ~1s politeness sleep, 3 retries, resumable JSONL checkpoint
  (`data/raw/who_counts.jsonl`, untracked).

Phases:

1. `--phase1`: all 199 portal countries (totals) + global × registration years
   2000–2026 (27 searches).
2. `--global`: one unfiltered global search (true total; country figures
   double-count multi-country trials and must never be summed).
3. `--phase2`: top-20 countries by total trials × years 2000–2026 (540 searches).
4. `--build`: JSONL → `who_country` / `who_year` / `who_country_year` /
   `who_global` curated parquets, with region bands from
   `pipeline/who_bands.csv` (same 7 bands as the BMIS tabs; every portal
   country mapped, build fails on gaps).

Reproduce: `uv run python pipeline/who.py --phase1 --phase2 --global --build`
(~25 min, polite), then `uv run python pipeline/build.py` picks the curated
tables up via `stage_who()`.

## Semantics and caveats

- **Records vs trials**: records are registry entries across ICTRP's primary
  registries (including ClinicalTrials.gov); trials are deduplicated studies.
  Records ≥ trials; the gap is multi-registry registration.
- **Multi-country overlap**: a trial recruiting in 5 countries counts in all 5.
  Use `who_global` as the denominator, never the country sum.
- **Registration year ≠ start year**: CT.gov exhibits use Start Date; WHO uses
  Date of registration. Compare shapes, not levels.
- **Zero rows**: Côte d'Ivoire, Laos, and North Korea return 0 via the portal's
  country list. North Korea is plausibly a true zero; the other two are likely
  portal vocabulary misses (apostrophe spellings) — shown as reported, flagged
  in the UI, never silently dropped.
- **Top-20-only trends**: only the top 20 countries were scraped by year (portal
  load); the country×year stack excludes 179 smaller countries and understates
  global totals — the UI says so next to the chart.
