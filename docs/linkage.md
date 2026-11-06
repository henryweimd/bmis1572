# CT.gov linkage memo (experimental, 2026-11-05)

## What was tried

Person-level linkage is impossible: BMIS rows carry no trial ID (no NCT/IND
key) and CT.gov records carry no 1572 identifier; the API has no
`AREA[InvestigatorName]` filter (probed: unknown area). What CT.gov *does*
expose cheaply is per-study facility + city via sparse fields
(`NCTId|StartDate|OverallStatus|LocationCity|LocationCountry|LocationFacility`,
~300 bytes/record), plus count-only `AREA[LocationCity]` queries.

## Design (pipeline/ctgov_link.py)

Institution x city fuzzy join, US scope (industry-interventional):

1. Fetch 53,530 studies sparsely -> 543,640 US location rows (one-time,
   cached `data/raw/ctgov_locations.jsonl`, ~161MB local, gitignored).
2. Normalize with the repo's own `site_name_key` (ASCII fold + abbrev expand);
   drop generic facilities (`INVESTIGATIONAL SITE`, ...).
3. Group BMIS sites into institutions by (normalized name, city); block
   candidates by city with a token inverted index (blocks > 4,000 locations
   require 2 shared index tokens instead of being dropped).
4. Match facility<->institution at >= 2 shared tokens and Jaccard >= 0.34
   (strong >= 0.6), gated on study start year overlapping the BMIS span.
5. Emit `site_ctgov_xcheck` per site: plausible/strong NCT counts, best
   Jaccard, 5 sample NCTs, sibling-address count.

## Audit result (top-25 strict, human-scored)

25/25 sample facilities are the correct institution (MD Anderson, Mayo,
Cleveland Clinic, Duke, MGH, Columbia lead). Counts are institution-level:
every address of one institution in a city shares the same number.

## Known biases (also in the `site_xcheck` definition)

- Name variants split counts (four MD Anderson spellings each hold ~1,700-2,500
  overlapping NCTs); department-level BMIS rows inherit whole-institution counts.
- Weak tier (J < 0.6) is suggestive, not confirmatory.
- US only; sponsors' generic site names never match (recall loss).
- Year gate uses start year vs BMIS span; long-running trials started before a
  site's first receipt still count if overlapping.

## Cost

Two count probes + field probes (< 2KB) during design; one 53-page sparse
fetch (~5 min with rate sleeps, cached forever). No bulk full-record fetch.
Join runs offline from cache in ~75s inside `build.py` (skipped if cache
is absent).
