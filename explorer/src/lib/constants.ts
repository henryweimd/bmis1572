export const BANDS = [
  'United States',
  'Europe (EU+UK)',
  'South America',
  'Middle East',
  'South Asia',
  'East Asia & Pacific',
  'Rest of world',
  'Unknown',
] as const;

export const BAND_COLORS: Record<string, string> = {
  'United States': '#1f77b4',
  'Europe (EU+UK)': '#ff7f0e',
  'South America': '#2ca02c',
  'Middle East': '#d62728',
  'South Asia': '#9467bd',
  'East Asia & Pacific': '#8c564b',
  'Rest of world': '#7f7f7f',
  Unknown: '#bcbd22',
};

export const SERIES_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#17becf',
] as const;

export const VERSIONS = ['strict', 'merged', 'raw'] as const;
export type Version = (typeof VERSIONS)[number];

export const VERSION_LABEL: Record<Version, string> = {
  strict: 'Strict',
  merged: 'Merged',
  raw: 'Raw bound',
};

export const YEAR_MIN = 2008;
export const YEAR_MAX = 2026;
export const LATEST_FULL = 2025;
export const VINTAGE_KMAX = 10;

export const TABS = ['inv', 'cro', 'irb', 'site', 'trials', 'china', 'who', 'about'] as const;
export type TabId = (typeof TABS)[number];

export const TAB_LABEL: Record<TabId, string> = {
  inv: 'FDA Investigators',
  cro: 'FDA CROs',
  irb: 'FDA IRBs',
  site: 'FDA Sites',
  trials: 'FDA Trials',
  china: 'China',
  who: 'WHO ICTRP',
  about: 'About',
};

export const DEF_TITLES: readonly [string, string][] = [
  ['person_strict', 'Strict person'],
  ['person_merged', 'Merged person'],
  ['person_raw', 'Raw bound'],
  ['trials_per_person', 'Trials per person'],
  ['active', 'Active / new / returning'],
  ['one_trial', 'One-trial'],
  ['trials_per_year', 'Trials/year rate'],
  ['retention', 'Vintage attrition'],
  ['vintage_decomp', 'Vintage decomposition'],
  ['concentration', 'Work concentration'],
  ['scope_unadjusted', 'Unadjusted benchmark'],
  ['scope_adjusted', 'Adjusted benchmark'],
  ['starts_running', 'Starts vs. running'],
  ['tightness', 'Tightness ratio'],
  ['eu_2021', '2021* EU 1572 note'],
  ['partial', 'Partial years'],
  ['bmis_scope', 'BMIS scope'],
  ['cro', 'CRO company grouping'],
  ['irb', 'IRB board grouping'],
  ['site', 'Site definition'],
  ['person_ctgov_link', 'CT.gov person linkage (experimental)'],
  ['site_churn', 'Site roster churn'],
  ['site_retention', 'Site vintage attrition'],
  ['org_retention', 'CRO/IRB vintage attrition'],
  ['site_xcheck', 'CT.gov cross-check (experimental)'],
  ['site_ta', 'Therapeutic-area mix (experimental)'],
  ['data_quality', 'Junk names & coverage'],
  ['china', 'China CFDI extract'],
  ['china_filing', 'China filing vintage'],
  ['china_i18n', 'China translations'],
  ['who', 'WHO ICTRP counts'],
  ['who_records', 'ICTRP records vs trials'],
  ['eu_break', 'EU break study'],
  ['movers', 'Cross-site movers (experimental)'],
];
