# Global Clinical Trial Investigator Talent Supply Data Explorer (FDA BMIS 1572)

How has the supply of clinical trial investigators trended over time, and how does
it compare against industry trial demand?

- **Supply side:** FDA Bioresearch Monitoring Information System (BMIS) — investigators,
  CROs, and IRBs named on Form 1572/1571 submissions forwarded to CDER (quarterly file).
- **Demand side:** industry-led interventional trials from the clinicaltrials.gov API v2.
- **China supplement:** partial extract of the CFDI drug-trial institution filing system
  (investigator affiliations at filed institutions, retrieved 2026-11-06).

```
pipeline/  →  data/ (local lake, gitignored)  →  explorer/public/data/ (shipped snapshot)
                                                   ↕
explorer/ (Vite + React + DuckDB-WASM, static)  →  Vercel (frontend only)
charts/ (tracked static PNGs with captioned definitions)
exports/ (tracked slide-deck PPTX + PDF)
```

Seven tabs: **US Investigators** (supply trends, new/returning, distribution, retention,
concentration, search, leaderboards), **US CROs** and **US IRBs** (company/board trends,
drill-downs, top tables), **US Sites** (address roll-ups, size mix, churn, CT.gov
cross-check), **US Trials** (sponsors, phases, linked-investigator board, coverage),
**China** (CFDI registry by filing vintage, ZH/EN toggle), **About** (data, methods,
limitations). Stacked charts toggle Absolute/100% yearly share. Filter state syncs
to the URL hash, so any view is shareable and bookmarkable.

## Quickstart (local)

Prereqs: `uv` and Node 18+.

```sh
# 1. Build the lake (~3 min from checkpoint: 1.86M BMIS rows + cached CT.gov)
uv run python pipeline/build.py --from-checkpoint

# 2. Serve the explorer (from the explorer/ dir)
cd explorer && npm install && npm run dev
```

Open http://localhost:5173 in a browser.

`--skip-ctgov`, `--refresh-ctgov`, `--skip-charts` also available. A from-scratch
build re-parses BMIS and re-fetches CT.gov caches (network-heavy, slower).

Without step 1, the explorer falls back to a committed demo CSV
(`explorer/public/data/demo-investigators.csv`, strict yearly geo summary) and says so.

## Layout

- `pipeline/build.py` — orchestrator: ingest → cluster → aggregate → CT.gov →
  China → people-linkage → charts → manifest + serving snapshot → DuckDB self-verification.
- `pipeline/bmis.py` — BMIS download/parse/clean (CRLF split, `~`-shift repair,
  garbage-year drop, geo banding).
- `pipeline/cluster.py` — person clustering: Strict / Merged / Raw + IRB/CRO entities.
- `pipeline/sites.py` — address clustering (Strict/Merged) + site rollups.
- `pipeline/orgs.py` — CRO/IRB name normalization (evidence-based giant aliases,
  stopword rules, state/country disambiguation of same-name orgs).
- `pipeline/ctgov.py` — CT.gov API client: yearly starts + sparse running-subset fetch.
- `pipeline/ctgov_link.py` — institution×city fuzzy join BMIS sites ↔ CT.gov
  facilities (+ full site↔trial pairs for mixes).
- `pipeline/ctgov_ta.py` — condition-text therapeutic-area classifier + site TA mix.
- `pipeline/ctgov_people.py` — officials/sponsor/phase fetch, person↔trial linkage,
  site phase mix.
- `pipeline/ctgov_geo.py` — global industry starts by geography band.
- `pipeline/china.py`, `pipeline/china_i18n.py` — CFDI extract ingest (row dedupe,
  pair model, ZH/EN labels).
- `pipeline/aggregate.py` — rollup tables + the shared `DEFINITIONS` texts.
- `pipeline/charts.py` — static PNGs, definitions captioned on every figure.
- `pipeline/deck.py` — slide-deck spec rendered to PPTX + PDF (caveat on every slide).
- `pipeline/geo_bands.py`, `pipeline/geo_bands.csv` — country→band mapping (auditable).
- `data/` — local lake: `raw/` (downloads + API caches), `curated/*.parquet`,
  `manifest.json`. Gitignored except via the shipped explorer snapshot.
- `explorer/src/App.tsx` — investigators tab, search, leaderboards, definitions.
- `explorer/src/OrgTab.tsx` — shared CRO/IRB tab component.
- `explorer/src/SiteTab.tsx` — sites tab (roll-ups, churn, cross-check, TA/phase mix).
- `explorer/src/TrialsTab.tsx` — trials tab (sponsors, phases, KOL board, coverage).
- `explorer/src/ChinaTab.tsx` — China tab (vintage, provinces, specialties, search).
- `explorer/` — static frontend: one DuckDB view per Parquet URL, every
  KPI/chart/table as SQL in the browser. No backend.
- `charts/` — tracked static figures; `exports/` — tracked slide deck.

## Methods (short)

- **Person identity.** BMIS Reviewer ID is one-per-site-record, not one-per-human, so
  persons are name+site clusters. Three versions bound the assumption:
  Strict (exact normalized match, headline), Merged (+ within-name site/city union),
  Raw (Reviewer-ID keyed, naive upper bound). Exact-duplicate rows collapsed first.
- **Active in year** = ≥1 receipt that year. **New** = first receipt ever in that year
  (2008–09 inflated: file starts Oct 2008). Headline window 2009–2025; 2008 (ramp-up)
  and 2026 (thru Aug 31) shown faded, excluded from growth stats.
