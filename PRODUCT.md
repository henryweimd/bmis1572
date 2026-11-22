# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three co-equal audiences using a dual-purpose public research intelligence platform and hands-on feasibility workbench:

1. **Clinical trial feasibility & site-selection teams (sponsors, CROs, clinical ops):** screening candidate US and international research centers and investigators by therapeutic area, trial phase, team size, recency, and historical filing volume, then building exportable shortlists.
2. **Pharma/biotech strategy & medical affairs leaders:** evaluating longitudinal investigator workforce supply, supply-vs-demand tightness, work concentration, CRO/IRB landscape structure, and regulatory shocks such as the 2021* EU Form 1572 restriction.
3. **Clinical research academics, policy analysts, and data journalists:** auditing clinical trial infrastructure, registry coverage, cohort retention/re-entry dynamics, and methodological sensitivity bounds with verifiable exports.

## Product Purpose

Answer how the supply of clinical trial investigators has trended over time, how it compares against industry trial demand, and which research sites and investigators demonstrate durable activity — while enabling users to filter, drill down, verify underlying numbers, and shortlist sites and investigators directly in the browser.

Success means both a first-time reader exploring macro clinical-trial supply and a feasibility lead screening oncology or cardiology sites can reach trustworthy, caveated, exportable answers within seconds.

## Positioning

An **open, transparent public-data intelligence and feasibility workbench** — contrasting with opaque, paywalled commercial trial-intelligence tools by running 100% in-browser over public regulatory and registry snapshots with verifiable SQL definitions, downloadable CSVs, Markdown feasibility briefs, pre-built slide decks, and explicit experimental caveats on every linkage and metric.

## Operating Context

- **Live web app:** `https://explorer-five-iota.vercel.app/` (static Vite + React + DuckDB-WASM app backed by shipped Parquet snapshots in `explorer/public/data/`).
- **Local workflows:** `cd explorer && npm run dev` (`http://localhost:5173/`) for frontend exploration; `uv run python pipeline/build.py` to rebuild the Parquet lake, static charts (`charts/`), and slide deck (`exports/`).
- **Core user workflows:** executive briefing & guided pathways (`Overview`), multi-facet site & PI screening + local shortlisting (`Feasibility`), global `⌘K` entity search across sites/PIs/NCTs/CROs/IRBs/glossary, longitudinal supply & cohort attrition analysis (`FDA Investigators`, `FDA Sites`, `FDA CROs`, `FDA IRBs`), demand & sponsor drill-down (`FDA Trials`), and global context (`China (CFDI)`, `WHO ICTRP`).
- **Shareability & exports:** URL-hash state sync for bookmarking exact filtered views; CSV downloads on charts/tables; Markdown feasibility shortlist briefs; PPTX/PDF executive deck.

## Capabilities and Constraints

- **Data sources & scope:**
  - Supply: FDA CDER Bioresearch Monitoring Information System (BMIS) quarterly public file (Form 1572/1571, Oct 2008–Aug 2026; headline window 2009–2025; CDER drugs/biologics only — no devices, CBER, or non-IND studies).
  - Demand: ClinicalTrials.gov Data API v2 (53,543 US industry-led interventional trials across 7,940 sponsors).
  - Supplements: China CFDI partial institution filing extract (2026-11-06 snapshot; filing year = registration vintage, not activity) and WHO ICTRP Search Portal aggregate counts (1.176M deduplicated trials across 199 countries; multi-country trials repeat across countries).
- **Methodological transparency:** Person counts are bounded across `Strict` / `Merged` / `Raw` clustering versions; CT.gov site cross-checks (institution×city) and person↔official linkages (4.8% coverage, KOL-skewed; audited precision ~80% strong / ~60% weak) are explicitly labeled experimental; the 2021* EU drop reflects EU GCP restrictions on signing Form 1572 rather than proven attrition.
- **No additional user-imposed product constraints** beyond transparent methodology, public-data accuracy, and the in-browser architecture.

## Evidence on Hand

- **Live shipped Parquet lake (`explorer/public/data/`):** 45 curated Parquet datasets + `manifest.json` embedding canonical `DEFINITIONS` from `pipeline/aggregate.py` + `demo-investigators.csv` fallback.
- **Tracked visual & presentation assets:** 24 static captioned charts in `charts/` and pre-built executive slide deck in `exports/bmis-supply-deck.pptx` and `exports/bmis-supply-deck.pdf` (mirrored to `explorer/public/data/exports/`).
- **Methodology & audit docs:** `README.md`, `docs/eu_break.md`, `docs/linkage.md`, `docs/linkage_audit.md`, `docs/who.md`, `docs/responsive.md`, and `AGENTS.md`.
- **Absences not to fabricate:** No proprietary enrollment rates, site startup cycle times, PI contact emails/phone numbers, customer testimonials, or unverified clinical capacity claims.

## Product Principles

1. **Verifiable transparency over black-box scores:** Every chart, metric, and linkage exposes its canonical definition, exact underlying numbers (table view / CSV), and documented caveats.
2. **Dual-altitude utility:** Serve both macro supply/policy storytelling and tactical site/investigator feasibility screening without burying either audience.
3. **Direct drill-down and zero dead ends:** Every summary bar, leaderboard row, sponsor, site, investigator, and NCT links into deeper context, cross-tab inspection, or primary regulatory sources.
4. **Honest uncertainty and bounds:** Present clustering ranges (`Strict`/`Merged`/`Raw`), right-censoring, and experimental linkage precision plainly so teams verify site capacity directly before study startup.
