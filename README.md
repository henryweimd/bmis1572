# Investigator Supply Explorer (FDA BMIS 1572)

How has the supply of clinical trial investigators trended over time, and how does
it compare against industry trial demand?

- **Supply side:** FDA Bioresearch Monitoring Information System (BMIS) — investigators
  named on Form 1572/1571 submissions forwarded to CDER (quarterly public file).
- **Demand side:** industry-led interventional trials from the clinicaltrials.gov API v2.

```
pipeline/  →  data/ (local lake, gitignored)  →  explorer/public/data/ (served at /data/…)
                                                   ↕
explorer/ (Vite + React + DuckDB-WASM, static)  →  Vercel (frontend only)
charts/ (tracked static PNGs with captioned definitions)
```

## Quickstart (local)

Prereqs: `uv` and Node 18+.

```sh
# 1. Build the lake (~10 min first run: 1.86M BMIS rows + CT.gov fetch)
uv run python pipeline/build.py

# 2. Serve the explorer (from the explorer/ dir)
cd explorer && npm install && npm run dev
```

Open http://localhost:5173 in a browser.

Faster reruns: `uv run python pipeline/build.py --from-checkpoint` (reuses parsed
BMIS + cached CT.gov responses; ~5s). `--skip-ctgov`, `--refresh-ctgov`,
`--skip-charts` also available.

Without step 1, the explorer falls back to a committed demo CSV
(`explorer/public/data/demo-investigators.csv`, strict yearly geo summary) and says so.

## Layout

- `pipeline/build.py` — orchestrator: ingest → cluster → aggregate → CT.gov →
  charts → manifest + serving snapshot → DuckDB self-verification.
- `pipeline/bmis.py` — BMIS download/parse/clean (CRLF split, `~`-shift repair,
  garbage-year drop, geo banding).
- `pipeline/cluster.py` — person clustering: Strict / Merged / Raw + IRB/CRO entities.
- `pipeline/ctgov.py` — CT.gov API client: yearly starts + sparse running-subset fetch.
- `pipeline/aggregate.py` — rollup tables + the shared `DEFINITIONS` texts.
- `pipeline/charts.py` — 5 static PNGs, definitions captioned on every figure.
- `pipeline/geo_bands.py`, `pipeline/geo_bands.csv` — country→band mapping (auditable).
- `data/` — local lake: `raw/` (downloads + API caches), `curated/*.parquet`,
  `manifest.json`. Gitignored; this is what moves to R2 later.
- `explorer/` — static frontend. Creates one DuckDB view per Parquet URL, runs every
  KPI/chart/table as SQL in the browser. No backend.
- `charts/` — tracked static figures (see below).

## Methods (short)

- **Person identity.** BMIS Reviewer ID is one-per-site-record, not one-per-human, so
  persons are name+site clusters. Three versions bound the assumption:
  Strict (exact normalized match, headline), Merged (+ within-name site/city union),
  Raw (Reviewer-ID keyed, naive upper bound). Exact-duplicate rows collapsed first.
- **Active in year** = ≥1 receipt that year. **New** = first receipt ever in that year
  (2008–09 inflated: file starts Oct 2008). Headline window 2009–2025; 2008 (ramp-up)
  and 2026 (thru Aug 31) shown faded, excluded from growth stats.
- **Trials per person** = collapsed rows per cluster (one row = one IND reference).
- **Benchmark.** Unadjusted: all CI persons vs. global industry starts. Adjusted:
  US persons vs. US-site trials, counted as starts/year and running-in-year
  (start ≤ year, completion ≥ year or still active). Tightness = active per running
  trial — descriptive only; supply and starts are not independent.
- Full definitions live in `pipeline/aggregate.py` (`DEFINITIONS`), are embedded in
  `data/manifest.json`, captioned on every chart, and shown in the explorer.

## Headline findings (Strict, 2009→2025; verify in app)

- Global active investigators: **34,468 → 29,596 (−14.1%)**; US active:
  **18,838 → 24,084 (+27.8%)** — the decline is entirely ex-US.
- **49.3%** of persons are one-trial (lifetime = 1 IND reference); median 2, mean 3.85.
- No visible EU break at GDPR (May 2018); the sharp ex-US drop is 2020–21 across bands.
- US tightness: ~3.3 investigators per running trial (2009) → ~2.5 (2025).

## Limitations

- BMIS is CDER IND drugs/biologics only, and FDA states it is **not comprehensive**
  (1572 goes to the sponsor; forwarding to FDA is voluntary-ish). No devices, CBER, non-IND.
- No record-level investigator↔trial linkage exists (neither source carries the join key);
  benchmarking is ecological (year-level ratios).
- BMIS has no therapeutic-area/phase fields; investigator-side TA splits need a third source.
- Person counts are ranges across Strict/Merged/Raw, not exact headcounts.

## Parked future work

- Name-only cross-site tracking (investigators who move institutions).
- Record-level investigator↔trial linkage via a joinable third source.
- Therapeutic-area / phase drill-downs (reserved disabled slots in the explorer).
- Hosted deploy: push to GitHub → import `explorer/` into Vercel → point manifest at
  R2 URLs (snapshot is ~150KB today; Vercel Hobby tolerates it, R2 later if it grows).
