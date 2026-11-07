import { useEffect, useState } from 'react';
import { escapeLiteral, query } from './duckdb';
import { CategoryBars, StackedMultiBars, VintageHeatmap } from './charts';
import type { VintageRow } from './charts';

const SITE_KMAX = 10;
import type { LineSeries } from './charts';
import { intIn, pick, readHash, writeHash } from './hash';
import { downloadCsv } from './csv';

const SERIES_COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'];
const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num0 = (v: unknown): number =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? 0 : Number(v);

interface SiteTopRow {
  site_id: string;
  site_n: number;
  name: string;
  city: string;
  country: string;
  n_inv: number;
  n_receipts: number;
  first_year: number;
  last_year: number;
  n_variants: number;
  tpy: number;
}

interface SiteHit extends SiteTopRow {
  addr: string;
}

interface SiteInfo {
  name: string;
  addr: string;
  city: string;
  state: string;
  country: string;
  band: string;
  n_inv: number;
  n_receipts: number;
  first_year: number;
  last_year: number;
  n_years: number;
  n_variants: number;
}

function parseSiteId(s: string | undefined): { ver: 'strict' | 'merged'; n: number } | null {
  if (!s) return null;
  const m = /^(strict|merged):(\d{1,9})$/.exec(s);
  if (!m) return null;
  return { ver: m[1] as 'strict' | 'merged', n: Number(m[2]) };
}

