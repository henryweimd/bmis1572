import { useEffect, useState } from 'react';
import { escapeLiteral, query } from './duckdb';
import { CategoryBars, StackedMultiBars, VintageHeatmap } from './charts';
import type { LineSeries, VintageRow } from './charts';
import { intIn, pick, readHash, writeHash } from './hash';
import { downloadCsv, stackedCsv } from './csv';
import { SERIES_COLORS, VINTAGE_KMAX } from './lib/constants';
import { clampYearPair, fmtInt, growthPct, num0, pivotVintage, yearRange } from './lib/format';
import type { RawVintageRow } from './lib/format';

interface OrgTopRow {
  org: string;
  n_entities: number;
  n_receipts: number;
  first_year: number;
  last_year: number;
  n_countries: number;
  top_country: string;
  n_variants: number;
  example_site: string | null;
  tpy: number;
}

interface OrgConfig {
  indexTable: string;
  yearTable: string;
  keyCol: string;
  singular: string;
  plural: string;
  ever: string;
  table: string;
  selector: string;
}

const CONFIG: Record<'cro' | 'irb', OrgConfig> = {
  cro: {
    indexTable: 'cro_index',
    yearTable: 'cro_year',
    keyCol: 'cro',
    singular: 'CRO',
    plural: 'CROs',
    ever: 'Companies',
    table: 'companies',
    selector: 'Company',
  },
  irb: {
    indexTable: 'irb_index',
    yearTable: 'irb_year',
    keyCol: 'irb',
    singular: 'IRB',
    plural: 'IRBs',
    ever: 'Boards',
    table: 'boards',
    selector: 'Board',
  },
};

