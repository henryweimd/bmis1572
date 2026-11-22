import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { escapeLiteral, query } from './duckdb';
import type { Manifest } from './duckdb';
import { CategoryBars, MultiLineChart, StackedMultiBars, TrendChart, VintageHeatmap } from './charts';
import type { LineSeries, VintageRow } from './charts';
import { intIn, pick, readHash, writeHash } from './hash';
import { downloadCsv, stackedCsv, trendCsv } from './csv';
import {
  BANDS,
  BAND_COLORS,
  LATEST_FULL,
  VERSIONS,
  VERSION_LABEL,
  VINTAGE_KMAX,
  YEAR_MAX,
  YEAR_MIN,
} from './lib/constants';
import type { Version } from './lib/constants';
import {
  clampYearPair,
  fmtInt,
  fmtState,
  fmtVerdict,
  growthPct,
  normName,
  num,
  num0,
  pct,
  pivotVintage,
  yearRange,
} from './lib/format';
import type { RawVintageRow } from './lib/format';
import { useShortlist } from './lib/shortlist';
import { IconBookmark } from './components/Icons';
import type { FeasibilityPreset } from './OverviewTab';

type InvSection = 'all' | 'supply' | 'eu-break' | 'tightness' | 'retention' | 'search';

const INV_SECTIONS: readonly { id: InvSection; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'supply', label: 'Supply & Geography' },
  { id: 'eu-break', label: 'EU Break & Movers' },
  { id: 'tightness', label: 'Tightness' },
  { id: 'retention', label: 'Retention' },
  { id: 'search', label: 'Search & Leaders' },
];

interface GeoRow {
  y: number;
  band: string;
  n: number;
}
interface NewRetRow {
  y: number;
  n_new: number;
  n_ret: number;
}
interface TightRow {
  y: number;
  pr: number | null;
  ps: number | null;
}
interface BinRow {
  bin: string;
  n: number;
}
interface LeaderRow {
  rank: number;
  display_name: string;
  deg: string | null;
  site: string | null;
  city: string | null;
  state: string | null;
  country: string;
  n_trials: number;
  n_years: number;
  first_year: number;
  last_year: number;
  tpy: number;
}
interface TopRow {
  name: string;
  n: number;
}
interface CohortRow {
  cohort: number;
  n_persons: number;
  mean_trials: number;
  median_trials: number;
  one_trial_share: number;
}
interface EntRow {
  y: number;
  type: string;
  n: number;
}
interface EuObsRow {
  y: number;
  n: number;
}
interface EuExpRow {
  y: number;
  e: number;
}
interface EuSumRow {
  run: string;
  band: string;
  gn: number;
  gs: number;
  verdict: string;
}
interface DecompRow {
  cohort: number;
  k: number;
  n: number;
  c: number;
  re: number;
}
interface MoverRow {
  name: string;
  np: number;
  verdict: string;
  countries: string;
  y0: number;
  y1: number;
  nt: number;
}
interface MoverSum {
  nc: number;
  mv: number;
  co: number;
  am: number;
  pic: number;
  adjAll: number;
  adjMv: number;
}
interface HitRow {
  person_id: string;
  display_name: string;
  site: string | null;
  country: string;
  n_trials: number;
  n_years: number;
  first_year: number;
  last_year: number;
}
interface LinkRow {
  nct: string;
  role: string;
  tier: string;
  sponsor: string;
  phase: string;
  ta: string;
  start_y: number | null;
}
interface RcRow {
  rcvd: string;
  site: string | null;
  city: string | null;
  state: string | null;
  country: string;
  invn: string;
  site_n: number;
}

const BIN_ORDER = [...Array.from({ length: 14 }, (_, i) => String(i + 1)), '15+'];
const YEAR_OPTS = yearRange(YEAR_MIN, YEAR_MAX);

