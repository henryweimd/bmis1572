import { useEffect, useState } from 'react';
import { createViews, escapeLiteral, loadManifest, query } from './duckdb';
import type { Manifest } from './duckdb';
import { CategoryBars, MultiLineChart, StackedBars } from './charts';
import type { LineSeries } from './charts';
import OrgTab from './OrgTab';
import SiteTab from './SiteTab';
import About from './About';
import { intIn, pick, readHash, writeHash } from './hash';
import { downloadCsv } from './csv';
import './App.css';

const BANDS = [
  'United States',
  'Europe (EU+UK)',
  'South America',
  'Middle East',
  'South Asia',
  'East Asia & Pacific',
  'Rest of world',
  'Unknown',
];
const BAND_COLORS: Record<string, string> = {
  'United States': '#1f77b4',
  'Europe (EU+UK)': '#ff7f0e',
  'South America': '#2ca02c',
  'Middle East': '#d62728',
  'South Asia': '#9467bd',
  'East Asia & Pacific': '#8c564b',
  'Rest of world': '#7f7f7f',
  Unknown: '#bcbd22',
};
const VERSIONS = ['strict', 'merged', 'raw'] as const;
type Version = (typeof VERSIONS)[number];
const VERSION_LABEL: Record<Version, string> = {
  strict: 'Strict',
  merged: 'Merged',
  raw: 'Raw bound',
};
const YEAR_MIN = 2008;
const YEAR_MAX = 2026;
const LATEST_FULL = 2025;
const RET_COHORTS = [2009, 2013, 2017, 2021];
const RET_COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'];

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
interface TrialRow {
  y: number;
  s: number | null;
  r: number | null;
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
interface Kpi {
  active: number;
  active09: number;
  nnew: number;
  oneTrial: number | null;
  tight: number | null;
}
type Status = 'loading' | 'ready' | 'error';

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num = (v: unknown): number | null =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : Number(v);
const num0 = (v: unknown): number => num(v) ?? 0;
const pct = (v: number | null, d = 1): string =>
  v === null ? '—' : `${(v * 100).toFixed(d)}%`;

const DEF_TITLES: [string, string][] = [
  ['person_strict', 'Strict person'],
  ['person_merged', 'Merged person'],
  ['person_raw', 'Raw bound'],
  ['trials_per_person', 'Trials per person'],
  ['active', 'Active / new / returning'],
  ['one_trial', 'One-trial'],
  ['trials_per_year', 'Trials/year rate'],
  ['retention', 'Cohort retention'],
  ['concentration', 'Work concentration'],
  ['scope_unadjusted', 'Unadjusted benchmark'],
  ['scope_adjusted', 'Adjusted benchmark'],
  ['starts_running', 'Starts vs. running'],
  ['tightness', 'Tightness ratio'],
  ['partial', 'Partial years'],
  ['bmis_scope', 'BMIS scope'],
  ['cro', 'CRO company grouping'],
  ['irb', 'IRB board grouping'],
  ['site', 'Site definition'],
  ['site_churn', 'Site roster churn'],
  ['site_xcheck', 'CT.gov cross-check (experimental)'],
];

function years(): number[] {
  const out: number[] = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) out.push(y);
  return out;
}

/** Client twin of the pipeline's name_key normalization (ASCII-folded,
 * uppercase, letters/spaces only) — output is LIKE-safe by construction. */
