# CT.gov person-linkage audit (Unit 4)

Linkage: BMIS strict persons ↔ CT.gov overall officials by last-name block +
first-name tier + affiliation/site-city-state token overlap
(`pipeline/ctgov_people.py`). Officials are study-level (chairs/directors),
not site PIs — coverage is thin and KOL-skewed by construction.

## Coverage after Unit 4 (suffix strip, city in overlap, affiliation cleanup)

- Persons linked: 13,956 of ~289k strict (4.8%, was 4.4%).
- Links: 11,961 strong / 12,696 weak (was 10,957 / 11,611).
- Officials linked: 5,239 of 46,638 (11.2%).
- Programmatic proxies (`link_audit_summary`): strong mean overlap 2.5,
  weak 1.0; single-candidate share ~2–3% (large same-last blocks).

## Eyeball audit (2026-11-07, valid batches only)

21 sampled links with exact (nct, official-name) affiliation join:

- Strong 10/12 plausibly correct, 2 uncertain (e.g. same-metro ambiguity).
  Sample hits: Berlin/Study Protocol, Biller/MGH, Burris/Tennessee Oncology,
  Cohen/Penn Perelman, Cortes/MD Anderson, Barve/Mary Crowley, Bubb/VA
  Gainesville, Carlson/IDC Minneapolis, Belperio/UCLA, Bailey/AMCR.
- Weak 6/9 plausibly correct, 1 miss (Florida↔Ohio), 2 uncertain.
  Notable: one "weak" hit was the same human as a "strong" hit via a second
  BMIS record — independent evidence of the mover/duplication problem.

An earlier batch joined affiliations per-NCT (max) rather than per-official
and produced spurious mismatches; those verdicts were discarded.

## Reading

Strong ≈ 80% precision, weak ≈ 60% on small samples — the experimental label
stays. Weak links may be name collisions; treat counts as KOL-skewed
coverage, never as attribution.