export default function SiteTab({
  bands,
  yearMin,
  yearMax,
  latestFull,
  demo,
  ready,
  onJump,
}: {
  bands: string[];
  yearMin: number;
  yearMax: number;
  latestFull: number;
  demo: boolean;
  ready: boolean;
  onJump: (name: string) => void;
}) {
  const [hashInit] = useState(readHash);
  const [band, setBand] = useState(() => pick(hashInit['site.b'], ['all', ...bands], 'all'));
  const [y0, setY0] = useState(() =>
    Math.min(
      intIn(hashInit['site.y0'], yearMin, yearMax, yearMin),
      intIn(hashInit['site.y1'], yearMin, yearMax, yearMax),
    ),
  );
  const [y1, setY1] = useState(() =>
    Math.max(
      intIn(hashInit['site.y0'], yearMin, yearMax, yearMin),
      intIn(hashInit['site.y1'], yearMin, yearMax, yearMax),
    ),
  );
  const [ver, setVer] = useState<'strict' | 'merged'>(() => {
    const p = parseSiteId(hashInit['site.s']);
    return p ? p.ver : pick(hashInit['site.v'], ['strict', 'merged'] as const, 'strict');
  });
  const [sel, setSel] = useState<{ id: string; n: number } | null>(() => {
    const p = parseSiteId(hashInit['site.s']);
    return p ? { id: `${p.ver}:${p.n}`, n: p.n } : null;
  });
  const [sort, setSort] = useState<'total' | 'invs' | 'rate'>(() =>
    pick(hashInit['site.o'], ['total', 'invs', 'rate'] as const, 'total'),
  );
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SiteHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [ry, setRy] = useState(() => intIn(hashInit['site.ry'], yearMin, yearMax, latestFull));

  const [kpi, setKpi] = useState<{ active: number; receipts: number; receipts09: number; ever: number } | null>(null);
  const [byBand, setByBand] = useState<LineSeries[]>([]);
  const [sizeTrend, setSizeTrend] = useState<LineSeries[]>([]);
  const [sizeSnap, setSizeSnap] = useState<{ category: string; v: number }[]>([]);
  const [churn, setChurn] = useState<LineSeries[]>([]);
  const [top, setTop] = useState<SiteTopRow[]>([]);
  const [sret, setSret] = useState<VintageRow[]>([]);
  const [info, setInfo] = useState<SiteInfo | null>(null);
  const [detail, setDetail] = useState<{ y: number; invs: number; joins: number; ends: number }[]>([]);
  const [roster, setRoster] = useState<{ name: string; country: string; n: number }[]>([]);
  const [xc, setXc] = useState<{ n: number; ns: number; j: number; samp: string; fac: string; sib: number } | null>(null);
  const [tamix, setTamix] = useState<{ category: string; v: number }[]>([]);
  const [phasemix, setPhasemix] = useState<{ category: string; v: number }[]>([]);
  const [sampTrials, setSampTrials] = useState<{ nct: string; sponsor: string; phase: string; ta: string }[]>([]);
  const [note, setNote] = useState('');

  const yearOpts: number[] = [];
  for (let y = yearMin; y <= yearMax; y++) yearOpts.push(y);

  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const bc = band === 'all' ? '' : ` AND band = '${escapeLiteral(band)}'`;
        const [k, bb, st, ss, ch, rt, t] = await Promise.all([
          query<{ active: number; r25: number; r09: number; ever: number }>(
            `SELECT CAST(SUM(CASE WHEN year = ${latestFull} THEN n_sites ELSE 0 END) AS DOUBLE) AS active,` +
              ` CAST(SUM(CASE WHEN year = ${latestFull} THEN n_receipts ELSE 0 END) AS DOUBLE) AS r25,` +
              ` CAST(SUM(CASE WHEN year = 2009 THEN n_receipts ELSE 0 END) AS DOUBLE) AS r09,` +
              ` (SELECT COUNT(*) FROM site_index WHERE version = '${ver}'${bc}) AS ever` +
              ` FROM sites_year_geo WHERE version = '${ver}'${bc}`,
          ),
          query<{ y: number; b: string; n: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(band AS VARCHAR) AS b,` +
              ` CAST(SUM(n_sites) AS DOUBLE) AS n FROM sites_year_geo` +
              ` WHERE version = '${ver}' AND year BETWEEN ${y0} AND ${y1}${bc} GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
          query<{ y: number; b: string; n: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(bin AS VARCHAR) AS b,` +
              ` CAST(SUM(n_sites) AS DOUBLE) AS n FROM site_size_year` +
              ` WHERE version = '${ver}' AND year BETWEEN ${y0} AND ${y1} GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
          query<{ b: string; n: number }>(
            `SELECT CAST(bin AS VARCHAR) AS b, CAST(SUM(n_sites) AS DOUBLE) AS n FROM site_size_year` +
              ` WHERE version = '${ver}' AND year = ${y1} GROUP BY 1 ORDER BY 1`,
          ),
          query<{ y: number; nl: number; nj: number; ne: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(n_links AS DOUBLE) AS nl,` +
              ` CAST(n_new AS DOUBLE) AS nj, CAST(n_ended AS DOUBLE) AS ne FROM site_churn` +
              ` WHERE version = '${ver}' AND year BETWEEN ${y0} AND ${y1} ORDER BY 1`,
          ),
          query<{ cohort: number; k: number; v: number; n: number; na: number }>(
            `SELECT CAST(cohort AS INTEGER) AS cohort, CAST(k AS INTEGER) AS k,` +
              ` CAST(retention AS DOUBLE) AS v, CAST(n_cohort AS INTEGER) AS n,` +
              ` CAST(n_active AS INTEGER) AS na FROM site_retention` +
              ` WHERE version = '${ver}' AND cohort BETWEEN 2009 AND 2025 AND k <= ${SITE_KMAX} ORDER BY 1, 2`,
          ).catch(() => []),
          query<SiteTopRow>(
            `SELECT CAST(site_id AS VARCHAR) AS site_id, CAST(site_n AS INTEGER) AS site_n,` +
              ` CAST(display_name AS VARCHAR) AS name, CAST(city AS VARCHAR) AS city,` +
              ` CAST(country AS VARCHAR) AS country, CAST(n_inv_ever AS INTEGER) AS n_inv,` +
              ` CAST(n_receipts AS DOUBLE) AS n_receipts, CAST(first_year AS INTEGER) AS first_year,` +
              ` CAST(last_year AS INTEGER) AS last_year, CAST(n_variants AS INTEGER) AS n_variants,` +
              ` CAST(n_receipts AS DOUBLE) / (last_year - first_year + 1) AS tpy FROM site_index` +
              ` WHERE version = '${ver}'${bc}` +
              ` ORDER BY ${sort === 'rate' ? 'tpy DESC' : sort === 'invs' ? 'n_inv_ever DESC' : 'n_receipts DESC'} LIMIT 25`,
          ),
        ]);
        if (cancelled) return;
        setKpi({ active: num0(k[0]?.active), receipts: num0(k[0]?.r25), receipts09: num0(k[0]?.r09), ever: num0(k[0]?.ever) });
        const bandNames = [...new Set(bb.map((r) => r.b))];
        setByBand(
          bandNames.map((b, i) => ({
            label: b,
            color: SERIES_COLORS[i % SERIES_COLORS.length],
            points: bb.filter((r) => r.b === b).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        const binOrder = ['1', '2-5', '6-20', '21+'];
        setSizeTrend(
          binOrder
            .filter((b) => st.some((r) => r.b === b))
            .map((b, i) => ({
              label: `${b} investigators`,
              color: SERIES_COLORS[i % SERIES_COLORS.length],
              points: st.filter((r) => r.b === b).map((r) => ({ x: r.y, y: num0(r.n) })),
            })),
        );
        setSizeSnap(ss.map((r) => ({ category: `${r.b} investigators`, v: num0(r.n) })));
        setChurn([
          { label: 'Joined', color: '#2ca02c', points: ch.map((r) => ({ x: r.y, y: num0(r.nj) })) },
          { label: 'Last seen', color: '#d62728', points: ch.map((r) => ({ x: r.y, y: num0(r.ne) })) },
        ]);
        const byVintage = new Map<number, { n: number; m: Map<number, number>; c: Map<number, number> }>();
        for (const r of rt) {
          const e = byVintage.get(r.cohort) ?? { n: 0, m: new Map<number, number>(), c: new Map<number, number>() };
          e.n = r.n;
          e.m.set(r.k, num0(r.v) * 100);
          e.c.set(r.k, num0(r.na));
          byVintage.set(r.cohort, e);
        }
        setSret(
          [...byVintage.entries()].map(([cohort, e]) => ({
            cohort,
            n: e.n,
            cells: Array.from({ length: SITE_KMAX + 1 }, (_, k) => e.m.get(k) ?? null),
            counts: Array.from({ length: SITE_KMAX + 1 }, (_, k) => e.c.get(k) ?? null),
          })),
        );
        setTop(t);
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`Site query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, band, y0, y1, ver, sort, latestFull]);

  useEffect(() => {
    if (!ready || demo || !sel) {
      setInfo(null);
      setDetail([]);
      setXc(null);
      setTamix([]);
      setPhasemix([]);
      setSampTrials([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const col = ver === 'strict' ? 'site_strict' : 'site_merged';
        const yr = 'EXTRACT(YEAR FROM CAST(rcvd AS DATE))';
        const [inf, yy, pr, xq, tq, pq] = await Promise.all([
          query<SiteInfo>(
            `SELECT CAST(display_name AS VARCHAR) AS name, CAST(display_addr AS VARCHAR) AS addr,` +
              ` CAST(city AS VARCHAR) AS city, CAST(state AS VARCHAR) AS state,` +
              ` CAST(country AS VARCHAR) AS country, CAST(band AS VARCHAR) AS band,` +
              ` CAST(n_inv_ever AS INTEGER) AS n_inv, CAST(n_receipts AS DOUBLE) AS n_receipts,` +
              ` CAST(first_year AS INTEGER) AS first_year, CAST(last_year AS INTEGER) AS last_year,` +
              ` CAST(n_years AS INTEGER) AS n_years, CAST(n_variants AS INTEGER) AS n_variants` +
              ` FROM site_index WHERE version = '${ver}' AND site_n = ${sel.n}`,
          ),
          query<{ y: number; invs: number }>(
            `SELECT CAST(${yr} AS INTEGER) AS y, CAST(COUNT(DISTINCT person_id) AS DOUBLE) AS invs` +
              ` FROM person_receipts WHERE ${col} = ${sel.n} GROUP BY 1 ORDER BY 1`,
          ),
          query<{ f: number; l: number }>(
            `SELECT CAST(MIN(${yr}) AS INTEGER) AS f, CAST(MAX(${yr}) AS INTEGER) AS l` +
              ` FROM person_receipts WHERE ${col} = ${sel.n} GROUP BY person_id`,
          ),
          query<{ n: number; ns: number; j: number; samp: string; fac: string; sib: number }>(
            `SELECT CAST(n_plausible AS INTEGER) AS n, CAST(n_strong AS INTEGER) AS ns,` +
              ` CAST(best_j AS DOUBLE) AS j, CAST(sample AS VARCHAR) AS samp,` +
              ` CAST(sample_fac AS VARCHAR) AS fac, CAST(n_sibling_sites AS INTEGER) AS sib` +
              ` FROM site_ctgov_xcheck WHERE version = '${ver}' AND site_n = ${sel.n}`,
          ).catch(() => []),
          query<{ category: string; v: number }>(
            `SELECT CAST(ta AS VARCHAR) AS category, CAST(SUM(n_trials) AS DOUBLE) AS v` +
              ` FROM site_ta_mix WHERE version = '${ver}' AND site_n = ${sel.n}` +
              ` GROUP BY 1 ORDER BY 2 DESC`,
          ).catch(() => []),
          query<{ category: string; v: number }>(
            `SELECT CAST(phase AS VARCHAR) AS category, CAST(SUM(n_trials) AS DOUBLE) AS v` +
              ` FROM site_ctgov_phase_mix WHERE version = '${ver}' AND site_n = ${sel.n}` +
              ` GROUP BY 1 ORDER BY 2 DESC`,
          ).catch(() => []),
        ]);
        if (cancelled) return;
        setInfo(inf[0] ?? null);
        const joins = new Map<number, number>();
        const ends = new Map<number, number>();
        for (const r of pr) {
          joins.set(r.f, (joins.get(r.f) ?? 0) + 1);
          ends.set(r.l, (ends.get(r.l) ?? 0) + 1);
        }
        setDetail(yy.map((r) => ({ y: r.y, invs: num0(r.invs), joins: joins.get(r.y) ?? 0, ends: ends.get(r.y) ?? 0 })));
        setXc(xq[0] ? { n: num0(xq[0].n), ns: num0(xq[0].ns), j: num0(xq[0].j), samp: xq[0].samp, fac: xq[0].fac, sib: num0(xq[0].sib) } : null);
        setTamix(tq.map((r) => ({ category: r.category, v: num0(r.v) })));
        setPhasemix(pq.map((r) => ({ category: r.category, v: num0(r.v) })));
        const sampNcts = (xq[0]?.samp ?? '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5);
        if (sampNcts.length) {
          const str = await query<{ nct: string; sponsor: string; phase: string; ta: string }>(
            `SELECT CAST(nct AS VARCHAR) AS nct, CAST(sponsor_disp AS VARCHAR) AS sponsor,` +
              ` CAST(phase AS VARCHAR) AS phase, CAST(ta AS VARCHAR) AS ta FROM ctgov_trials` +
              ` WHERE nct IN (${sampNcts.map((n) => `'${escapeLiteral(n)}'`).join(',')})`,
          ).catch(() => [] as { nct: string; sponsor: string; phase: string; ta: string }[]);
          if (cancelled) return;
          const byNct = new Map(str.map((r) => [r.nct, r]));
          setSampTrials(
            sampNcts.map((n) => byNct.get(n) ?? { nct: n, sponsor: '', phase: '', ta: '' }),
          );
        } else {
          setSampTrials([]);
        }
      } catch (e) {
        if (cancelled) return;
        setNote(`Site detail failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, sel, ver]);

  useEffect(() => {
    if (!ready || demo || !sel) {
      setRoster([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const col = ver === 'strict' ? 'site_strict' : 'site_merged';
        const r = await query<{ name: string; country: string; n: number }>(
          `SELECT CAST(i.display_name AS VARCHAR) AS name, CAST(i.country AS VARCHAR) AS country,` +
            ` CAST(COUNT(*) AS INTEGER) AS n FROM person_receipts r` +
            ` JOIN person_index i ON r.person_id = i.person_id` +
            ` WHERE r.${col} = ${sel.n} AND EXTRACT(YEAR FROM CAST(r.rcvd AS DATE)) = ${ry}` +
            ` GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 200`,
        );
        if (cancelled) return;
        setRoster(r);
      } catch (e) {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, sel, ver, ry]);

  useEffect(() => {
    writeHash({
      'site.b': band,
      'site.y0': String(y0),
      'site.y1': String(y1),
      'site.v': ver,
      'site.s': sel ? sel.id : '',
      'site.o': sort,
      'site.ry': String(ry),
    });
  }, [band, y0, y1, ver, sel, sort, ry]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || demo || q.trim().length < 2) return;
    const needle = `%${escapeLiteral(q.trim().toUpperCase())}%`;
    try {
      const r = await query<SiteHit>(
        `SELECT CAST(site_id AS VARCHAR) AS site_id, CAST(site_n AS INTEGER) AS site_n,` +
          ` CAST(display_name AS VARCHAR) AS name, CAST(display_addr AS VARCHAR) AS addr,` +
          ` CAST(city AS VARCHAR) AS city, CAST(country AS VARCHAR) AS country,` +
          ` CAST(n_inv_ever AS INTEGER) AS n_inv, CAST(n_receipts AS DOUBLE) AS n_receipts,` +
          ` CAST(first_year AS INTEGER) AS first_year, CAST(last_year AS INTEGER) AS last_year,` +
          ` CAST(n_variants AS INTEGER) AS n_variants,` +
          ` CAST(n_receipts AS DOUBLE) / (last_year - first_year + 1) AS tpy FROM site_index` +
          ` WHERE version = '${ver}' AND (UPPER(display_name) LIKE '${needle}' OR UPPER(city) LIKE '${needle}')` +
          ` ORDER BY n_receipts DESC LIMIT 50`,
      );
      setHits(r);
      setSearched(true);
    } catch (e2) {
      setNote(`Site search failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }

  if (demo) return <p className="muted">Run the pipeline for site data.</p>;

  const growth = kpi && kpi.receipts09 > 0 ? (((kpi.receipts - kpi.receipts09) / kpi.receipts09) * 100).toFixed(1) : null;
  const detailYears = detail.map((d) => d.y);

  return (
    <>
      {note && <p className="banner">{note}</p>}
      <p className="banner">
        CT.gov trial matches are institution×city estimates shared across that institution&apos;s
        addresses — not confirmed site trials. Preliminary analysis only; see{' '}
        <a
          href="https://github.com/henryweimd/bmis1572/blob/main/docs/linkage.md"
          target="_blank"
          rel="noreferrer"
        >
          docs/linkage.md
        </a>{' '}
        and Definitions: site_xcheck.
      </p>
      <section className="panel controls">
        <div className="filters">
          <label>
            Geography
            <select value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="all">All bands</option>
              {bands.map((b) => (
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
              {yearOpts.map((y) => (
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
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Site version">
            <button
              className={ver === 'strict' ? 'active' : ''}
              onClick={() => {
                setVer('strict');
                setSel(null);
              }}
              title="Exact normalized street+city+state+country match"
            >
              Strict
            </button>
            <button
              className={ver === 'merged' ? 'active' : ''}
              onClick={() => {
                setVer('merged');
                setSel(null);
              }}
              title="Strict plus fuzzy same-address merges"
            >
              Merged
            </button>
          </div>
          <span className="muted">Site = street address (strict persons). Selection resets on version switch.</span>
        </div>
      </section>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Active sites, {latestFull}</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.active) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Site receipts, {latestFull}</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.receipts) : '—'}</span>
          <span className="kpi-label">{growth !== null ? `${growth}% vs 2009` : ' '}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Sites ever (in file)</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.ever) : '—'}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Active sites per year{band === 'all' ? ' by band' : `: ${band}`}</h2>
        <StackedMultiBars series={byBand} allTicks />
        <p className="caption">
          Distinct site addresses with ≥1 investigator receipt that year · 2008 (ramp-up) and 2026 (thru Aug)
          are partial. Toggle 100% for yearly share.
        </p>
      </section>

      <section className="panel">
        <h2>Site size mix: investigators per site</h2>
        <StackedMultiBars series={sizeTrend} allTicks />
        <h3>Mix in {y1}</h3>
        <CategoryBars data={sizeSnap} />
        <p className="caption">
          Global (all bands): sites grouped by distinct investigators active that year. Solo sites dominate;
          21+ sites are mega-centers. Toggle 100% for yearly share.
        </p>
      </section>

      <section className="panel">
        <h2>Roster churn: investigators joining vs last seen</h2>
        <StackedMultiBars series={churn} allTicks />
        <p className="caption">
          Global (all bands): per investigator-site link, joined = first receipt year at the site, last seen =
          last receipt year. Right edge is censored (2026 links look ended); gap years read as continuous.
          Toggle 100% for the join/end split.
        </p>
      </section>

      <section className="panel">
        <h2>Site vintage attrition</h2>
        <VintageHeatmap rows={sret} kMax={SITE_KMAX} unit="sites" />
        <p className="caption">
          Of the sites first seen in a given year (their vintage), the share active again k years
          later. Right-censored; 2008 excluded (file ramp-up). Follows the {ver} address version;
          see Definitions: site_retention.{' '}
          {!!sret.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  `site-vintage-attrition-${ver}.csv`,
                  ['vintage', 'n', ...sret[0].cells.map((_, k) => `k${k}_pct`)],
                  sret.map((r) => [r.cohort, r.n, ...r.cells.map((c) => c ?? '')]),
                )
              }
            >
              CSV
            </button>
          )}
        </p>
      </section>

      <section className="panel">
        <h2>Top sites{band === 'all' ? '' : `: ${band}`}</h2>
        <div className="filters">
          <div className="seg" role="group" aria-label="Site sort">
            <button
              className={sort === 'total' ? 'active' : ''}
              onClick={() => setSort('total')}
              title="Rank by lifetime receipts"
            >
              Total refs
            </button>
            <button
              className={sort === 'invs' ? 'active' : ''}
              onClick={() => setSort('invs')}
              title="Rank by investigators ever"
            >
              Investigators
            </button>
            <button
              className={sort === 'rate' ? 'active' : ''}
              onClick={() => setSort('rate')}
              title="Rank by receipts/year: lifetime refs over inclusive first-last span"
            >
              Trials/year
            </button>
          </div>
          <span className="muted">Click a row for the site detail.</span>
          {!!top.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  'top-sites.csv',
                  ['site', 'city', 'country', 'investigators', 'receipts', 'per_year', 'first_year', 'last_year', 'variants'],
                  top.map((r) => [r.name, r.city, r.country, r.n_inv, r.n_receipts, r.tpy.toFixed(2), r.first_year, r.last_year, r.n_variants]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>City</th>
                <th>Country</th>
                <th>Invs</th>
                <th>Receipts</th>
                <th>/yr</th>
                <th>Span</th>
                <th>Variants</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <tr
                  key={r.site_id}
                  onClick={() => setSel({ id: r.site_id, n: r.site_n })}
                  className={sel?.id === r.site_id ? 'picked' : 'pickable'}
                >
                  <td>{r.name}</td>
                  <td>{r.city}</td>
                  <td>{r.country}</td>
                  <td>{fmtInt.format(r.n_inv)}</td>
                  <td>{fmtInt.format(r.n_receipts)}</td>
                  <td>{r.tpy.toFixed(2)}</td>
                  <td>
                    {r.first_year}–{r.last_year}
                  </td>
                  <td>{r.n_variants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          Variants = distinct raw address strings consolidated into the site (merged absorbs spelling variants).
          Names as filed.
        </p>
      </section>

      <section className="panel">
        <h2>Search sites</h2>
        <form className="filters" onSubmit={runSearch}>
          <label>
            Name or city
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. ANDERSON or HOUSTON" size={30} />
          </label>
          <button type="submit" className="btn">Search</button>
          {searched && <span className="muted">{hits.length} matches (top 50 by receipts)</span>}
          {!!hits.length && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadCsv(
                  'site-search.csv',
                  ['site', 'address', 'city', 'country', 'investigators', 'receipts', 'first_year', 'last_year'],
                  hits.map((r) => [r.name, r.addr, r.city, r.country, r.n_inv, r.n_receipts, r.first_year, r.last_year]),
                )
              }
            >
              CSV
            </button>
          )}
        </form>
        {!!hits.length && (
          <div className="table-scroll short">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Invs</th>
                  <th>Receipts</th>
                  <th>Span</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((r) => (
                  <tr
                    key={r.site_id}
                    onClick={() => setSel({ id: r.site_id, n: r.site_n })}
                    className={sel?.id === r.site_id ? 'picked' : 'pickable'}
                  >
                    <td>{r.name}</td>
                    <td>{r.addr}</td>
                    <td>{r.city}</td>
                    <td>{r.country}</td>
                    <td>{fmtInt.format(r.n_inv)}</td>
                    <td>{fmtInt.format(r.n_receipts)}</td>
                    <td>
                      {r.first_year}–{r.last_year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sel && info && (
        <section className="panel">
          <h2>{info.name}</h2>
          <p className="muted">
            {info.addr} · {info.city}, {info.state} {info.country} · {info.band} ·{' '}
            {fmtInt.format(info.n_inv)} investigators ever · {fmtInt.format(info.n_receipts)} receipts ·{' '}
            {info.first_year}–{info.last_year} ({info.n_years} active years) · {info.n_variants} address variants
          </p>
          <h3>Investigators active per year</h3>
          <StackedMultiBars
            allTicks
            series={[
              {
                label: 'Active investigators',
                color: '#1f77b4',
                points: detail.map((d) => ({ x: d.y, y: d.invs })),
              },
            ]}
          />
          <h3>Roster flow: joined vs last seen</h3>
          <StackedMultiBars
            allTicks
            series={[
              { label: 'Joined', color: '#2ca02c', points: detail.map((d) => ({ x: d.y, y: d.joins })) },
              { label: 'Last seen', color: '#d62728', points: detail.map((d) => ({ x: d.y, y: d.ends })) },
            ]}
          />
          <h3>CT.gov cross-check (experimental, US only)</h3>
          {xc ? (
            <p>
              {fmtInt.format(xc.n)} plausible industry trials ({fmtInt.format(xc.ns)} strong), shared across{' '}
              {xc.sib} {xc.sib === 1 ? 'address' : 'addresses'} of this institution — e.g. matched facility “
              {xc.fac}”. Sample:{' '}
              {(sampTrials.length
                ? sampTrials
                : xc.samp
                    .split(';')
                    .map((n) => n.trim())
                    .filter(Boolean)
                    .map((nct) => ({ nct, sponsor: '', phase: '', ta: '' }))
              ).map((t, i) => (
                <span key={t.nct}>
                  {i > 0 && '; '}
                  <a href={`https://clinicaltrials.gov/study/${t.nct}`} target="_blank" rel="noreferrer">
                    {t.nct}
                  </a>
                  {t.sponsor && (
                    <span className="muted">
                      {' '}
                      ({t.sponsor}
                      {t.phase && t.phase !== 'NA' ? ` · ${t.phase}` : ''}
                      {t.ta ? ` · ${t.ta.replace(/;/g, ', ')}` : ''})
                    </span>
                  )}
                </span>
              ))}
              . Counts are institution × city, not address-level (see Definitions: site_xcheck).
            </p>
          ) : (
            <p className="muted">No CT.gov facility match for this site (non-US, generic, or unmatched name).</p>
          )}
          <h3>Therapeutic-area mix (experimental)</h3>
          {tamix.length ? (
            <>
              <CategoryBars data={tamix} />
              <p className="caption">
                Matched trials bucketed by CT.gov conditions text (~15 keyword areas; multi-area
                studies count once per area). Inherits all cross-check caveats; see Definitions: site_ta.
              </p>
            </>
          ) : (
            <p className="muted">No therapeutic-area data (no CT.gov match for this site).</p>
          )}
          <h3>Phase mix (experimental)</h3>
          {phasemix.length ? (
            <>
              <CategoryBars data={phasemix} />
              <p className="caption">
                Matched trials by CT.gov phase (exact per-trial field). Inherits all cross-check
                caveats; see Definitions: site_xcheck.
              </p>
            </>
          ) : (
            <p className="muted">No phase data (no CT.gov match for this site).</p>
          )}
          <h3>
            Roster,{' '}
            <select value={ry} onChange={(e) => setRy(Number(e.target.value))}>
              {(detailYears.length ? detailYears : yearOpts).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>{' '}
            <span className="muted">· top 200 by receipts</span>{' '}
            {!!roster.length && (
              <button
                className="btn"
                onClick={() =>
                  downloadCsv(
                    `site-roster-${ry}.csv`,
                    ['investigator', 'country', 'receipts'],
                    roster.map((r) => [r.name, r.country, r.n]),
                  )
                }
              >
                CSV
              </button>
            )}
          </h3>
          {roster.length ? (
            <div className="table-scroll short">
              <table>
                <thead>
                  <tr>
                    <th>Investigator</th>
                    <th>Country</th>
                    <th>Receipts</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr
                      key={`${r.name}-${i}`}
                      className="pickable"
                      title="Search in US Investigators"
                      onClick={() => onJump(r.name)}
                    >
                      <td>{r.name}</td>
                      <td>{r.country}</td>
                      <td>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No roster rows for {ry} (site inactive that year).</p>
          )}
          <p className="caption">
            No trial IDs in BMIS: roster shows who filed from this address, not which trials. Last-seen years
            include right-censored recent links. Click a row to search that name in US Investigators.
          </p>
        </section>
      )}
    </>
  );
}