- **Trials per person** = collapsed rows per cluster (one row = one IND reference).
- **Trials/year rate** = lifetime refs over the inclusive first–last span; intensity
  measure, not a headcount.
- **CRO/IRB grouping** = normalized site strings (giant aliases, stopword rules,
  state/country disambiguation); residual variants audited per org in the index tables.
- **Site identity.** A site is a street address: Strict matches normalized
  street+city+state+country (suite markers dropped, ZIP excluded); Merged unions
  same-house-number addresses at street-token Jaccard ≥ 0.6 within a city.
  Rollups use strict persons; churn = first/last receipt year per roster link.
- **CT.gov cross-check (experimental).** US industry trials whose facility
  fuzzy-matches the institution name in the same city, year-gated; counts are
  institution×city, shared across addresses. See `docs/linkage.md`.
- **CT.gov person linkage (experimental).** Study-level officials (chairs/directors,
  not site PIs) matched to strict persons by normalized name + affiliation↔site
  token overlap. Strong = full name + ≥2 tokens; weak = full name + 1 token (or no
  affiliation) or initial + ≥2 tokens. Covers 12,808/288,855 persons (4.4%), KOL-skewed.
- **Benchmark.** Unadjusted: all CI persons vs. global industry starts. Adjusted:
  US persons vs. US-site trials, counted as starts/year and running-in-year
  (start ≤ year, completion ≥ year or still active). Tightness = active per running
  trial — descriptive only; supply and starts are not independent.
- **2021\*.** First full year after 2019, when signing Form FDA 1572 was deemed
  illegal for EU investigators; EORTC + NCI RCR replacements followed. The EU BMIS
  drop from 2021 is administrative, not proven attrition.
- **China person** = (name, institution) pair; rows exact-deduped at ingest (the
  extract repeats ~35%). Pairs count affiliations, not humans; filing year is the
  institution's registration vintage (bulk 2019–20 wave), never activity.
- Full definitions live in `pipeline/aggregate.py` (`DEFINITIONS`), are embedded in
  `data/manifest.json`, captioned on every chart, and shown in the explorer.

## Headline findings (Strict, 2009→2025; verify in app)

- Global active investigators: **34,468 → 29,596 (−14.1%)**; US active:
  **18,838 → 24,084 (+27.8%)** — the decline is entirely ex-US.
- **49.3%** of persons are one-trial (lifetime = 1 IND reference); median 2, mean 3.85.
- No visible EU break at GDPR (May 2018); the sharp ex-US drop is 2020–21 across bands.
  EU share of active: 19.9% (2019) → 10.7% (2021) — see 2021* above.
- US tightness: ~3.3 investigators per running trial (2009) → ~2.5 (2025).
- Tightness by band (starts-only, Strict 2025): US 9.5 investigators/start vs
  0.6–1.4 ex-US; multi-country trials count in every band they touch.
- CROs: 951 active in 2025 (PPD, IQVIA, Syneos top all-time). IRBs: 3,779 active
  in 2025 (WCG, Advarra, Copernicus top all-time).
- Retention is steep then flat: ~19% of a cohort is active the next year, ~9% a
  decade later. Work is concentrating: top-10% receipt share 27% → 32% and Gini
  0.24 → 0.34 from 2009 to 2025.
- Sites (address-first clustering): **137,049 strict → 111,480 merged**; MD
  Anderson leads (847 investigators, 5,390 refs, 143 spelling variants absorbed).
- CT.gov cross-check (experimental, US, institution×city): 27,060/47,655 strict
  institutions match ≥1 industry trial; MD Anderson flagship ≈ 2,900 plausible
  trials (1,467 strong). See `docs/linkage.md`.
- TA mix of matched trials (experimental): oncology 32%, cardiology 9%,
  neurology 7%; Other 25% (healthy-volunteer, drug-class, unclassifiable).
- Demand side: 53,543 US industry trials from 7,940 sponsors (Pfizer leads, 1,760);
  phases P1 > P2 > P3. Top linked investigator: 43 trials, all strong-tier.
- China CFDI extract (partial): 42,117 investigator-institution pairs
  (34,077 names, 1,818 institutions); 79% of pairs sit at 2020-vintage
  filings (bulk registration). Internal Medicine leads specialties;
  Guangdong/Beijing/Jiangsu lead provinces.

## Limitations

- BMIS is CDER IND drugs/biologics only, and FDA states it is **not comprehensive**
  (1572 goes to the sponsor; forwarding to FDA is voluntary-ish). No devices, CBER, non-IND.
- Person↔trial linkage is experimental and thin (4.4% persons, study officials only);
  benchmarking is otherwise ecological (year-level ratios). Receipt rows carry date + site only.
- BMIS has no therapeutic-area/phase fields; TA splits come from matched CT.gov trials
  (site mixes, linked-trial TAs) and inherit all linkage caveats.
- Person counts are ranges across Strict/Merged/Raw, not exact headcounts. Org groupings
  carry residual spelling splits/merges (audited via variants columns).
- China coverage is partial (1,818 institutions), a single 2026-11-06 snapshot, with
  common-name collision; filing year is vintage, not activity.

## Parked future work

- Name-only cross-site investigator tracking; curated org alias table.
- Therapeutic-area / phase drill-downs beyond linked-trial coverage.
- chinadrugtrials.org.cn trial-level linkage for China (in progress, separate effort).
- R2 object storage if the shipped snapshot outgrows comfortable git size (~38MB today).