function normName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
interface RcRow {
  rcvd: string;
  site: string | null;
  city: string | null;
  state: string | null;
  country: string;
  invn: string;
  site_n: number;
}

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [demo, setDemo] = useState(false);

  const [hashInit] = useState(readHash);
  const [version, setVersion] = useState<Version>(() => pick(hashInit.v, VERSIONS, 'strict'));
  const [band, setBand] = useState(() => pick(hashInit.b, ['all', ...BANDS], 'all'));
  const [y0, setY0] = useState(() =>
    Math.min(
      intIn(hashInit.y0, YEAR_MIN, YEAR_MAX, YEAR_MIN),
      intIn(hashInit.y1, YEAR_MIN, YEAR_MAX, YEAR_MAX),
    ),
  );
  const [y1, setY1] = useState(() =>
    Math.max(
      intIn(hashInit.y0, YEAR_MIN, YEAR_MAX, YEAR_MIN),
      intIn(hashInit.y1, YEAR_MIN, YEAR_MAX, YEAR_MAX),
    ),
  );
  const [scope, setScope] = useState<'adjusted' | 'unadjusted'>(() =>
    pick(hashInit.s, ['adjusted', 'unadjusted'] as const, 'adjusted'),
  );
  const [leaderGeo, setLeaderGeo] = useState(() => pick(hashInit.lg, ['ALL', ...BANDS], 'ALL'));
  const [leaderSort, setLeaderSort] = useState<'total' | 'rate'>(() =>
    pick(hashInit.ls, ['total', 'rate'] as const, 'total'),
  );

  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [geo, setGeo] = useState<LineSeries[]>([]);
  const [newret, setNewret] = useState<{ x: number; bottom: number; top: number }[]>([]);
  const [trials, setTrials] = useState<LineSeries[]>([]);
  const [tight, setTight] = useState<LineSeries[]>([]);
  const [bins, setBins] = useState<{ category: string; v: number }[]>([]);
  const [ret, setRet] = useState<LineSeries[]>([]);
  const [conc, setConc] = useState<LineSeries[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [countries, setCountries] = useState<{ category: string; v: number }[]>([]);
  const [states, setStates] = useState<{ category: string; v: number }[]>([]);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [ents, setEnts] = useState<LineSeries[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HitRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  const [receipts, setReceipts] = useState<RcRow[]>([]);
  const [rcTotal, setRcTotal] = useState(0);
  const [tab, setTab] = useState<'inv' | 'cro' | 'irb' | 'site' | 'about'>(() =>
    pick(hashInit.t, ['inv', 'cro', 'irb', 'site', 'about'] as const, 'inv'),
  );

  useEffect(() => {
    writeHash({
      t: tab,
      v: version,
      b: band,
      y0: String(y0),
      y1: String(y1),
      s: scope,
      lg: leaderGeo,
      ls: leaderSort,
    });
  }, [tab, version, band, y0, y1, scope, leaderGeo, leaderSort]);

  useEffect(() => {
    document.title = `${
      tab === 'inv' ? 'Investigators' : tab === 'cro' ? 'CROs' : tab === 'irb' ? 'IRBs' : tab === 'site' ? 'Sites' : 'About'
    } · Investigator Supply Explorer`;
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { manifest: m, baseUrl } = await loadManifest();
        if (cancelled) return;
        setManifest(m);
        setDemo(!m);
        await createViews(baseUrl, m);
        if (cancelled) return;
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        const v = escapeLiteral(version);
        const bandClause = band === 'all' ? '' : ` AND band = '${escapeLiteral(band)}'`;
        const k = await query<{ active: number; active09: number; nnew: number }>(
          `SELECT CAST(SUM(CASE WHEN year = ${LATEST_FULL} THEN n_active ELSE 0 END) AS DOUBLE) AS active,` +
            ` CAST(SUM(CASE WHEN year = 2009 THEN n_active ELSE 0 END) AS DOUBLE) AS active09,` +
            ` CAST(SUM(CASE WHEN year = ${LATEST_FULL} THEN n_new ELSE 0 END) AS DOUBLE) AS nnew` +
            ` FROM investigators_year_geo WHERE version = '${v}'${bandClause}`,
        );
        const g = await query<GeoRow>(
          `SELECT CAST(year AS INTEGER) AS y, CAST(band AS VARCHAR) AS band,` +
            ` CAST(SUM(n_active) AS DOUBLE) AS n FROM investigators_year_geo` +
            ` WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1}${bandClause}` +
            ` GROUP BY 1, 2 ORDER BY 1, 2`,
        );
        const nr = await query<NewRetRow>(
          `SELECT CAST(year AS INTEGER) AS y, CAST(SUM(n_new) AS DOUBLE) AS n_new,` +
            ` CAST(SUM(n_returning) AS DOUBLE) AS n_ret FROM investigators_year_geo` +
            ` WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1}${bandClause}` +
            ` GROUP BY 1 ORDER BY 1`,
        );
        if (cancelled) return;
        const bands = band === 'all' ? BANDS : [band];
        setGeo(
          bands.map((b) => ({
            label: b,
            color: BAND_COLORS[b] ?? '#333',
            points: g.filter((r) => r.band === b).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        setNewret(nr.map((r) => ({ x: r.y, bottom: num0(r.n_ret), top: num0(r.n_new) })));

        if (demo) {
          setKpi({ active: num0(k[0]?.active), active09: num0(k[0]?.active09), nnew: num0(k[0]?.nnew), oneTrial: null, tight: null });
          setNote('');
          return;
        }
        const s = escapeLiteral(scope);
        const [ot, ti, tr, tser, bn, rt, cn, lb, cy, sy, ch, en] = await Promise.all([
          query<{ v: number | null }>(
            `SELECT CAST(SUM(CASE WHEN bin = '1' THEN n_active ELSE 0 END) AS DOUBLE) /` +
              ` NULLIF(CAST(SUM(n_active) AS DOUBLE), 0) AS v FROM active_bins` +
              ` WHERE version = '${v}' AND year = ${LATEST_FULL}`,
          ),
          query<{ v: number | null }>(
            `SELECT CAST(per_running AS DOUBLE) AS v FROM tightness WHERE version = '${v}'` +
              ` AND scope = 'adjusted' AND year = ${LATEST_FULL}`,
          ),
          query<TrialRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(n_starts AS DOUBLE) AS s,` +
              ` CAST(n_running AS DOUBLE) AS r FROM trials_year WHERE scope = '${s}'` +
              ` AND year BETWEEN ${y0} AND ${y1} ORDER BY 1`,
          ),
          query<TightRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(per_running AS DOUBLE) AS pr,` +
              ` CAST(per_start AS DOUBLE) AS ps FROM tightness WHERE version = '${v}'` +
              ` AND scope = '${s}' AND year BETWEEN ${y0} AND ${y1} ORDER BY 1`,
          ),
          query<BinRow>(
            `SELECT CAST(bin AS VARCHAR) AS bin, CAST(SUM(n_active) AS DOUBLE) AS n` +
              ` FROM active_bins WHERE version = '${v}' GROUP BY 1`,
          ),
          query<{ cohort: number; k: number; v: number }>(
            `SELECT CAST(cohort AS INTEGER) AS cohort, CAST(k AS INTEGER) AS k,` +
              ` CAST(retention AS DOUBLE) AS v FROM retention WHERE version = '${v}'` +
              ` AND cohort IN (2009, 2013, 2017, 2021) ORDER BY 1, 2`,
          ),
          query<{ y: number; t1: number; t10: number; g: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(top1_share AS DOUBLE) AS t1,` +
              ` CAST(top10_share AS DOUBLE) AS t10, CAST(gini AS DOUBLE) AS g` +
              ` FROM concentration WHERE version = '${v}' AND year BETWEEN ${y0} AND ${y1} ORDER BY 1`,
          ),
          query<LeaderRow>(
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
          query<EntRow>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(type AS VARCHAR) AS type,` +
              ` CAST(SUM(n_entities) AS DOUBLE) AS n FROM irb_cro_year` +
              ` WHERE type IN ('IRB', 'CRO') AND year BETWEEN ${y0} AND ${y1}` +
              ` GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
        ]);
        if (cancelled) return;
        setKpi({
          active: num0(k[0]?.active),
          active09: num0(k[0]?.active09),
          nnew: num0(k[0]?.nnew),
          oneTrial: num(ot[0]?.v),
          tight: num(ti[0]?.v),
        });
        setTrials([
          { label: 'Starts', color: '#1f77b4', points: tr.map((r) => ({ x: r.y, y: num(r.s) })) },
          ...(scope === 'adjusted'
            ? [{ label: 'Running', color: '#ff7f0e', points: tr.map((r) => ({ x: r.y, y: num(r.r) })) }]
            : []),
        ]);
        setTight([
          { label: 'Active per running trial', color: '#d62728', points: tser.map((r) => ({ x: r.y, y: num(r.pr) })) },
          { label: 'Active per started trial', color: '#1f77b4', points: tser.map((r) => ({ x: r.y, y: num(r.ps) })) },
        ]);
        const binOrder = [...Array.from({ length: 14 }, (_, i) => String(i + 1)), '15+'];
        setBins(
          bn
            .map((r) => ({ category: r.bin, v: num0(r.n) }))
            .sort((a, b) => binOrder.indexOf(a.category) - binOrder.indexOf(b.category)),
        );
        setRet(
          RET_COHORTS.map((c, i) => ({
            label: `${c} cohort`,
            color: RET_COLORS[i % RET_COLORS.length],
            points: rt.filter((r) => r.cohort === c).map((r) => ({ x: r.k, y: num0(r.v) * 100 })),
          })),
        );
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
        setLeaders(lb);
        setCountries(cy.map((r) => ({ category: r.name, v: num0(r.n) })));
        setStates(sy.map((r) => ({ category: r.name, v: num0(r.n) })));
        setCohorts(ch);
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
  }, [status, version, band, y0, y1, scope, leaderGeo, leaderSort, demo]);


  const runSearch = async () => {
    if (demo) return;
    const needle = normName(q);
    if (!needle) {
      setHits([]);
      setSearched(false);
      return;
    }
    try {
      const r = await query<HitRow>(
        `SELECT CAST(person_id AS VARCHAR) AS person_id, CAST(display_name AS VARCHAR) AS display_name,` +
          ` CAST(site AS VARCHAR) AS site, CAST(country AS VARCHAR) AS country, CAST(n_trials AS INTEGER) AS n_trials,` +
          ` CAST(n_years AS INTEGER) AS n_years, CAST(first_year AS INTEGER) AS first_year,` +
          ` CAST(last_year AS INTEGER) AS last_year FROM person_index` +
          ` WHERE name_key LIKE '%${needle}%' ORDER BY n_trials DESC LIMIT 50`,
      );
      setHits(r);
      setSearched(true);
      setSel(null);
      setReceipts([]);
    } catch (e) {
      setNote(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const selectPerson = async (id: string, name: string) => {
    setSel({ id, name });
    try {
      const pid = escapeLiteral(id);
      const [rows, cnt] = await Promise.all([
        query<RcRow>(
          `SELECT CAST(rcvd AS VARCHAR) AS rcvd, CAST(site AS VARCHAR) AS site,` +
            ` CAST(city AS VARCHAR) AS city, CAST(state AS VARCHAR) AS state,` +
            ` CAST(country AS VARCHAR) AS country, CAST(invn AS VARCHAR) AS invn,` +
            ` CAST(site_strict AS INTEGER) AS site_n` +
            ` FROM person_receipts WHERE person_id = '${pid}' ORDER BY rcvd DESC LIMIT 1000`,
        ),
        query<{ n: number }>(`SELECT COUNT(*) AS n FROM person_receipts WHERE person_id = '${pid}'`),
      ]);
      setReceipts(rows);
      setRcTotal(num0(cnt[0]?.n));
    } catch (e) {
      setNote(`Receipts query failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const jumpToSite = (n: number) => {
    writeHash({ t: 'site', 'site.v': 'strict', 'site.s': `strict:${n}` });
    setTab('site');
  };

  if (status === 'loading') {
    return (
      <div className="wrap">
        <p className="muted">Loading engine and data…</p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="wrap">
        <h1>Investigator Supply Explorer</h1>
        <p className="error">Could not load: {error}</p>
        <p className="muted">
          Run the pipeline first: <code>uv run python pipeline/build.py</code> from the repo root.
        </p>
      </div>
    );
  }

  const growth =
    kpi && kpi.active09 > 0 ? (((kpi.active - kpi.active09) / kpi.active09) * 100).toFixed(1) : null;
  const defs = manifest?.definitions ?? {};
  const sources = (manifest?.sources ?? {}) as {
    bmis_file?: string;
    ctgov?: { meta?: { api_version?: { dataTimestamp?: string } } };
  };
  const ctgovTs = sources.ctgov?.meta?.api_version?.dataTimestamp?.slice(0, 10) ?? '—';

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Investigator Supply Explorer</h1>
          <p className="muted">
            {demo ? 'Demo sample (strict, yearly geo)' : 'FDA BMIS investigators vs. industry trials'}
            {manifest && !demo && ` · built ${manifest.generated_at.slice(0, 16).replace('T', ' ')} UTC`}
          </p>
        </div>
        <span className={demo ? 'badge demo' : 'badge'}>{demo ? 'demo data' : 'full lake'}</span>
      </header>

      {demo && (
        <p className="banner">
          Showing the committed demo sample. Run <code>uv run python pipeline/build.py</code> to build and
          explore the full lake locally.
        </p>
      )}
      {note && <p className="banner">{note}</p>}

      <div className="tabs" role="tablist" aria-label="Views">
        <button
          role="tab"
          aria-selected={tab === 'inv'}
          className={tab === 'inv' ? 'active' : ''}
          onClick={() => setTab('inv')}
        >
          Investigators
        </button>
        <button
          role="tab"
          aria-selected={tab === 'cro'}
          className={tab === 'cro' ? 'active' : ''}
          onClick={() => setTab('cro')}
        >
          CROs
        </button>
        <button
          role="tab"
          aria-selected={tab === 'irb'}
          className={tab === 'irb' ? 'active' : ''}
          onClick={() => setTab('irb')}
        >
          IRBs
        </button>
        <button
          role="tab"
          aria-selected={tab === 'site'}
          className={tab === 'site' ? 'active' : ''}
          onClick={() => setTab('site')}
        >
          Sites
        </button>
        <button
          role="tab"
          aria-selected={tab === 'about'}
          className={tab === 'about' ? 'active' : ''}
          onClick={() => setTab('about')}
        >
          About
        </button>
      </div>

      {tab === 'inv' && (
        <>
      <section className="panel controls">
        <div className="filters">
          <div className="seg" role="group" aria-label="Person version">
            {VERSIONS.map((v) => (
              <button
                key={v}
                className={version === v ? 'active' : ''}
                onClick={() => setVersion(v)}
                title={manifest?.versions?.[v] ?? v}
              >
                {VERSION_LABEL[v]}
              </button>
            ))}
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
                setY0(v);
                if (v > y1) setY1(v);
              }}
            >
              {years().map((y) => (
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
                setY1(v);
                if (v < y0) setY0(v);
              }}
            >
              {years().map((y) => (
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
                onClick={() => {
                  setY0(p.from);
                  setY1(p.to);
                }}
                title={`Zoom years to ${p.from}–${p.to}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Trial scope">
            {(['adjusted', 'unadjusted'] as const).map((s) => (
              <button key={s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
                {s === 'adjusted' ? 'US trials' : 'Global trials'}
              </button>
            ))}
          </div>
        </div>
        <div className="filters future">
          <label title="BMIS carries no therapeutic-area field; needs a linked source (parked)">
            Therapeutic area
            <select disabled value="">
              <option value="">Needs linked source</option>
            </select>
          </label>
          <label title="BMIS carries no phase field; needs a linked source (parked)">
            Trial phase
            <select disabled value="">
              <option value="">Needs linked source</option>
            </select>
          </label>
        </div>
      </section>

      <section className="kpis four">
        <div className="kpi">
          <span className="kpi-label">Active investigators, {LATEST_FULL}</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.active) : '—'}</span>
          <span className="kpi-label">{growth !== null ? `${growth}% vs 2009` : ' '}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">New in {LATEST_FULL}</span>
          <span className="kpi-value">
            {kpi ? fmtInt.format(kpi.nnew) : '—'}
          </span>
          <span className="kpi-label">
            {kpi && kpi.active > 0 ? pct(kpi.nnew / kpi.active) + ' of active' : ' '}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">One-trial share of active (global)</span>
          <span className="kpi-value">{kpi ? pct(kpi.oneTrial) : '—'}</span>
          <span className="kpi-label">{VERSION_LABEL[version]} persons</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Active per running trial, US</span>
          <span className="kpi-value">{kpi && kpi.tight !== null ? kpi.tight.toFixed(2) : '—'}</span>
          <span className="kpi-label">adjusted scope</span>
        </div>
      </section>

      <section className="panel">
        <h2>Active investigators per year{band === 'all' ? ' by geography' : `: ${band}`}</h2>
        <MultiLineChart series={geo} />
        <p className="caption">
          Active = ≥1 BMIS receipt in year · {VERSION_LABEL[version]} persons · 2008 (ramp-up) and 2026
          (thru Aug) are partial.
        </p>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>New vs. returning</h2>
          <StackedBars data={newret} labels={['Returning', 'New']} />
          <p className="caption">New = first receipt ever in that year (2008–09 inflated by file start).</p>
        </div>
        <div className="panel">
          <h2>Industry trials per year ({scope})</h2>
          {demo ? (
            <p className="muted">Run the pipeline for trial data.</p>
          ) : (
            <>
              <MultiLineChart series={trials} />
              <p className="caption">
                {scope === 'adjusted'
                  ? 'US-site industry interventional trials.'
                  : 'Global industry interventional trials.'}{' '}
                Starts by Start Date; running = start ≤ year, completion ≥ year or still active.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Tightness: investigators per trial</h2>
          {demo ? (
            <p className="muted">Run the pipeline for trial data.</p>
          ) : (
            <>
              <MultiLineChart series={tight} />
              <p className="caption">
                Descriptive workload proxy only — supply and trial counts are not independent.
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

      <section className="panel">
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
              <button className="btn" onClick={runSearch}>
                Search
              </button>
              <span className="muted">Strict persons · top 50 by IND references · names as published</span>
              {!!hits.length && (
                <button
                  className="btn"
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
                      <th>Investigator</th>
                      <th>Site</th>
                      <th>Country</th>
                      <th>IND refs</th>
                      <th>/yr</th>
                      <th>Years</th>
                      <th>Span</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((r) => (
                      <tr
                        key={r.person_id}
                        className={sel?.id === r.person_id ? 'picked' : 'pickable'}
                        onClick={() => selectPerson(r.person_id, r.display_name)}
                      >
                        <td>{r.display_name}</td>
                        <td>{r.site ?? ''}</td>
                        <td>{r.country}</td>
                        <td>{fmtInt.format(r.n_trials)}</td>
                        <td>{(r.n_trials / (r.last_year - r.first_year + 1)).toFixed(2)}</td>
                        <td>{r.n_years}</td>
                        <td>
                          {r.first_year}–{r.last_year}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sel && (
              <>
                <h3>
                  {sel.name} <span className="muted">· {fmtInt.format(rcTotal)} receipts, newest first</span>{' '}
                  {!!receipts.length && (
                    <button
                      className="btn"
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
                </h3>
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
                            <button className="btn" title="Open this address in the Sites tab" onClick={() => jumpToSite(r.site_n)}>
                              →
                            </button>
                          </td>
                          <td>{r.city ?? ''}</td>
                          <td>{r.state ?? ''}</td>
                          <td>{r.country}</td>
                          <td>{r.invn}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rcTotal > receipts.length && (
                  <p className="muted">Showing latest {receipts.length} of {fmtInt.format(rcTotal)}.</p>
                )}
                <p className="caption">
                  One row = one IND submission reference naming this investigator (date + site as filed).
                  BMIS carries no trial identifiers, so rows cannot be mapped to specific trials.
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>{leaderSort === 'rate' ? 'Leaderboard: highest trials/year rate' : 'Leaderboard: most lifetime IND references'}</h2>
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
          <span className="muted">Names exactly as published in BMIS. Counts are IND references, not confirmed distinct trials.</span>
          {!!leaders.length && (
            <button
              className="btn"
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
        {demo ? (
          <p className="muted">Run the pipeline for leaderboard data.</p>
        ) : leaders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Investigator</th>
                  <th>Deg</th>
                  <th>Site</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Country</th>
                  <th>IND refs</th>
                  <th>/yr</th>
                  <th>Years</th>
                  <th>Span</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((r) => (
                  <tr key={r.rank}>
                    <td>{r.rank}</td>
                    <td>{r.display_name}</td>
                    <td>{r.deg ?? ''}</td>
                    <td>{r.site ?? ''}</td>
                    <td>{r.city ?? ''}</td>
                    <td>{r.state && r.state !== 'NG' ? r.state : ''}</td>
                    <td>{r.country}</td>
                    <td>{fmtInt.format(r.n_trials)}</td>
                    <td>{r.tpy.toFixed(2)}</td>
                    <td>{r.n_years}</td>
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

      <section className="panels">
        <div className="panel">
          <h2>Top countries, {LATEST_FULL}</h2>
          {demo ? <p className="muted">Run the pipeline.</p> : <CategoryBars data={countries} />}
        </div>
        <div className="panel">
          <h2>Top US states, {LATEST_FULL}</h2>
          {demo ? <p className="muted">Run the pipeline.</p> : <CategoryBars data={states} />}
        </div>
      </section>

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
                    <th>Persons</th>
                    <th>Mean</th>
                    <th>Median</th>
                    <th>One-trial</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((r) => (
                    <tr key={r.cohort}>
                      <td>{r.cohort}</td>
                      <td>{fmtInt.format(r.n_persons)}</td>
                      <td>{r.mean_trials.toFixed(2)}</td>
                      <td>{r.median_trials}</td>
                      <td>{pct(r.one_trial_share)}</td>
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
            <h2>Cohort retention</h2>
            {demo ? (
              <p className="muted">Run the pipeline for retention data.</p>
            ) : (
              <>
                <MultiLineChart series={ret} />
                <p className="caption">
                  Share of each first-seen cohort still active k years later (percent). Right-censored:
                  recent cohorts show fewer years.
                </p>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Work concentration</h2>
            {demo ? (
              <p className="muted">Run the pipeline for concentration data.</p>
            ) : (
              <>
                <MultiLineChart series={conc} />
                <p className="caption">
                  Yearly share of receipts going to the top 1%/10% investigators, plus Gini ×100
                  (percent scale). Rising lines mean work concentrating in fewer hands.
                </p>
              </>
            )}
          </section>
        </>
      )}

      {tab === 'cro' && (
        <OrgTab kind="cro" bands={BANDS} yearMin={YEAR_MIN} yearMax={YEAR_MAX} latestFull={LATEST_FULL} demo={demo} ready={status === 'ready'} />
      )}

      {tab === 'irb' && (
        <OrgTab kind="irb" bands={BANDS} yearMin={YEAR_MIN} yearMax={YEAR_MAX} latestFull={LATEST_FULL} demo={demo} ready={status === 'ready'} />
      )}

      {tab === 'site' && (
        <SiteTab bands={BANDS} yearMin={YEAR_MIN} yearMax={YEAR_MAX} latestFull={LATEST_FULL} demo={demo} ready={status === 'ready'} />
      )}

      {tab === 'about' && <About />}

      <section className="panel">
        <h2>Definitions</h2>
        <dl className="defs">
          {DEF_TITLES.map(([k, t]) => (
            <div key={k}>
              <dt>{t}</dt>
              <dd>{defs[k] ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="muted">
        Queried in-browser with DuckDB-WASM · no backend · BMIS {sources.bmis_file ?? 'file'} · CT.gov
        snapshot {ctgovTs} · {demo ? 'demo-investigators.csv' : 'parquet lake'} ·{' '}
        <a href="https://github.com/henryweimd/bmis1572" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