export default function InvestigatorsTab({
  ready,
  demo,
  manifest,
  jumpRequest,
  sectionRequest,
  onJumpSite,
  onLaunchFeasibility,
  onJumpDefinition,
}: {
  ready: boolean;
  demo: boolean;
  manifest: Manifest | null;
  jumpRequest: { name: string; seq: number } | null;
  sectionRequest?: { section: string; seq: number } | null;
  onJumpSite: (siteN: number) => void;
  onLaunchFeasibility?: (preset: FeasibilityPreset) => void;
  onJumpDefinition?: (term: string) => void;
}) {
  const [hashInit] = useState(readHash);
  const [section, setSection] = useState<InvSection>(() =>
    pick(
      hashInit.sec,
      ['all', 'supply', 'eu-break', 'tightness', 'retention', 'search'] as const,
      'all',
    ),
  );
  const { hasPi, togglePi } = useShortlist();
  const [version, setVersion] = useState<Version>(() => pick(hashInit.v, VERSIONS, 'strict'));
  const [band, setBand] = useState(() => pick(hashInit.b, ['all', ...BANDS], 'all'));
  const [[y0, y1], setYears] = useState<[number, number]>(() =>
    clampYearPair(
      intIn(hashInit.y0, YEAR_MIN, YEAR_MAX, YEAR_MIN),
      intIn(hashInit.y1, YEAR_MIN, YEAR_MAX, YEAR_MAX),
      YEAR_MIN,
      YEAR_MAX,
    ),
  );
  const [leaderGeo, setLeaderGeo] = useState(() => pick(hashInit.lg, ['ALL', ...BANDS], 'ALL'));
  const [leaderSort, setLeaderSort] = useState<'total' | 'rate'>(() =>
    pick(hashInit.ls, ['total', 'rate'] as const, 'total'),
  );
  const [tightScope, setTightScope] = useState<'adjusted' | 'unadjusted'>(() =>
    pick(hashInit.ts, ['adjusted', 'unadjusted'] as const, 'adjusted'),
  );
  const [retMode, setRetMode] = useState<'attrition' | 'reentry'>(() =>
    pick(hashInit.rm, ['attrition', 'reentry'] as const, 'attrition'),
  );
  const [retBand, setRetBand] = useState<string>(() =>
    pick(hashInit.rb, ['all', ...BANDS], 'all'),
  );
  const searchSeq = useRef(0);
  const selectSeq = useRef(0);

  const [note, setNote] = useState('');
  const [coreKpi, setCoreKpi] = useState<{ active: number; active09: number; nnew: number } | null>(null);
  const [oneTrialKpi, setOneTrialKpi] = useState<number | null>(null);
  const [tightKpi, setTightKpi] = useState<number | null>(null);

  const [geo, setGeo] = useState<LineSeries[]>([]);
  const [geoNew, setGeoNew] = useState<LineSeries[]>([]);
  const [newret, setNewret] = useState<LineSeries[]>([]);
  const [workload, setWorkload] = useState<{ d: string; v: number }[]>([]);
  const [ents, setEnts] = useState<LineSeries[]>([]);

  const [tight, setTight] = useState<LineSeries[]>([]);
  const [bins, setBins] = useState<{ category: string; v: number }[]>([]);
  const [pbins, setPbins] = useState<{ category: string; v: number }[]>([]);
  const [oadBand, setOadBand] = useState<{ b: string; n: number; s: number }[]>([]);
  const [conc, setConc] = useState<LineSeries[]>([]);
  const [countries, setCountries] = useState<{ category: string; v: number }[]>([]);
  const [states, setStates] = useState<{ category: string; v: number }[]>([]);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [euSeries, setEuSeries] = useState<LineSeries[]>([]);
  const [euSum, setEuSum] = useState<EuSumRow[]>([]);
  const [mvTop, setMvTop] = useState<MoverRow[]>([]);
  const [mvSum, setMvSum] = useState<MoverSum | null>(null);

  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [ret, setRet] = useState<VintageRow[]>([]);
  const [ret5, setRet5] = useState<{ d: string; v: number }[]>([]);
  const [retD, setRetD] = useState<DecompRow[]>([]);

  const [q, setQ] = useState('');
  const [searchBand, setSearchBand] = useState('all');
  const [minTrials, setMinTrials] = useState('');
  const [hits, setHits] = useState<HitRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  const [receipts, setReceipts] = useState<RcRow[]>([]);
  const [rcTotal, setRcTotal] = useState(0);
  const [linked, setLinked] = useState<LinkRow[]>([]);
  const [colleagues, setColleagues] = useState<HitRow[]>([]);

  useEffect(() => {
    if (!sectionRequest) return;
    const valid = pick(
      sectionRequest.section,
      ['all', 'supply', 'eu-break', 'tightness', 'retention', 'search'] as const,
      'all',
    );
    setSection(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionRequest?.seq]);

  useEffect(() => {
    writeHash({
      v: version,
      b: band,
      y0: String(y0),
      y1: String(y1),
      lg: leaderGeo,
      ls: leaderSort,
      ts: tightScope,
      rm: retMode,
      rb: retBand,
      sec: section === 'all' ? '' : section,
    });
  }, [version, band, y0, y1, leaderGeo, leaderSort, tightScope, retMode, retBand, section]);

  // 1. Core geo, new/returning, workload, and IRB/CRO entity context.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const v = escapeLiteral(version);
        const bandClause = band === 'all' ? '' : ` AND band = '${escapeLiteral(band)}'`;
        const bcJ =
          band === 'all'
            ? ''
            : ` AND s.band = '${escapeLiteral(band)}' AND i.band = '${escapeLiteral(band)}'`;

        const [k, g, nr, gn, wl, en] = await Promise.all([
          query<{ active: number; active09: number; nnew: number }>(
            `SELECT CAST(SUM(CASE WHEN year = ${LATEST_FULL} THEN n_active ELSE 0 END) AS DOUBLE) AS active,` +
              ` CAST(SUM(CASE WHEN year = 2009 THEN n_active ELSE 0 END) AS DOUBLE) AS active09,` +
              ` CAST(SUM(CASE WHEN year = ${LATEST_FULL} THEN n_new ELSE 0 END) AS DOUBLE) AS nnew` +
              ` FROM investigators_year_geo WHERE version = '${v}'${bandClause}`,
          ),
          query<GeoRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(band AS VARCHAR) AS band,` +
              ` CAST(SUM(n_active) AS DOUBLE) AS n FROM investigators_year_geo` +
              ` WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1}${bandClause}` +
              ` GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
          query<NewRetRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(SUM(n_new) AS DOUBLE) AS n_new,` +
              ` CAST(SUM(n_returning) AS DOUBLE) AS n_ret FROM investigators_year_geo` +
              ` WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1}${bandClause}` +
              ` GROUP BY 1 ORDER BY 1`,
          ),
          query<GeoRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(band AS VARCHAR) AS band,` +
              ` CAST(SUM(n_new) AS DOUBLE) AS n FROM investigators_year_geo` +
              ` WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1}${bandClause}` +
              ` GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
          demo
            ? Promise.resolve([])
            : query<{ y: number; m: number }>(
                `SELECT CAST(s.year AS INTEGER) AS y,` +
                  ` CAST(SUM(s.n_receipts) AS DOUBLE) / NULLIF(SUM(i.n_active), 0) AS m` +
                  ` FROM sites_year_geo s JOIN investigators_year_geo i` +
                  ` ON i.version = s.version AND i.year = s.year AND i.band = s.band` +
                  ` WHERE s.version = '${v === 'raw' ? 'strict' : v}' AND s.year BETWEEN ${y0} AND ${y1}${bcJ}` +
                  ` GROUP BY 1 ORDER BY 1`,
              ),
          demo
            ? Promise.resolve([])
            : query<EntRow>(
                `SELECT CAST(year AS INTEGER) AS y, CAST(type AS VARCHAR) AS type,` +
                  ` CAST(SUM(n_entities) AS DOUBLE) AS n FROM irb_cro_year` +
                  ` WHERE type IN ('IRB', 'CRO') AND year BETWEEN ${y0} AND ${y1}` +
                  ` GROUP BY 1, 2 ORDER BY 1, 2`,
              ),
        ]);
        if (cancelled) return;
        const bands = band === 'all' ? [...BANDS] : [band];
        setCoreKpi({
          active: num0(k[0]?.active),
          active09: num0(k[0]?.active09),
          nnew: num0(k[0]?.nnew),
        });
        setGeo(
          bands.map((b) => ({
            label: b,
            color: BAND_COLORS[b] ?? '#333',
            points: g.filter((r) => r.band === b).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        setGeoNew(
          bands.map((b) => ({
            label: b,
            color: BAND_COLORS[b] ?? '#333',
            points: gn.filter((r) => r.band === b).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        setNewret([
          { label: 'Returning', color: '#1f77b4', points: nr.map((r) => ({ x: r.y, y: num0(r.n_ret) })) },
          { label: 'New', color: '#ff7f0e', points: nr.map((r) => ({ x: r.y, y: num0(r.n_new) })) },
        ]);
        setWorkload(wl.map((r) => ({ d: String(r.y), v: num0(r.m) })));
        setEnts(
          ['IRB', 'CRO'].map((t, i) => ({
            label: t,
            color: ['#2ca02c', '#9467bd'][i],
            points: en.filter((r) => r.type === t).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`Query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, version, band, y0, y1]);

  // 2. Tightness benchmark (decoupled from band/leaderboard/retention).
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const v = escapeLiteral(version);
        const [ti, tser] = await Promise.all([
          query<{ pr: number | null; ps: number | null }>(
            `SELECT CAST(per_running AS DOUBLE) AS pr, CAST(per_start AS DOUBLE) AS ps` +
              ` FROM tightness WHERE version = '${v}'` +
              ` AND scope = '${tightScope}' AND year = ${LATEST_FULL}`,
          ),
          query<TightRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(per_running AS DOUBLE) AS pr,` +
              ` CAST(per_start AS DOUBLE) AS ps FROM tightness WHERE version = '${v}'` +
              ` AND scope = '${tightScope}' AND year BETWEEN ${y0} AND ${y1} ORDER BY 1`,
          ),
        ]);
        if (cancelled) return;
        setTightKpi(num(tightScope === 'adjusted' ? ti[0]?.pr : ti[0]?.ps));
        setTight(
          tightScope === 'adjusted'
            ? [
                {
                  label: 'Active per running trial',
                  color: '#d62728',
                  points: tser.map((r) => ({ x: r.y, y: num(r.pr) })),
                },
                {
                  label: 'Active per started trial',
                  color: '#1f77b4',
                  points: tser.map((r) => ({ x: r.y, y: num(r.ps) })),
                },
              ]
            : [
                {
                  label: 'Active per started trial',
                  color: '#1f77b4',
                  points: tser.map((r) => ({ x: r.y, y: num(r.ps) })),
                },
              ],
        );
      } catch (e) {
        if (cancelled) return;
        setNote(`Tightness query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, version, y0, y1, tightScope]);

  // 3. Distribution, concentration, geography snapshots, EU break & movers (version/year scoped).
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const v = escapeLiteral(version);
        const [ot, bn, pb, ob, cn, cy, sy, ch, euO, euE, euS, mvt, mvs] = await Promise.all([
          query<{ v: number | null }>(
            `SELECT CAST(SUM(CASE WHEN bin = '1' THEN n_active ELSE 0 END) AS DOUBLE) /` +
              ` NULLIF(CAST(SUM(n_active) AS DOUBLE), 0) AS v FROM active_bins` +
              ` WHERE version = '${v}' AND year = ${LATEST_FULL}`,
          ),
          query<BinRow>(
            `SELECT CAST(bin AS VARCHAR) AS bin, CAST(SUM(n_active) AS DOUBLE) AS n` +
              ` FROM active_bins WHERE version = '${v}' GROUP BY 1`,
          ),
          query<BinRow>(
            `SELECT CASE WHEN n_trials >= 15 THEN '15+' ELSE CAST(n_trials AS VARCHAR) END AS bin,` +
              ` CAST(COUNT(*) AS DOUBLE) AS n FROM person_index GROUP BY 1`,
          ),
          query<{ b: string; n: number; s: number }>(
            `SELECT CAST(band AS VARCHAR) AS b, CAST(COUNT(*) AS DOUBLE) AS n,` +
              ` CAST(SUM(CASE WHEN n_trials = 1 THEN 1 ELSE 0 END) AS DOUBLE) / COUNT(*) AS s` +
              ` FROM person_index GROUP BY 1 ORDER BY 3 DESC`,
          ),
          query<{ y: number; t1: number; t10: number; g: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(top1_share AS DOUBLE) AS t1,` +
              ` CAST(top10_share AS DOUBLE) AS t10, CAST(gini AS DOUBLE) AS g` +
              ` FROM concentration WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1} ORDER BY 1`,
          ),
          query<TopRow>(
            `SELECT CAST(country AS VARCHAR) AS name, CAST(SUM(n_active) AS DOUBLE) AS n` +
              ` FROM country_year WHERE version = '${v}' AND year = ${LATEST_FULL}` +
              ` GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
          ),
          query<TopRow>(
            `SELECT CAST(state AS VARCHAR) AS name, CAST(SUM(n_active) AS DOUBLE) AS n` +
              ` FROM us_state_year WHERE version = '${v}' AND year = ${LATEST_FULL}` +
              ` GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
          ),
          query<CohortRow>(
            `SELECT CAST(cohort AS INTEGER) AS cohort, CAST(n_persons AS DOUBLE) AS n_persons,` +
              ` CAST(mean_trials AS DOUBLE) AS mean_trials, CAST(median_trials AS DOUBLE) AS median_trials,` +
              ` CAST(one_trial_share AS DOUBLE) AS one_trial_share FROM cohort_summary` +
              ` WHERE version = '${v}' AND cohort >= ${YEAR_MIN} ORDER BY 1`,
          ),
          query<EuObsRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(n_active AS DOUBLE) AS n` +
              ` FROM investigators_year_geo WHERE version = 'merged'` +
              ` AND band = 'Europe (EU+UK)' AND year BETWEEN 2009 AND 2025 ORDER BY 1`,
          ),
          query<EuExpRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(exp_n AS DOUBLE) AS e` +
              ` FROM eu_break_band WHERE run = '2021' AND band = 'Europe (EU+UK)' ORDER BY 1`,
          ),
          query<EuSumRow>(
            `SELECT CAST(run AS VARCHAR) AS run, CAST(band AS VARCHAR) AS band,` +
              ` CAST(post_gap_n AS DOUBLE) AS gn, CAST(post_gap_share AS DOUBLE) AS gs,` +
              ` CAST(verdict AS VARCHAR) AS verdict FROM eu_break_summary ORDER BY 1, 2`,
          ),
          query<MoverRow>(
            `SELECT CAST(display_name AS VARCHAR) AS name, CAST(n_persons AS INTEGER) AS np,` +
              ` CAST(verdict AS VARCHAR) AS verdict, CAST(countries AS VARCHAR) AS countries,` +
              ` CAST(first_year AS INTEGER) AS y0, CAST(last_year AS INTEGER) AS y1,` +
              ` CAST(n_trials AS INTEGER) AS nt FROM mover_cluster ORDER BY n_persons DESC LIMIT 25`,
          ),
          query<MoverSum>(
            `SELECT CAST(n_clusters AS INTEGER) AS nc, CAST(n_mover_likely AS INTEGER) AS mv,` +
              ` CAST(n_collision_likely AS INTEGER) AS co, CAST(n_ambiguous AS INTEGER) AS am,` +
              ` CAST(persons_in_clusters AS INTEGER) AS pic, CAST(adj_merge_all AS INTEGER) AS adjAll,` +
              ` CAST(adj_movers_only AS INTEGER) AS adjMv FROM mover_summary LIMIT 1`,
          ),
        ]);
        if (cancelled) return;
        setOneTrialKpi(num(ot[0]?.v));
        setBins(
          bn
            .map((r) => ({ category: r.bin, v: num0(r.n) }))
            .sort((a, b) => BIN_ORDER.indexOf(a.category) - BIN_ORDER.indexOf(b.category)),
        );
        setPbins(
          pb
            .map((r) => ({ category: r.bin, v: num0(r.n) }))
            .sort((a, b) => BIN_ORDER.indexOf(a.category) - BIN_ORDER.indexOf(b.category)),
        );
        setOadBand(ob.map((r) => ({ b: r.b, n: num0(r.n), s: num0(r.s) })));
        const concDefs: { label: string; color: string; key: 't1' | 't10' | 'g' }[] = [
          { label: 'Top 1% share', color: '#d62728', key: 't1' },
          { label: 'Top 10% share', color: '#1f77b4', key: 't10' },
          { label: 'Gini ×100', color: '#2ca02c', key: 'g' },
        ];
        setConc(
          concDefs.map((s) => ({
            label: s.label,
            color: s.color,
            points: cn.map((r) => ({ x: r.y, y: num0(r[s.key]) * 100 })),
          })),
        );
        setCountries(cy.map((r) => ({ category: r.name, v: num0(r.n) })));
        setStates(sy.map((r) => ({ category: r.name, v: num0(r.n) })));
        setCohorts(ch);
        setEuSeries([
          { label: 'EU observed', color: '#ff7f0e', points: euO.map((r) => ({ x: r.y, y: num0(r.n) })) },
          { label: 'Pre-trend expected', color: '#334155', points: euE.map((r) => ({ x: r.y, y: num0(r.e) })) },
        ]);
        setEuSum(euS);
        setMvTop(mvt);
        setMvSum(mvs[0] ?? null);
      } catch (e) {
        if (cancelled) return;
        setNote(`Distribution query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, version, y0, y1]);

  // 4. Leaderboard (only re-runs when leaderboard controls or version change).
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const v = escapeLiteral(version);
        const lb = await query<LeaderRow>(
          `SELECT CAST(rank AS INTEGER) AS rank, CAST(display_name AS VARCHAR) AS display_name,` +
            ` CAST(deg AS VARCHAR) AS deg, CAST(site AS VARCHAR) AS site,` +
            ` CAST(city AS VARCHAR) AS city, CAST(state AS VARCHAR) AS state,` +
            ` CAST(country AS VARCHAR) AS country, CAST(n_trials AS DOUBLE) AS n_trials,` +
            ` CAST(n_years AS INTEGER) AS n_years, CAST(first_year AS INTEGER) AS first_year,` +
            ` CAST(last_year AS INTEGER) AS last_year, CAST(tpy AS DOUBLE) AS tpy` +
            ` FROM leaderboard WHERE version = '${v}' AND metric = '${leaderSort === 'rate' ? 'rate' : 'receipts'}'` +
            (leaderGeo === 'ALL'
              ? ` AND scope = 'global'`
              : ` AND scope = 'band' AND scope_value = '${escapeLiteral(leaderGeo)}'`) +
            ` ORDER BY rank LIMIT 25`,
        );
        if (cancelled) return;
        setLeaders(lb);
      } catch (e) {
        if (cancelled) return;
        setNote(`Leaderboard query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, version, leaderGeo, leaderSort]);

  // 5. Vintage retention & decomposition (only re-runs when version or retBand changes).
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const v = escapeLiteral(version);
        const [rt, r5, rdd] = await Promise.all([
          query<RawVintageRow>(
            `SELECT CAST(cohort AS INTEGER) AS cohort, CAST(k AS INTEGER) AS k,` +
              ` CAST(retention AS DOUBLE) AS v, CAST(n_cohort AS INTEGER) AS n,` +
              ` CAST(n_active AS INTEGER) AS na FROM retention` +
              ` WHERE version = '${v}' AND cohort BETWEEN 2009 AND 2025 AND k <= ${VINTAGE_KMAX} ORDER BY 1, 2`,
          ),
          query<{ c: number; v: number }>(
            `SELECT CAST(cohort AS INTEGER) AS c, CAST(100 * retention AS DOUBLE) AS v` +
              ` FROM retention WHERE version = '${v}' AND k = 5 AND cohort BETWEEN 2009 AND 2020 ORDER BY 1`,
          ),
          query<DecompRow>(
            `SELECT CAST(cohort AS INTEGER) AS cohort, CAST(k AS INTEGER) AS k,` +
              ` CAST(SUM(n_cohort) AS DOUBLE) AS n, CAST(SUM(n_continuous) AS DOUBLE) AS c,` +
              ` CAST(SUM(n_reentered) AS DOUBLE) AS re FROM retention_decomp` +
              ` WHERE version = '${v}' AND cohort BETWEEN 2009 AND 2025 AND k <= ${VINTAGE_KMAX}` +
              (retBand === 'all' ? '' : ` AND band = '${escapeLiteral(retBand)}'`) +
              ` GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
        ]);
        if (cancelled) return;
        setRet(pivotVintage(rt, VINTAGE_KMAX));
        setRet5(r5.map((r) => ({ d: String(r.c), v: num0(r.v) })));
        setRetD(rdd);
      } catch (e) {
        if (cancelled) return;
        setNote(`Retention query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, version, retBand]);

  const retShow = useMemo<VintageRow[]>(() => {
    if (retMode === 'attrition' && retBand === 'all') return ret;
    const byCohort = new Map<number, Map<number, DecompRow>>();
    for (const r of retD) {
      let m = byCohort.get(r.cohort);
      if (!m) {
        m = new Map();
        byCohort.set(r.cohort, m);
      }
      m.set(r.k, r);
    }
    return [...byCohort.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([c, m]) => {
        const first = m.get(0) ?? [...m.values()][0];
        const n = num0(first?.n);
        const cells = Array.from({ length: VINTAGE_KMAX + 1 }, (_, k) => {
          const r = m.get(k);
          if (!r || !num0(r.n)) return null;
          if (retMode === 'attrition') return ((num0(r.c) + num0(r.re)) / num0(r.n)) * 100;
          if (k === 0) return null;
          const a = num0(r.c) + num0(r.re);
          return a > 0 ? (num0(r.re) / a) * 100 : null;
        });
        const counts = Array.from({ length: VINTAGE_KMAX + 1 }, (_, k) => {
          const r = m.get(k);
          if (!r) return null;
          return retMode === 'attrition' ? num0(r.c) + num0(r.re) : num0(r.re);
        });
        return { cohort: c, n, cells, counts };
      });
  }, [ret, retD, retMode, retBand]);

  const runSearch = useCallback(
    async (override?: string) => {
      if (demo || !ready) return;
      if (override !== undefined) setQ(override);
      const needle = normName(override ?? q);
      if (!needle) {
        setHits([]);
        setSearched(false);
        return;
      }
      const seq = ++searchSeq.current;
      try {
        const bc = searchBand === 'all' ? '' : ` AND band = '${escapeLiteral(searchBand)}'`;
        const mt = /^\d+$/.test(minTrials.trim()) ? ` AND n_trials >= ${parseInt(minTrials.trim(), 10)}` : '';
        const r = await query<HitRow>(
          `SELECT CAST(person_id AS VARCHAR) AS person_id, CAST(display_name AS VARCHAR) AS display_name,` +
            ` CAST(site AS VARCHAR) AS site, CAST(country AS VARCHAR) AS country, CAST(n_trials AS INTEGER) AS n_trials,` +
            ` CAST(n_years AS INTEGER) AS n_years, CAST(first_year AS INTEGER) AS first_year,` +
            ` CAST(last_year AS INTEGER) AS last_year FROM person_index` +
            ` WHERE name_key LIKE '%${needle}%'${bc}${mt} ORDER BY n_trials DESC LIMIT 50`,
        );
        if (seq !== searchSeq.current) return;
        setHits(r);
        setSearched(true);
        setSel(null);
        setReceipts([]);
        setLinked([]);
        setColleagues([]);
      } catch (e) {
        if (seq !== searchSeq.current) return;
        setNote(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [demo, ready, q, searchBand, minTrials],
  );

  // Handle cross-tab jump requests (from Sites / Trials tabs).
  useEffect(() => {
    if (!jumpRequest || !ready || demo) return;
    setSection('search');
    runSearch(jumpRequest.name);
    const t = setTimeout(() => {
      document.getElementById('inv-search')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpRequest?.seq, ready, demo]);

  const inspectName = (name: string) => {
    setSection('search');
    runSearch(name);
    setTimeout(() => document.getElementById('inv-search')?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  const selectPerson = async (id: string, name: string) => {
    const seq = ++selectSeq.current;
    setSel({ id, name });
    setReceipts([]);
    setRcTotal(0);
    setLinked([]);
    setColleagues([]);
    try {
      const pid = escapeLiteral(id);
      const [rows, cnt, lk, cg] = await Promise.all([
        query<RcRow>(
          `SELECT CAST(rcvd AS VARCHAR) AS rcvd, CAST(site AS VARCHAR) AS site,` +
            ` CAST(city AS VARCHAR) AS city, CAST(state AS VARCHAR) AS state,` +
            ` CAST(country AS VARCHAR) AS country, CAST(invn AS VARCHAR) AS invn,` +
            ` CAST(site_strict AS INTEGER) AS site_n` +
            ` FROM person_receipts WHERE person_id = '${pid}' ORDER BY rcvd DESC LIMIT 1000`,
        ),
        query<{ n: number }>(`SELECT COUNT(*) AS n FROM person_receipts WHERE person_id = '${pid}'`),
        query<LinkRow>(
          `SELECT CAST(l.nct AS VARCHAR) AS nct, CAST(l.role AS VARCHAR) AS role,` +
            ` CAST(l.tier AS VARCHAR) AS tier, CAST(o.sponsor_disp AS VARCHAR) AS sponsor,` +
            ` CAST(o.phase AS VARCHAR) AS phase, CAST(o.ta AS VARCHAR) AS ta,` +
            ` CAST(o.start_y AS INTEGER) AS start_y` +
            ` FROM person_ctgov_link l JOIN ctgov_officials o ON o.nct = l.nct AND o.name_raw = l.off_name` +
            ` WHERE l.person_id = '${pid}' ORDER BY o.start_y DESC NULLS LAST, l.nct`,
        ).catch(() => [] as LinkRow[]),
        query<HitRow>(
          `SELECT CAST(q.person_id AS VARCHAR) AS person_id,` +
            ` CAST(q.display_name AS VARCHAR) AS display_name,` +
            ` CAST(q.site AS VARCHAR) AS site, CAST(q.country AS VARCHAR) AS country,` +
            ` CAST(q.n_trials AS INTEGER) AS n_trials, CAST(q.n_years AS INTEGER) AS n_years,` +
            ` CAST(q.first_year AS INTEGER) AS first_year,` +
            ` CAST(q.last_year AS INTEGER) AS last_year FROM person_index q` +
            ` JOIN person_index me ON me.person_id = '${pid}' AND q.site = me.site` +
            ` WHERE q.person_id != '${pid}' ORDER BY q.n_trials DESC LIMIT 10`,
        ).catch(() => [] as HitRow[]),
      ]);
      if (seq !== selectSeq.current) return;
      setReceipts(rows);
      setRcTotal(num0(cnt[0]?.n));
      setLinked(lk);
      setColleagues(cg);
    } catch (e) {
      if (seq !== selectSeq.current) return;
      setNote(`Receipts query failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const receiptsByYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of receipts) {
      const y = (r.rcvd ?? '').slice(0, 4);
      if (/^\d{4}$/.test(y)) m.set(y, (m.get(y) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, v]) => ({ category, v }));
  }, [receipts]);

  const growth = growthPct(coreKpi?.active, coreKpi?.active09);
  const showSec = (id: Exclude<InvSection, 'all'>) => section === 'all' || section === id;

  return (
    <>
      {note && <p className="banner">{note}</p>}
      <div className="subnav" role="navigation" aria-label="Investigators sections">
        {INV_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip${section === s.id ? ' active' : ''}`}
            aria-pressed={section === s.id}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
        {onLaunchFeasibility && (
          <button
            type="button"
            className="chip chip-accent"
            onClick={() =>
              onLaunchFeasibility({ mode: 'pis', band: band === 'all' ? 'United States' : band, minYear: 2023 })
            }
          >
            Screen PIs →
          </button>
        )}
      </div>

      <section className="panel controls">
        <div className="filters">
          <div className="filter-group">
            <span className="filter-label">Clustering</span>
            <div className="seg" role="group" aria-label="Person version">
              {VERSIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={version === v ? 'active' : ''}
                  aria-pressed={version === v}
                  onClick={() => setVersion(v)}
                  title={manifest?.versions?.[v] ?? v}
                >
                  {VERSION_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <label>
            Geography
            <select value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="all">All bands</option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <select
              value={y0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setYears([v, Math.max(v, y1)]);
              }}
            >
              {YEAR_OPTS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select
              value={y1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setYears([Math.min(y0, v), v]);
              }}
            >
              {YEAR_OPTS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Year zoom presets">
            {[
              { label: 'Full', from: 2008, to: 2026 },
              { label: '2015+', from: 2015, to: 2026 },
              { label: '2020+', from: 2020, to: 2026 },
            ].map((p) => (
              <button
                key={p.label}
                className={y0 === p.from && y1 === p.to ? 'active' : ''}
                onClick={() => setYears([p.from, p.to])}
                title={`Zoom years to ${p.from}–${p.to}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="kpis four">
        <div className="kpi">
          <span className="kpi-label">Active investigators, {LATEST_FULL}</span>
          <span className="kpi-value">{coreKpi ? fmtInt.format(coreKpi.active) : '—'}</span>
          <span className="kpi-sub">{growth !== null ? `${growth}% vs 2009` : '\u00A0'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">New in {LATEST_FULL}</span>
          <span className="kpi-value">{coreKpi ? fmtInt.format(coreKpi.nnew) : '—'}</span>
          <span className="kpi-sub">
            {coreKpi && coreKpi.active > 0 ? `${pct(coreKpi.nnew / coreKpi.active)} of active` : '\u00A0'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">One-trial share of active (global)</span>
          <span className="kpi-value">{pct(oneTrialKpi)}</span>
          <span className="kpi-sub">{VERSION_LABEL[version]} persons</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            {tightScope === 'adjusted' ? 'Active per running trial, US' : 'Active per started trial, global'}
          </span>
          <span className="kpi-value">{tightKpi !== null ? tightKpi.toFixed(2) : '—'}</span>
          <span className="kpi-sub">{tightScope} scope</span>
        </div>
      </section>

      {showSec('supply') && (
      <section className="panel">
        <div className="panel-head">
          <h2>Active investigators per year{band === 'all' ? ' by geography' : `: ${band}`}</h2>
          <div className="header-actions">
            {onJumpDefinition && (
              <button
                type="button"
                className="link-btn"
                onClick={() => onJumpDefinition('2021* EU 1572 note')}
              >
                2021* note
              </button>
            )}
            {!!geo.length && (
              <button type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => stackedCsv(`active-investigators-${version}.csv`, geo)}
              >
                CSV
              </button>
            )}
          </div>
        </div>
        <StackedMultiBars series={geo} marks={{ 2021: '*' }} />
        <p className="caption">
          Active = ≥1 BMIS receipt in year · {VERSION_LABEL[version]} persons · 2008 (ramp-up) and 2026
          (thru Aug) are partial. Toggle 100% for yearly share; click legend items to filter series.
        </p>
        <p className="caption">
          <strong>*</strong> 2021* marked the first full year after 2019, when signing Form FDA 1572 was
          deemed illegal for EU investigators and EU GCP inspectors prohibited its completion;
          replacements for participation in US-led trials followed, including the{' '}
          <a
            href="https://www.eortc.org/blog/2021/02/23/new-statement-to-replace-the-form-fda-1572-form-for-non-ind-trials-supported-by-nci/"
            target="_blank"
            rel="noreferrer"
          >
            EORTC statement replacing Form FDA 1572 for non-IND trials supported by NCI
          </a>{' '}
          and the new{' '}
          <a
            href="https://dctd.cancer.gov/research/ctep-trials/for-sites/registration"
            target="_blank"
            rel="noreferrer"
          >
            International Investigator Statement created by NCI in the Registration and Credential
            Repository (RCR)
          </a>{' '}
          for European countries.
        </p>
      </section>
      )}

      {showSec('eu-break') && (
      <>
      <section className="panel">
        <div className="panel-head">
          <h2>EU break study: observed vs pre-trend</h2>
          {!!euSum.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(
                  'eu-break-summary.csv',
                  ['run', 'band', 'post_gap_n', 'post_gap_share', 'verdict'],
                  euSum.map((r) => [r.run, r.band, Math.round(r.gn), r.gs, r.verdict]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        {demo ? (
          <p className="muted">Run the pipeline for break-study data.</p>
        ) : (
          <>
            <MultiLineChart series={euSeries} refLines={[{ x: 2021, label: '2021*' }]} />
            <div className="table-scroll short">
              <table>
                <thead>
                  <tr>
                    <th>Break</th>
                    <th>Band</th>
                    <th className="num">Level gap/yr</th>
                    <th className="num">Share gap</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {euSum.map((r) => (
                    <tr key={`${r.run}-${r.band}`}>
                      <td>{r.run}</td>
                      <td>{r.band}</td>
                      <td className="num">{fmtInt.format(Math.round(r.gn))}</td>
                      <td className="num">{`${(r.gs * 100).toFixed(1)}pp`}</td>
                      <td>{r.verdict || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">
              Merged persons; OLS on 2009–20 extrapolated to 2021–25 (placebos: 2016, 2017). The EU
              runs ≈4,340 CIs/yr (−62% of pre-mean) below trend while no control band collapses in
              level terms; the US share &lsquo;surge&rsquo; is the compositional mirror of the EU
              exit. Pre-registered verdict: descriptive-only (see Definitions → EU break study).
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Cross-site movers (experimental)</h2>
          {!!mvTop.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(
                  'mover-clusters-top25.csv',
                  ['name', 'n_persons', 'verdict', 'countries', 'first_year', 'last_year', 'n_trials'],
                  mvTop.map((r) => [r.name, r.np, r.verdict, r.countries, r.y0, r.y1, r.nt]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        {demo || !mvSum ? (
          <p className="muted">Run the pipeline for mover data.</p>
        ) : (
          <>
            <p className="prose">
              {fmtInt.format(mvSum.nc)} same-name clusters ({fmtInt.format(mvSum.pic)} merged
              persons): {fmtInt.format(mvSum.mv)} mover-likely, {fmtInt.format(mvSum.am)}{' '}
              ambiguous, {fmtInt.format(mvSum.co)} collision-likely. Merging only mover-likely
              clusters would cut {fmtInt.format(mvSum.adjMv)} persons; merging every cluster{' '}
              {fmtInt.format(mvSum.adjAll)} — bounds, not a revised headline.
            </p>
            <div className="table-scroll short">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Persons</th>
                    <th>Verdict</th>
                    <th>Countries</th>
                    <th>Span</th>
                    <th className="num">Trials</th>
                  </tr>
                </thead>
                <tbody>
                  {mvTop.map((r) => (
                    <tr
                      key={r.name}
                      className="pickable"
                      title="Search this name in Investigator search"
                      onClick={() => inspectName(r.name)}
                    >
                      <td>{r.name}</td>
                      <td className="num">{r.np}</td>
                      <td>{fmtVerdict(r.verdict)}</td>
                      <td>{r.countries}</td>
                      <td>
                        {r.y0}–{r.y1}
                      </td>
                      <td className="num">{fmtInt.format(r.nt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">
              Name-only linkage over merged persons; sequential active years suggest a mover,
              overlapping years across countries suggest a collision (see Definitions). Top 25
              clusters by size; click any row to inspect records.
            </p>
          </>
        )}
      </section>
      </>
      )}

      {showSec('supply') && (
      <>
      <section className="panel">
        <div className="panel-head">
          <h2>New investigators per year{band === 'all' ? ' by geography' : `: ${band}`}</h2>
          {!!geoNew.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => stackedCsv(`new-investigators-${version}.csv`, geoNew)}
            >
              CSV
            </button>
          )}
        </div>
        <StackedMultiBars series={geoNew} marks={{ 2021: '*' }} />
        <p className="caption">
          First receipt ever in that year (2008–09 inflated by file start) ·{' '}
          {VERSION_LABEL[version]} persons. Toggle 100% for yearly share — the newcomer pipeline has
          grown steadily more American. Same 2021* EU note as above.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>New vs. returning</h2>
          {!!newret.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => stackedCsv(`new-vs-returning-${version}.csv`, newret)}
            >
              CSV
            </button>
          )}
        </div>
        <StackedMultiBars series={newret} />
        <p className="caption">New = first receipt ever in that year (2008–09 inflated by file start).</p>
      </section>
      </>
      )}

      {showSec('tightness') && (
      <>
      <section className="panels">
        <div className="panel">
          <div className="panel-head">
            <h2>Tightness: investigators per trial</h2>
            {!!tight.length && (
              <button type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => stackedCsv(`tightness-${version}-${tightScope}.csv`, tight)}
              >
                CSV
              </button>
            )}
          </div>
          {demo ? (
            <p className="muted">Run the pipeline for trial data.</p>
          ) : (
            <>
              <div className="filters">
                <div className="seg" role="group" aria-label="Tightness scope">
                  <button
                    className={tightScope === 'adjusted' ? 'active' : ''}
                    onClick={() => setTightScope('adjusted')}
                    title="US-band persons vs trials with a US site"
                  >
                    Adjusted
                  </button>
                  <button
                    className={tightScope === 'unadjusted' ? 'active' : ''}
                    onClick={() => setTightScope('unadjusted')}
                    title="All BMIS persons vs all global industry trials"
                  >
                    Unadjusted
                  </button>
                </div>
              </div>
              <MultiLineChart series={tight} />
              <p className="caption">
                Adjusted: US-band persons vs industry trials with ≥1 US site. Unadjusted: all BMIS
                persons vs all global industry trials (starts only — the running-trial denominator
                needs per-trial dates, computed for the US subset only). Descriptive workload proxy
                only — supply and trial counts are not independent.
              </p>
            </>
          )}
        </div>
        <div className="panel">
          <h2>Lifetime trial bins (person-years)</h2>
          {demo ? (
            <p className="muted">Run the pipeline for distribution data.</p>
          ) : (
            <>
              <CategoryBars data={bins} />
              <p className="caption">One row = one IND reference; bin by person lifetime total.</p>
            </>
          )}
        </div>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Investigators by lifetime trials (persons)</h2>
          {demo ? (
            <p className="muted">Run the pipeline for distribution data.</p>
          ) : (
            <>
              <CategoryBars data={pbins} />
              <p className="caption">
                Strict persons by lifetime IND references (all years, global).{' '}
                {pbins.length > 0 &&
                  (() => {
                    const tot = pbins.reduce((a, r) => a + r.v, 0);
                    const one = pbins.find((r) => r.category === '1')?.v ?? 0;
                    return tot > 0 ? `${((100 * one) / tot).toFixed(1)}% are one-and-done.` : '';
                  })()}
              </p>
            </>
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>One-and-done share by geography</h2>
            {!!oadBand.length && (
              <button type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadCsv(
                    'one-and-done-by-band.csv',
                    ['band', 'persons', 'one_and_done_share'],
                    oadBand.map((r) => [r.b, r.n, r.s.toFixed(4)]),
                  )
                }
              >
                CSV
              </button>
            )}
          </div>
          {demo ? (
            <p className="muted">Run the pipeline for distribution data.</p>
          ) : (
            <>
              <div className="table-scroll short">
                <table>
                  <thead>
                    <tr>
                      <th>Geography</th>
                      <th className="num">Persons</th>
                      <th className="num">One-and-done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oadBand.map((r) => (
                      <tr key={r.b}>
                        <td>{r.b}</td>
                        <td className="num">{fmtInt.format(r.n)}</td>
                        <td className="num">{(100 * r.s).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="caption">
                Strict persons, all years. Repeat-investigator supply concentrates in the US (43%
                one-and-done) vs 54–67% across non-US bands — thinner benches abroad.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Mean receipts per active investigator</h2>
          {!!workload.length && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => trendCsv('workload.csv', workload)}>
              CSV
            </button>
          )}
        </div>
        {demo ? (
          <p className="muted">Run the pipeline for workload data.</p>
        ) : (
          <>
            <TrendChart data={workload} label="Mean receipts per active investigator" />
            <p className="caption">
              IND references ÷ active investigators per year (follows band filter; raw version falls
              back to strict — site roll-ups exist for strict/merged only). Workload per head has
              risen since the mid-2010s.
            </p>
          </>
        )}
      </section>
      </>
      )}

      {showSec('search') && (
      <>
      <section className="panel" id="inv-search">
        <h2>Search investigators</h2>
        {demo ? (
          <p className="muted">Run the pipeline for investigator search.</p>
        ) : (
          <>
            <div className="filters">
              <label>
                Name
                <input
                  type="search"
                  value={q}
                  placeholder="e.g. Smith John"
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runSearch();
                  }}
                />
              </label>
              <label>
                Band
                <select value={searchBand} onChange={(e) => setSearchBand(e.target.value)}>
                  <option value="all">All bands</option>
                  {BANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Min refs
                <input
                  type="number"
                  min={1}
                  value={minTrials}
                  placeholder="1"
                  onChange={(e) => setMinTrials(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runSearch();
                  }}
                  style={{ width: '5em' }}
                />
              </label>
              <button className="btn" onClick={() => runSearch()}>
                Search
              </button>
              <span className="muted">Strict persons · top 50 by IND references · names as published</span>
              {!!hits.length && (
                <button type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    downloadCsv(
                      'investigator-search.csv',
                      ['investigator', 'site', 'country', 'ind_refs', 'per_year', 'years', 'first_year', 'last_year'],
                      hits.map((r) => [
                        r.display_name,
                        r.site ?? '',
                        r.country,
                        r.n_trials,
                        (r.n_trials / (r.last_year - r.first_year + 1)).toFixed(2),
                        r.n_years,
                        r.first_year,
                        r.last_year,
                      ]),
                    )
                  }
                >
                  CSV
                </button>
              )}
            </div>
            {searched && !hits.length && <p className="muted">No investigators match.</p>}
            {!!hits.length && (
              <div className="table-scroll short">
                <table>
                    <thead>
                      <tr>
                        <th>Save</th>
                        <th>Investigator</th>
                        <th>Site</th>
                        <th>Country</th>
                        <th className="num">IND refs</th>
                        <th className="num">/yr</th>
                        <th className="num">Years</th>
                        <th>Span</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hits.map((r) => {
                        const saved = hasPi(r.person_id);
                        return (
                          <tr
                            key={r.person_id}
                            className={sel?.id === r.person_id ? 'picked' : 'pickable'}
                            onClick={() => selectPerson(r.person_id, r.display_name)}
                          >
                            <td>
                              <button
                                type="button"
                                className={`icon-btn star-btn${saved ? ' saved' : ''}`}
                                aria-label={saved ? `Remove ${r.display_name}` : `Shortlist ${r.display_name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePi({
                                    person_id: r.person_id,
                                    display_name: r.display_name,
                                    site: r.site ?? '',
                                    country: r.country,
                                    n_trials: r.n_trials,
                                    n_years: r.n_years,
                                    first_year: r.first_year,
                                    last_year: r.last_year,
                                  });
                                }}
                              >
                                <IconBookmark filled={saved} />
                              </button>
                            </td>
                            <td>{r.display_name}</td>
                            <td>{r.site ?? ''}</td>
                            <td>{r.country}</td>
                            <td className="num">{fmtInt.format(r.n_trials)}</td>
                            <td className="num">{(r.n_trials / (r.last_year - r.first_year + 1)).toFixed(2)}</td>
                            <td className="num">{r.n_years}</td>
                            <td>
                              {r.first_year}–{r.last_year}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                </table>
              </div>
            )}
            {sel && (
              <>
                <div className="panel-head subhead">
                  <h3>
                    {sel.name} <span className="muted">· {fmtInt.format(rcTotal)} receipts, newest first</span>
                  </h3>
                  <div className="header-actions">
                    {!!receipts.length && (
                      <button type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          downloadCsv(
                            'investigator-receipts.csv',
                            ['receipt_date', 'site', 'city', 'state', 'country', 'reviewer_id'],
                            receipts.map((r) => [r.rcvd, r.site ?? '', r.city ?? '', r.state ?? '', r.country, r.invn]),
                          )
                        }
                      >
                        CSV
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={() => setSel(null)}>
                      Close
                    </button>
                  </div>
                </div>
                <div className="table-scroll short">
                  <table>
                    <thead>
                      <tr>
                        <th>Receipt date</th>
                        <th>Site</th>
                        <th title="Open this address in the Sites tab">Site detail</th>
                        <th>City</th>
                        <th>State</th>
                        <th>Country</th>
                        <th>Reviewer ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r, i) => (
                        <tr key={i}>
                          <td>{r.rcvd}</td>
                          <td>{r.site ?? ''}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              title="Open this address in the Sites tab"
                              onClick={() => onJumpSite(r.site_n)}
                            >
                              Open →
                            </button>
                          </td>
                          <td>{r.city ?? ''}</td>
                          <td>{fmtState(r.state)}</td>
                          <td>{r.country}</td>
                          <td>{r.invn}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rcTotal > receipts.length && (
                  <p className="muted">
                    Showing latest {receipts.length} of {fmtInt.format(rcTotal)}.
                  </p>
                )}
                <p className="caption">
                  One row = one IND submission reference naming this investigator (date + site as
                  filed). BMIS carries no trial identifiers, so rows cannot be mapped to specific
                  trials.
                </p>
                <h3>Receipts by year</h3>
                <CategoryBars data={receiptsByYear} />
                <p className="caption">
                  This investigator&apos;s BMIS receipts by year (IND references, not distinct
                  trials).
                </p>
                {!!linked.length && (
                  <>
                    <div className="panel-head subhead">
                      <h3>
                        CT.gov-linked trials{' '}
                        <span className="muted">· {linked.length} via name match (experimental)</span>
                      </h3>
                      <button type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          downloadCsv(
                            'linked_trials.csv',
                            ['nct', 'role', 'sponsor', 'phase', 'ta', 'start_y', 'tier'],
                            linked.map((r) => [
                              r.nct,
                              r.role,
                              r.sponsor,
                              r.phase,
                              r.ta,
                              r.start_y ?? '',
                              r.tier,
                            ]),
                          )
                        }
                      >
                        CSV
                      </button>
                    </div>
                    <div className="table-scroll short">
                      <table>
                        <thead>
                          <tr>
                            <th>Trial</th>
                            <th>Role</th>
                            <th>Sponsor</th>
                            <th>Phase</th>
                            <th>TA</th>
                            <th className="num">Start</th>
                            <th>Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linked.map((r) => (
                            <tr key={`${r.nct}-${r.role}`}>
                              <td>
                                <a
                                  href={`https://clinicaltrials.gov/study/${r.nct}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.nct}
                                </a>
                              </td>
                              <td>{r.role.replace(/_/g, ' ').toLowerCase()}</td>
                              <td>{r.sponsor}</td>
                              <td>{r.phase}</td>
                              <td>{r.ta ? r.ta.replace(/;/g, ', ') : '—'}</td>
                              <td className="num">{r.start_y ?? ''}</td>
                              <td>{r.tier}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="caption">
                      Officials (usually study-level) matched by name + affiliation; most trials
                      name only directors/chairs. Strong = full-name + affiliation overlap; weak
                      links may be name collisions. See Definitions.
                    </p>
                  </>
                )}
                {!!colleagues.length && (
                  <>
                    <div className="panel-head subhead">
                      <h3>
                        Others at this site{' '}
                        <span className="muted">· top {colleagues.length} by IND refs</span>
                      </h3>
                      <button type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          downloadCsv(
                            'site-colleagues.csv',
                            ['investigator', 'site', 'country', 'ind_refs', 'years_active', 'first_year', 'last_year'],
                            colleagues.map((r) => [
                              r.display_name,
                              r.site ?? '',
                              r.country,
                              r.n_trials,
                              r.n_years,
                              r.first_year,
                              r.last_year,
                            ]),
                          )
                        }
                      >
                        CSV
                      </button>
                    </div>
                    <div className="table-scroll short">
                      <table>
                        <thead>
                          <tr>
                            <th>Investigator</th>
                            <th className="num">IND refs</th>
                            <th>Span</th>
                          </tr>
                        </thead>
                        <tbody>
                          {colleagues.map((r) => (
                            <tr
                              key={r.person_id}
                              className="pickable"
                              onClick={() => selectPerson(r.person_id, r.display_name)}
                            >
                              <td>{r.display_name}</td>
                              <td className="num">{fmtInt.format(r.n_trials)}</td>
                              <td>
                                {r.first_year}–{r.last_year}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="caption">
                      Strict persons sharing the exact site string. Click a row to open that
                      investigator.
                    </p>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            {leaderSort === 'rate'
              ? 'Leaderboard: highest trials/year rate'
              : 'Leaderboard: most lifetime IND references'}
          </h2>
          {!!leaders.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(
                  'leaderboard.csv',
                  ['rank', 'investigator', 'degree', 'site', 'city', 'state', 'country', 'ind_refs', 'per_year', 'years', 'first_year', 'last_year'],
                  leaders.map((r) => [
                    r.rank,
                    r.display_name,
                    r.deg ?? '',
                    r.site ?? '',
                    r.city ?? '',
                    r.state ?? '',
                    r.country,
                    r.n_trials,
                    r.tpy.toFixed(2),
                    r.n_years,
                    r.first_year,
                    r.last_year,
                  ]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        <div className="filters">
          <div className="seg" role="group" aria-label="Leaderboard sort">
            <button
              className={leaderSort === 'total' ? 'active' : ''}
              onClick={() => setLeaderSort('total')}
              title="Rank by lifetime IND references"
            >
              Total refs
            </button>
            <button
              className={leaderSort === 'rate' ? 'active' : ''}
              onClick={() => setLeaderSort('rate')}
              title="Rank by trials/year: lifetime refs over inclusive first-last span"
            >
              Trials/year
            </button>
          </div>
          <label>
            Board
            <select value={leaderGeo} onChange={(e) => setLeaderGeo(e.target.value)}>
              <option value="ALL">Global top 25</option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b} top 25
                </option>
              ))}
            </select>
          </label>
          <span className="muted">
            Click a row to inspect records · counts are IND references, not confirmed distinct trials.
          </span>
        </div>
        {demo ? (
          <p className="muted">Run the pipeline for leaderboard data.</p>
        ) : leaders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Investigator</th>
                  <th>Deg</th>
                  <th>Site</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Country</th>
                  <th className="num">IND refs</th>
                  <th className="num">/yr</th>
                  <th className="num">Years</th>
                  <th>Span</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((r) => (
                  <tr
                    key={r.rank}
                    className="pickable"
                    title="Search this investigator's receipts"
                    onClick={() => inspectName(r.display_name)}
                  >
                    <td className="num">{r.rank}</td>
                    <td>{r.display_name}</td>
                    <td>{r.deg ?? ''}</td>
                    <td>{r.site ?? ''}</td>
                    <td>{r.city ?? ''}</td>
                    <td>{r.state && r.state !== 'NG' ? r.state : ''}</td>
                    <td>{r.country}</td>
                    <td className="num">{fmtInt.format(r.n_trials)}</td>
                    <td className="num">{r.tpy.toFixed(2)}</td>
                    <td className="num">{r.n_years}</td>
                    <td>
                      {r.first_year}–{r.last_year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No rows.</p>
        )}
      </section>
      </>
      )}

      {showSec('supply') && (
      <section className="panels">
        <div className="panel">
          <h2>Top countries, {LATEST_FULL}</h2>
          {demo ? <p className="muted">Run the pipeline.</p> : <CategoryBars data={countries} />}
        </div>
        <div className="panel">
          <h2>Top US states, {LATEST_FULL}</h2>
          {demo ? (
            <p className="muted">Run the pipeline.</p>
          ) : (
            <>
              <CategoryBars
                data={states}
                onSelect={
                  onLaunchFeasibility
                    ? (st) =>
                        onLaunchFeasibility({
                          mode: 'pis',
                          band: 'United States',
                          state: st,
                          minYear: 2023,
                        })
                    : undefined
                }
              />
              {onLaunchFeasibility && (
                <p className="caption">Click any state bar to screen active investigators in that state.</p>
              )}
            </>
          )}
        </div>
      </section>
      )}

      {showSec('retention') && (
      <>
      <section className="panels">
        <div className="panel">
          <h2>Cohort detail (first-seen year)</h2>
          {demo ? (
            <p className="muted">Run the pipeline.</p>
          ) : (
            <div className="table-scroll short">
              <table>
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th className="num">Persons</th>
                    <th className="num">Mean</th>
                    <th className="num">Median</th>
                    <th className="num">One-trial</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((r) => (
                    <tr key={r.cohort}>
                      <td>{r.cohort}</td>
                      <td className="num">{fmtInt.format(r.n_persons)}</td>
                      <td className="num">{r.mean_trials.toFixed(2)}</td>
                      <td className="num">{r.median_trials}</td>
                      <td className="num">{pct(r.one_trial_share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>IRB / CRO entities per year</h2>
          {demo ? (
            <p className="muted">Run the pipeline.</p>
          ) : (
            <>
              <MultiLineChart series={ents} />
              <p className="caption">Review-capacity context; institutions, not investigators.</p>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Investigator vintage attrition</h2>
          {!!retShow.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(
                  `vintage-${retMode}-${version}${retBand === 'all' ? '' : `-${retBand}`}.csv`,
                  ['vintage', 'n', ...retShow[0].cells.map((_, k) => `k${k}_pct`)],
                  retShow.map((r) => [r.cohort, r.n, ...r.cells.map((c) => c ?? '')]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        {demo ? (
          <p className="muted">Run the pipeline for retention data.</p>
        ) : (
          <>
            <div className="filters">
              <div className="seg" role="group" aria-label="Vintage view">
                <button
                  className={retMode === 'attrition' ? 'active' : ''}
                  onClick={() => setRetMode('attrition')}
                  title="Share of each vintage still active k years later"
                >
                  Attrition
                </button>
                <button
                  className={retMode === 'reentry' ? 'active' : ''}
                  onClick={() => setRetMode('reentry')}
                  title="Share of actives at +k who missed at least one year since first seen"
                >
                  Re-entry
                </button>
              </div>
              <label>
                Geography
                <select value={retBand} onChange={(e) => setRetBand(e.target.value)}>
                  <option value="all">All bands</option>
                  {BANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <VintageHeatmap
              rows={retShow}
              kMax={VINTAGE_KMAX}
              mode={retMode}
              nullTip={retMode === 'reentry' ? 'not applicable / censored' : 'censored'}
            />
            <div className="panel-head subhead">
              <h3>Five-year retention by vintage</h3>
              {!!ret5.length && (
                <button type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => trendCsv(`five-year-retention-${version}.csv`, ret5)}
                >
                  CSV
                </button>
              )}
            </div>
            <TrendChart data={ret5} label="Five-year retention by vintage" suffix="%" />
            <p className="caption">
              Share of each vintage still active 5 years later (percent). Cohorts 2009–2020 only —
              later vintages cannot be fully observed yet. Newer vintages retain worse at five
              years.
            </p>
            <p className="caption">
              {retMode === 'attrition'
                ? 'Each row is one vintage: the clinical investigators (CIs) who first appear in BMIS in ' +
                  'that year (n = investigators). Cells show the share of that vintage still active k years ' +
                  'later (percent). Gray cells are right-censored (vintage too recent to observe). 2008 ' +
                  'excluded: file ramp-up distorts the base.'
                : 'Re-entry view: of the vintage members active k years later, the share who missed ' +
                  'at least one year in between (percent) — returners, not continuous stayers. +0y is ' +
                  'not applicable (everyone is trivially continuous in their first year). Geography ' +
                  'filters by investigator band.'}
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Work concentration</h2>
          {!!conc.length && (
            <button type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => stackedCsv(`concentration-${version}.csv`, conc)}
            >
              CSV
            </button>
          )}
        </div>
        {demo ? (
          <p className="muted">Run the pipeline for concentration data.</p>
        ) : (
          <>
            <MultiLineChart series={conc} suffix="%" />
            <p className="caption">
              Yearly share of receipts going to the top 1%/10% investigators, plus Gini ×100
              (percent scale). Rising lines mean work concentrating in fewer hands.
            </p>
          </>
        )}
      </section>
      </>
      )}
    </>
  );
}
