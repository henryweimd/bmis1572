# EU break study — pre-registered spec

Written **before** estimation (Unit 1). Question: did the EU-specific events —
2019 (signing Form FDA 1572 deemed illegal; EU GCP inspectors prohibited
completion) and 2021 (NCI RCR International Investigator Statement replaced
1572 for European countries) — cause the collapse in EU active CIs?

## Design

- **Outcome**: band share of global active CIs, `merged` person version,
  2009–2025. Level (`n_active`) gaps reported alongside.
- **Window**: pre = 2009–2020, post = 2021–2025. 2008 excluded (file starts
  Oct 2008, loading-inflated); 2026 excluded (partial year).
- **Treated**: `Europe (EU+UK)`. **Controls**: `United States`,
  `East Asia & Pacific`, `South America`.
- **Estimator**: OLS of share on year over pre-period, extrapolated to post
  years; gap = mean(observed − expected) over 2021–2025.
  Difference-in-breaks = EU gap − mean(control gaps).
- **Placebos**: fake breaks at 2016 (pre 2009–2015, post 2016–2020) and 2017
  (pre 2009–2016, post 2017–2020), same estimator.

## Decision rule

- **Causal-consistent** iff: 2021 EU gap is large (≥10pp share or ≥50% of
  pre-mean level), control 2021 gaps are small (<3pp), and both placebo EU
  gaps are small (<3pp) and far below the 2021 gap.
- Else the unit ships **descriptive-only** ("EU composition broke in 2021;
  timing coincides with the 1572 prohibition + RCR replacement").

## Stated confounders (shipped in UI + deck either way)

- COVID disrupted 2020 globally (visible dip in all bands).
- BMIS filing/receipt lags can shift activity across adjacent years.
- Share is compositional: a US surge alone would shrink the EU share, so the
  level gap is the primary estimand and share is supporting.
- The band is geographic (EU+UK); Brexit does not change membership.

## Outputs

- `eu_break_band`: year × band with observed share/level, expected (pre-trend
  extrapolation), gap; break + placebo runs identified by `run` column
  (`2021`, `placebo_2016`, `placebo_2017`).
- `eu_break_summary`: per-run, per-band post-mean gaps + difference-in-breaks.
- Chart `eu_break.png`, explorer panel (FDA Investigators tab), deck slide.

## Results (recorded after estimation; spec above unchanged)

- 2021 EU gap: **−10.7pp share, −4,340 CIs/yr (−62% of pre-mean)**.
- 2021 control gaps: US +13.6pp share / −2,199 level (−12%); EAP −1.5pp /
  −1,062; SA +0.6pp / +49. The US share "surge" is the compositional mirror
  of the EU exit (US level fell too) — the denominator collapsed.
- Placebo EU gaps: −3.8pp/−1,148 (2016), −3.4pp/−506 (2017) — real mid-sample
  EU volatility (2016/2018 dips), 3–8× smaller than the 2021 gap.
- 2021 was down in every band (US −15%, EAP −29%, SA −13%) but the EU drop
  (−51%) is 2–4× deeper and permanent: EU stays ~2k through 2025 while the
  US recovers to 19.7k.
- **Verdict per decision rule: descriptive-only.** Gates missed: US control
  share gap (+13.6pp, compositional mirror) and placebo EU gaps (−3.8/−3.4pp)
  exceed 3pp. UI + deck report the EU-specific permanent break with timing
  coinciding with the 1572 prohibition + RCR replacement, without a causal
  claim.
