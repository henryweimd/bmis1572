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

export const THERAPEUTIC_AREAS = [
  'Oncology',
  'Cardiology',
  'Neurology',
  'Metabolic',
  'Immunology',
  'Infectious',
  'Respiratory',
  'GI/Liver',
  'Musculoskeletal',
  'Dermatology',
  'Ophthalmology',
  'Psychiatry',
  'Hematology',
  'Renal',
  'Uro/Gyn',
  'Pain',
  'Other',
] as const;

export const TRIAL_PHASES = [
  'EARLY_P1',
  'P1',
  'P1+P2',
  'P2',
  'P2+P3',
  'P3',
  'P4',
] as const;

export const YEAR_MIN = 2008;
export const YEAR_MAX = 2026;
export const LATEST_FULL = 2025;
export const VINTAGE_KMAX = 10;

export const TABS = [
  'overview',
  'feas',
  'inv',
  'site',
  'cro',
  'irb',
  'trials',
  'china',
  'who',
  'about',
] as const;
export type TabId = (typeof TABS)[number];

export const TAB_LABEL: Record<TabId, string> = {
  overview: 'Overview',
  feas: 'Feasibility',
  inv: 'FDA Investigators',
  site: 'FDA Sites',
  cro: 'FDA CROs',
  irb: 'FDA IRBs',
  trials: 'FDA Trials',
  china: 'China (CFDI)',
  who: 'WHO ICTRP',
  about: 'About & Guides',
};

export const TAB_SUBTITLE: Record<TabId, string> = {
  overview: 'Executive brief, headline trends, and guided clinical feasibility pathways',
  feas: 'Multi-facet site & investigator discovery, TA/phase screening, and feasibility shortlisting',
  inv: 'Longitudinal CDER Form 1572 investigator supply, retention, concentration, and EU break study',
  site: 'Street-address research centers, team size mix, roster churn, and CT.gov facility cross-check',
  cro: 'Contract Research Organization filings, geographic footprint, and cohort retention',
  irb: 'Institutional Review Board market structure, consolidation, and vintage attrition',
  trials: 'US industry interventional trial demand, lead sponsors, phase mix, and official linkage',
  china: 'NMPA/CFDI drug-trial institution filing registry by province, specialty, and vintage',
  who: 'Global clinical trial registration volume across WHO ICTRP primary registries',
  about: 'Data provenance, feasibility playbook, caveats, slide deck export, and external references',
};

export interface NavGroup {
  label: string;
  items: readonly TabId[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'Workspace', items: ['overview', 'feas'] },
  { label: 'FDA Supply (BMIS 1572)', items: ['inv', 'site', 'cro', 'irb'] },
  { label: 'Demand & Global', items: ['trials', 'china', 'who'] },
  { label: 'Reference', items: ['about'] },
];

export interface ContextLink {
  title: string;
  url: string;
  category: 'Regulatory & Primary Sources' | 'EU 1572 Policy Context' | 'Methodology & Exports';
  description: string;
}

export const CONTEXT_LINKS: readonly ContextLink[] = [
  {
    title: 'FDA BMIS Quarterly Database',
    url: 'https://www.fda.gov/drugs/drug-approvals-and-databases/bioresearch-monitoring-information-system-bmis',
    category: 'Regulatory & Primary Sources',
    description: 'Official CDER Bioresearch Monitoring Information System source page and Form 1572/1571 release files.',
  },
  {
    title: 'FDA Form 1572 FAQ & Guidance',
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/frequently-asked-questions-statement-investigator-form-fda-1572',
    category: 'Regulatory & Primary Sources',
    description: 'When sponsors collect Form 1572, investigator responsibilities, and non-US IND waiver rules.',
  },
  {
    title: 'ClinicalTrials.gov Data API v2',
    url: 'https://clinicaltrials.gov/data-api/api',
    category: 'Regulatory & Primary Sources',
    description: 'Primary demand-side source for US & global industry-led interventional trials, facilities, and officials.',
  },
  {
    title: 'WHO ICTRP Search Portal',
    url: 'https://trialsearch.who.int/AdvSearch.aspx',
    category: 'Regulatory & Primary Sources',
    description: 'Global meta-registry aggregating trial counts across 17+ national and regional primary registries.',
  },
  {
    title: 'NMPA / CFDI Trial Institution Filing Portal',
    url: 'https://beian.cfdi.org.cn/CTMDS/apps/pub/drugPublic1.jsp',
    category: 'Regulatory & Primary Sources',
    description: 'Public Chinese clinical trial site & investigator affiliation filing registry (药物和医疗器械临床试验机构备案系统).',
  },
  {
    title: 'EORTC Statement Replacing Form FDA 1572',
    url: 'https://www.eortc.org/blog/2021/02/23/new-statement-to-replace-the-form-fda-1572-form-for-non-ind-trials-supported-by-nci/',
    category: 'EU 1572 Policy Context',
    description: 'Explains why EU GCP inspectors prohibited Form 1572 signing and the 2021* administrative drop in EU BMIS counts.',
  },
  {
    title: 'NCI RCR International Investigator Statement',
    url: 'https://dctd.cancer.gov/research/ctep-trials/for-sites/registration',
    category: 'EU 1572 Policy Context',
    description: 'NCI Registration and Credential Repository replacement pathway for European clinical trial investigators.',
  },
  {
    title: 'EU Break Study Specification (docs/eu_break.md)',
    url: 'https://github.com/henryweimd/bmis1572/blob/main/docs/eu_break.md',
    category: 'Methodology & Exports',
    description: 'Pre-registered OLS pre-trend extrapolation, placebo tests (2016/2017), and decision rule.',
  },
  {
    title: 'CT.gov Site Cross-Check Methodology (docs/linkage.md)',
    url: 'https://github.com/henryweimd/bmis1572/blob/main/docs/linkage.md',
    category: 'Methodology & Exports',
    description: 'How BMIS site addresses join to CT.gov institution×city facilities and how to interpret plausible vs. strong counts.',
  },
  {
    title: 'CT.gov Person Linkage Audit (docs/linkage_audit.md)',
    url: 'https://github.com/henryweimd/bmis1572/blob/main/docs/linkage_audit.md',
    category: 'Methodology & Exports',
    description: 'Manual precision audit of strong (~80%) and weak (~60%) investigator↔official linkage tiers.',
  },
  {
    title: 'WHO ICTRP Methodology Notes (docs/who.md)',
    url: 'https://github.com/henryweimd/bmis1572/blob/main/docs/who.md',
    category: 'Methodology & Exports',
    description: 'Multi-country overlap rules, records vs. deduplicated trials, and verified portal indexing gaps.',
  },
];

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