export default function OrgTab({
  kind,
  bands,
  yearMin,
  yearMax,
  latestFull,
  demo,
  ready,
}: {
  kind: 'cro' | 'irb';
  bands: string[];
  yearMin: number;
  yearMax: number;
  latestFull: number;
  demo: boolean;
  ready: boolean;
}) {
  const cfg = CONFIG[kind];
  const [hashInit] = useState(readHash);
  const [band, setBand] = useState(() => pick(hashInit[`${kind}.b`], ['all', ...bands], 'all'));
  const [[y0, y1], setYears] = useState<[number, number]>(() =>
    clampYearPair(
      intIn(hashInit[`${kind}.y0`], yearMin, yearMax, yearMin),
      intIn(hashInit[`${kind}.y1`], yearMin, yearMax, yearMax),
      yearMin,
      yearMax,
    ),
  );
  const [sel, setSel] = useState(() => {
    const s = hashInit[`${kind}.s`] ?? 'all';
    return s.length <= 80 ? s : 'all';
  });
  const [sort, setSort] = useState<'total' | 'rate'>(() =>
    pick(hashInit[`${kind}.o`], ['total', 'rate'] as const, 'total'),
  );

  const [opts, setOpts] = useState<{ org: string; n: number }[]>([]);
  const [kpi, setKpi] = useState<{ active: number; receipts: number; receipts09: number; orgs: number } | null>(null);
  const [series, setSeries] = useState<LineSeries[]>([]);
  const [footprint, setFootprint] = useState<{ category: string; v: number }[]>([]);
  const [ent, setEnt] = useState<LineSeries[]>([]);
  const [top, setTop] = useState<OrgTopRow[]>([]);
  const [oret, setOret] = useState<VintageRow[]>([]);
  const [note, setNote] = useState('');

  const yearOpts = yearRange(yearMin, yearMax);

  // Static org metadata + dropdown options + vintage retention (only runs once per kind).
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const [o, rt] = await Promise.all([
          query<{ org: string; n: number }>(
            `SELECT CAST(${cfg.keyCol} AS VARCHAR) AS org, CAST(n_receipts AS DOUBLE) AS n` +
              ` FROM ${cfg.indexTable} ORDER BY n DESC LIMIT 200`,
          ),
          query<RawVintageRow>(
            `SELECT CAST(cohort AS INTEGER) AS cohort, CAST(k AS INTEGER) AS k,` +
              ` CAST(retention AS DOUBLE) AS v, CAST(n_cohort AS INTEGER) AS n,` +
              ` CAST(n_active AS INTEGER) AS na FROM org_retention` +
              ` WHERE org_type = '${kind}' AND cohort BETWEEN 2009 AND 2025 AND k <= ${VINTAGE_KMAX} ORDER BY 1, 2`,
          ).catch(() => []),
        ]);
        if (cancelled) return;
        setOpts(o.map((r) => ({ org: r.org, n: num0(r.n) })));
        setOret(pivotVintage(rt, VINTAGE_KMAX));
      } catch (e) {
        if (cancelled) return;
        setNote(`${cfg.singular} metadata failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, kind, cfg.keyCol, cfg.indexTable, cfg.singular]);

  // Top table (decoupled so sorting doesn't re-query charts).
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await query<OrgTopRow>(
          `SELECT CAST(${cfg.keyCol} AS VARCHAR) AS org, CAST(n_entities AS INTEGER) AS n_entities,` +
            ` CAST(n_receipts AS DOUBLE) AS n_receipts, CAST(first_year AS INTEGER) AS first_year,` +
            ` CAST(last_year AS INTEGER) AS last_year, CAST(n_countries AS INTEGER) AS n_countries,` +
            ` CAST(top_country AS VARCHAR) AS top_country, CAST(n_variants AS INTEGER) AS n_variants,` +
            ` CAST(example_site AS VARCHAR) AS example_site,` +
            ` CAST(n_receipts AS DOUBLE) / (last_year - first_year + 1) AS tpy FROM ${cfg.indexTable}` +
            ` ORDER BY ${sort === 'rate' ? 'tpy DESC' : 'n_receipts DESC'} LIMIT 25`,
        );
        if (cancelled) return;
        setTop(t);
      } catch (e) {
        if (cancelled) return;
        setNote(`${cfg.singular} leaderboard failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, sort, cfg.keyCol, cfg.indexTable, cfg.singular]);

  // Filtered KPIs, receipts series, entities, and geographic footprint.
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const bc = band === 'all' ? '' : ` AND band = '${escapeLiteral(band)}'`;
        const cc = sel === 'all' ? '' : ` AND ${cfg.keyCol} = '${escapeLiteral(sel)}'`;
        const [k, nco, entRows] = await Promise.all([
          query<{ active: number; r25: number; r09: number }>(
            `SELECT COUNT(DISTINCT CASE WHEN year = ${latestFull} THEN ${cfg.keyCol} END) AS active,` +
              ` CAST(SUM(CASE WHEN year = ${latestFull} THEN n_receipts ELSE 0 END) AS DOUBLE) AS r25,` +
              ` CAST(SUM(CASE WHEN year = 2009 THEN n_receipts ELSE 0 END) AS DOUBLE) AS r09` +
              ` FROM ${cfg.yearTable} WHERE 1 = 1${bc}${cc}`,
          ),
          query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${cfg.indexTable}`),
          query<{ y: number; n: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(SUM(n_entities) AS DOUBLE) AS n FROM ${cfg.yearTable}` +
              ` WHERE year BETWEEN ${y0} AND ${y1}${bc}${cc} GROUP BY 1 ORDER BY 1`,
          ),
        ]);
        if (cancelled) return;
        setKpi({
          active: num0(k[0]?.active),
          receipts: num0(k[0]?.r25),
          receipts09: num0(k[0]?.r09),
          orgs: num0(nco[0]?.n),
        });
        setEnt([
          {
            label: sel === 'all' ? 'Active entities' : sel,
            color: '#2ca02c',
            points: entRows.map((r) => ({ x: r.y, y: num0(r.n) })),
          },
        ]);

        const names =
          sel === 'all'
            ? (
                await query<{ org: string }>(
                  `SELECT CAST(${cfg.keyCol} AS VARCHAR) AS org FROM ${cfg.yearTable}` +
                    ` WHERE year BETWEEN ${y0} AND ${y1}${bc}` +
                    ` GROUP BY 1 ORDER BY SUM(n_receipts) DESC LIMIT 8`,
                )
              ).map((r) => r.org)
            : [sel];
        if (cancelled) return;

        const [sr, tot, fp] = await Promise.all([
          names.length === 0
            ? Promise.resolve([])
            : query<{ y: number; org: string; n: number }>(
                `SELECT CAST(year AS INTEGER) AS y, CAST(${cfg.keyCol} AS VARCHAR) AS org,` +
                  ` CAST(SUM(n_receipts) AS DOUBLE) AS n FROM ${cfg.yearTable}` +
                  ` WHERE year BETWEEN ${y0} AND ${y1}${bc}` +
                  ` AND ${cfg.keyCol} IN (${names.map((n) => `'${escapeLiteral(n)}'`).join(',')})` +
                  ` GROUP BY 1, 2 ORDER BY 1, 2`,
              ),
          sel === 'all'
            ? query<{ y: number; n: number }>(
                `SELECT CAST(year AS INTEGER) AS y, CAST(SUM(n_receipts) AS DOUBLE) AS n FROM ${cfg.yearTable}` +
                  ` WHERE year BETWEEN ${y0} AND ${y1}${bc} GROUP BY 1 ORDER BY 1`,
              )
            : Promise.resolve([]),
          sel === 'all'
            ? Promise.resolve([])
            : query<{ category: string; v: number }>(
                `SELECT CAST(band AS VARCHAR) AS category, CAST(SUM(n_receipts) AS DOUBLE) AS v` +
                  ` FROM ${cfg.yearTable} WHERE ${cfg.keyCol} = '${escapeLiteral(sel)}'` +
                  ` AND year BETWEEN ${y0} AND ${y1}${bc} GROUP BY 1 ORDER BY 2 DESC`,
              ),
        ]);
        if (cancelled) return;

        const top8: LineSeries[] = names.map((n, i) => ({
          label: n,
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          points: sr.filter((r) => r.org === n).map((r) => ({ x: r.y, y: num0(r.n) })),
        }));
        if (sel === 'all') {
          const part = new Map<number, number>();
          for (const r of sr) part.set(r.y, (part.get(r.y) ?? 0) + num0(r.n));
          top8.push({
            label: 'All other',
            color: '#94a3b8',
            points: tot.map((r) => ({ x: r.y, y: Math.max(0, num0(r.n) - (part.get(r.y) ?? 0)) })),
          });
        }
        setSeries(top8);
        setFootprint(fp.map((r) => ({ category: r.category, v: num0(r.v) })));
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`${cfg.singular} query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, band, y0, y1, sel, latestFull, cfg.keyCol, cfg.yearTable, cfg.indexTable, cfg.singular]);

  useEffect(() => {
    writeHash({
      [`${kind}.b`]: band,
      [`${kind}.y0`]: String(y0),
      [`${kind}.y1`]: String(y1),
      [`${kind}.s`]: sel,
      [`${kind}.o`]: sort,
    });
  }, [kind, band, y0, y1, sel, sort]);

  if (demo) return <p className="muted">Run the pipeline for {cfg.plural} data.</p>;

  const growth = growthPct(kpi?.receipts, kpi?.receipts09);

  return (
    <>
      {note && <p className="banner">{note}</p>}
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
                setYears([v, Math.max(v, y1)]);
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
                setYears([Math.min(y0, v), v]);
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
            {cfg.selector}
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="all">All (top 8 + other in chart)</option>
              {opts.map((o) => (
                <option key={o.org} value={o.org}>
                  {o.org} ({fmtInt.format(o.n)})
                </option>
              ))}
            </select>
          </label>
          {sel !== 'all' && (
            <button type="button" className="btn btn-ghost" onClick={() => setSel('all')}>
              Clear {cfg.selector.toLowerCase()}
            </button>
          )}
          <span className="muted">
            {kpi ? `${fmtInt.format(kpi.orgs)} ${cfg.table}; dropdown shows top 200` : ''}
          </span>
        </div>
      </section>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">
            Active {cfg.plural}, {latestFull}
          </span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.active) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">
            {cfg.singular} receipts, {latestFull}
          </span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.receipts) : '—'}</span>
          <span className="kpi-sub">{growth !== null ? `${growth}% vs 2009` : '\u00A0'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{cfg.ever} ever (in file)</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.orgs) : '—'}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            {cfg.singular} receipts per year{sel === 'all' ? ' (top 8 + all other)' : `: ${sel}`}
          </h2>
          {!!series.length && (
            <button
              className="btn"
              onClick={() => stackedCsv(`${kind}-receipts-by-year.csv`, series)}
            >
              CSV
            </button>
          )}
        </div>
        <StackedMultiBars series={series} allTicks />
        <p className="caption">
          Top 8 {cfg.table} by receipts in the selected range, plus all others (normalized site
          strings) · 2008 (ramp-up) and 2026 (thru Aug) are partial. Toggle 100% for yearly share.
        </p>
      </section>

      {sel !== 'all' && !!footprint.length && (
        <section className="panel">
          <div className="panel-head">
            <h2>
              {sel}: receipts by geography, {y0}–{y1}
            </h2>
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  `${kind}-footprint-${y0}-${y1}.csv`,
                  ['band', 'receipts'],
                  footprint.map((r) => [r.category, r.v]),
                )
              }
            >
              CSV
            </button>
          </div>
          <CategoryBars data={footprint} />
          <p className="caption">
            Where this {cfg.singular.toLowerCase()}&apos;s receipts were filed (investigator
            geography bands, selected range).
          </p>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>
            Active {cfg.singular} entities per year{sel === 'all' ? '' : `: ${sel}`}
          </h2>
          {!!ent.length && (
            <button
              className="btn"
              onClick={() => stackedCsv(`${kind}-entities-by-year.csv`, ent)}
            >
              CSV
            </button>
          )}
        </div>
        <StackedMultiBars series={ent} allTicks />
        <p className="caption">
          Distinct {cfg.singular} site entities with ≥1 receipt that year.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{cfg.singular} vintage attrition</h2>
          {!!oret.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  `${kind}-vintage-attrition.csv`,
                  ['vintage', 'n', ...oret[0].cells.map((_, k) => `k${k}_pct`)],
                  oret.map((r) => [r.cohort, r.n, ...r.cells.map((c) => c ?? '')]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        <VintageHeatmap rows={oret} kMax={VINTAGE_KMAX} unit={kind} />
        <p className="caption">
          Of the {cfg.table} first seen in a given year (their vintage), the share active again k
          years later. Right-censored; 2008 excluded (file ramp-up). Company/board keys carry
          residual spelling splits — see Definitions: org_retention.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            {sort === 'rate'
              ? `Top ${cfg.table} by trials/year rate (global)`
              : `Top ${cfg.table} by lifetime receipts (global)`}
          </h2>
          {!!top.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  `${kind}-top.csv`,
                  [cfg.selector.toLowerCase(), 'receipts', 'per_year', 'entities', 'countries', 'top_country', 'first_year', 'last_year', 'variants', 'top_filing_name'],
                  top.map((r) => [
                    r.org,
                    r.n_receipts,
                    r.tpy.toFixed(2),
                    r.n_entities,
                    r.n_countries,
                    r.top_country,
                    r.first_year,
                    r.last_year,
                    r.n_variants,
                    r.example_site ?? '',
                  ]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        <div className="filters">
          <div className="seg" role="group" aria-label={`${cfg.singular} sort`}>
            <button
              className={sort === 'total' ? 'active' : ''}
              onClick={() => setSort('total')}
              title="Rank by lifetime receipts"
            >
              Total refs
            </button>
            <button
              className={sort === 'rate' ? 'active' : ''}
              onClick={() => setSort('rate')}
              title="Rank by receipts/year: lifetime refs over inclusive first-last span"
            >
              Trials/year
            </button>
          </div>
          <span className="muted">Click any row to filter charts and inspect geographic footprint.</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{cfg.selector}</th>
                <th className="num">Receipts</th>
                <th className="num">/yr</th>
                <th className="num">Entities</th>
                <th className="num">Countries</th>
                <th>Top country</th>
                <th>Span</th>
                <th className="num">Variants</th>
                <th>Top filing name</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <tr
                  key={r.org}
                  className={sel === r.org ? 'picked' : 'pickable'}
                  onClick={() => setSel(sel === r.org ? 'all' : r.org)}
                  title={sel === r.org ? 'Click to show all' : `Filter to ${r.org}`}
                >
                  <td>{r.org}</td>
                  <td className="num">{fmtInt.format(r.n_receipts)}</td>
                  <td className="num">{r.tpy.toFixed(2)}</td>
                  <td className="num">{fmtInt.format(r.n_entities)}</td>
                  <td className="num">{r.n_countries}</td>
                  <td>{r.top_country}</td>
                  <td>
                    {r.first_year}–{r.last_year}
                  </td>
                  <td className="num">{r.n_variants}</td>
                  <td>{r.example_site ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          Variants = distinct raw site strings merged into the key; top filing name is the most
          frequent raw string. Residual splits remain (see Definitions).
        </p>
      </section>
    </>
  );
}
