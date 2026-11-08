import { useEffect, useMemo, useState } from 'react';
import { query } from './duckdb';
import { CategoryBars, StackedMultiBars, TrendChart } from './charts';
import type { LineSeries } from './charts';
import { downloadCsv, stackedCsv, trendCsv } from './csv';

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num0 = (v: unknown): number =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? 0 : Number(v);

const WHO_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf',
];
const BAND_COLORS: Record<string, string> = {
  'United States': '#1f77b4',
  'Europe (EU+UK)': '#ff7f0e',
  'South America': '#2ca02c',
  'Middle East': '#d62728',
  'South Asia': '#9467bd',
  'East Asia & Pacific': '#8c564b',
  'Rest of world': '#7f7f7f',
};

interface WhoRow {
  country: string;
  band: string;
  records: number;
  trials: number;
}

export default function WHOTab({ demo, ready }: { demo: boolean; ready: boolean }) {
  const [kpi, setKpi] = useState<{ trials: number; records: number; countries: number } | null>(null);
  const [top, setTop] = useState<{ category: string; v: number }[]>([]);
  const [bands, setBands] = useState<{ category: string; v: number }[]>([]);
  const [yoy, setYoy] = useState<{ d: string; v: number }[]>([]);
  const [stack, setStack] = useState<LineSeries[]>([]);
  const [rows, setRows] = useState<WhoRow[]>([]);
  const [cyRows, setCyRows] = useState<{ c: string; y: number; n: number; r: number }[]>([]);
  const [cyCountry, setCyCountry] = useState('all');
  const [cyY0, setCyY0] = useState(2000);
  const [cyY1, setCyY1] = useState(2026);
  const [cyMetric, setCyMetric] = useState<'n' | 'r'>('n');
  const [cySort, setCySort] = useState<{ key: string; dir: 1 | -1 }>({
    key: 'total',
    dir: -1,
  });
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const [g, tc, bd, yy, cy, all] = await Promise.all([
          query<{ records: number; trials: number }>(
            `SELECT CAST(records AS DOUBLE) AS records, CAST(trials AS DOUBLE) AS trials FROM who_global`,
          ),
          query<{ c: string; n: number }>(
            `SELECT CAST(country AS VARCHAR) AS c, CAST(trials AS DOUBLE) AS n FROM who_country ORDER BY 2 DESC LIMIT 15`,
          ),
          query<{ b: string; n: number }>(
            `SELECT CAST(band AS VARCHAR) AS b, CAST(SUM(trials) AS DOUBLE) AS n FROM who_country GROUP BY 1 ORDER BY 2 DESC`,
          ),
          query<{ y: number; n: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(trials AS DOUBLE) AS n FROM who_year ORDER BY 1`,
          ),
          query<{ c: string; y: number; n: number; r: number }>(
            `SELECT CAST(country AS VARCHAR) AS c, CAST(year AS INTEGER) AS y, CAST(trials AS DOUBLE) AS n, CAST(records AS DOUBLE) AS r FROM who_country_year ORDER BY 1, 2`,
          ),
          query<WhoRow>(
            `SELECT CAST(country AS VARCHAR) AS country, CAST(band AS VARCHAR) AS band,` +
              ` CAST(records AS INTEGER) AS records, CAST(trials AS INTEGER) AS trials` +
              ` FROM who_country ORDER BY 4 DESC, 1`,
          ),
        ]);
        if (cancelled) return;
        setKpi({ trials: num0(g[0]?.trials), records: num0(g[0]?.records), countries: all.length });
        setTop(tc.map((r) => ({ category: r.c, v: num0(r.n) })));
        setBands(bd.map((r) => ({ category: r.b, v: num0(r.n) })));
        setYoy(yy.map((r) => ({ d: String(r.y), v: num0(r.n) })));
        const totals = new Map<string, number>();
        for (const r of cy) totals.set(r.c, (totals.get(r.c) ?? 0) + num0(r.n));
        const top8 = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
        const years = [...new Set(cy.map((r) => r.y))].sort((a, b) => a - b);
        const at = (y: number, pred: (c: string) => boolean): number =>
          cy.filter((r) => r.y === y && pred(r.c)).reduce((a, r) => a + num0(r.n), 0);
        const series: LineSeries[] = top8.map((c, i) => ({
          label: c,
          color: WHO_COLORS[i % WHO_COLORS.length],
          points: years.map((y) => ({ x: y, y: at(y, (q) => q === c) })),
        }));
        series.push({
          label: 'Other top-20',
          color: '#7f7f7f',
          points: years.map((y) => ({ x: y, y: at(y, (q) => !top8.includes(q)) })),
        });
        setStack(series);
        setRows(all);
        setCyRows(cy.map((r) => ({ c: r.c, y: r.y, n: num0(r.n), r: num0(r.r) })));
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`WHO query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo]);

  const cyTotals = useMemo(() => {
    const t = new Map<string, number>();
    for (const r of cyRows) t.set(r.c, (t.get(r.c) ?? 0) + r.n);
    return t;
  }, [cyRows]);
  const cyCountries = useMemo(
    () => [...cyTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
    [cyTotals],
  );
  const cyYears = useMemo(
    () => [...new Set(cyRows.map((r) => r.y))].sort((a, b) => a - b),
    [cyRows],
  );
  const cyCols = useMemo(
    () => cyYears.filter((y) => y >= cyY0 && y <= cyY1),
    [cyYears, cyY0, cyY1],
  );
  const cyShown = useMemo(() => {
    const keep =
      cyCountry === 'all' ? cyCountries : cyCountries.filter((c) => c === cyCountry);
    const cell = new Map<string, { n: number; r: number }>();
    for (const row of cyRows) cell.set(`${row.c}|${row.y}`, { n: row.n, r: row.r });
    const rows = keep.map((c) => {
      const vals = new Map<number, number>();
      let total = 0;
      for (const y of cyCols) {
        const v = cell.get(`${c}|${y}`)?.[cyMetric] ?? 0;
        vals.set(y, v);
        total += v;
      }
      return { c, total, vals };
    });
    const { key, dir } = cySort;
    return rows.sort((a, b) =>
      key === 'country'
        ? dir * a.c.localeCompare(b.c)
        : key === 'total'
          ? dir * (a.total - b.total)
          : dir * ((a.vals.get(Number(key)) ?? 0) - (b.vals.get(Number(key)) ?? 0)),
    );
  }, [cyRows, cyCountries, cyCols, cyCountry, cyMetric, cySort]);
  const cySortBy = (key: string) =>
    setCySort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: key === 'country' ? 1 : -1 },
    );
  const cyArrow = (key: string) =>
    cySort.key === key ? (cySort.dir === 1 ? ' ▲' : ' ▼') : '';

  if (demo) return <p className="muted">Run the pipeline for WHO data.</p>;

  return (
    <>
      {note && <p className="banner">{note}</p>}
      <section className="panel">
        <p>
          <strong>About this data:</strong> aggregate trial counts from the WHO{' '}
          <a
            href="https://trialsearch.who.int/AdvSearch.aspx"
            target="_blank"
            rel="noreferrer"
          >
            ICTRP Search Portal Advanced Search
          </a>{' '}
          (International Clinical Trials Registry Platform —{' '}
          <a href="https://www.who.int/clinical-trials-registry-platform" target="_blank" rel="noreferrer">
            who.int/clinical-trials-registry-platform
          </a>
          ), scraped 7 Nov 2026. Each figure is the portal&apos;s own &ldquo;N records for M
          trials found&rdquo; for one country (or global), Recruitment Status = ALL, optionally
          windowed to a Date-of-registration year. No trial-level or investigator-level data
          was fetched. Code: <code>pipeline/who.py</code>.
        </p>
        <p className="caption">
          Records are registry entries across ICTRP&apos;s primary registries (including
          ClinicalTrials.gov); trials are deduplicated studies. Multi-country trials count in
          every listed country, so country figures sum past the global total. Three countries
          return zero via the portal&apos;s country list: verified 2026-11-07 against
          ClinicalTrials.gov (114 studies in Côte d&apos;Ivoire, 50 in Laos, 1 in North
          Korea), the first two are portal indexing gaps, not true zeros.
        </p>
      </section>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Global trials (ICTRP)</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.trials) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Global registry records</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.records) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Portal countries</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.countries) : '—'}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Global trials by registration year</h2>
        <TrendChart data={yoy} />
        <p className="caption">
          ICTRP registrations per year, all countries and statuses. Retrospective imports
          make early years sparse; 2026 is partial (search date 7 Nov 2026).{' '}
          {!!yoy.length && (
            <button className="btn" onClick={() => trendCsv('who-global-by-year.csv', yoy)}>
              CSV
            </button>
          )}
        </p>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Top countries by trials</h2>
          <CategoryBars data={top} />
          <p className="caption">All-time trials per country (multi-country trials repeat).</p>
        </div>
        <div className="panel">
          <h2>Trials by region band</h2>
          <CategoryBars data={bands} />
          <p className="caption">Same bands as the FDA tabs; country sums, so multi-country overlap.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Top countries over time</h2>
        <StackedMultiBars series={stack} allTicks />
        <p className="caption">
          Registration-year trials for the top 8 countries plus other top-20. Only the top 20
          countries were scraped by year — 179 smaller countries are excluded here, so this
          understates the global total (see trend above). Yearly figures can also double-count
          trials first registered in different years across registries — visibly for the EU —
          so compare shapes, not levels, against all-time totals. Toggle 100% for yearly share.{' '}
          {!!stack.length && (
            <button
              className="btn"
              onClick={() => stackedCsv('who-top-countries-by-year.csv', stack)}
            >
              CSV
            </button>
          )}
        </p>
      </section>

      <section className="panel">
        <h2>Top-20 countries by year (stack data)</h2>
        <div className="filters">
          <div className="seg" role="group" aria-label="WHO metric">
            <button
              className={cyMetric === 'n' ? 'active' : ''}
              onClick={() => setCyMetric('n')}
              title="Deduplicated trials (matches the stack chart)"
            >
              Trials
            </button>
            <button
              className={cyMetric === 'r' ? 'active' : ''}
              onClick={() => setCyMetric('r')}
              title="Registry records across primary registries"
            >
              Records
            </button>
          </div>
          <label>
            Country
            <select value={cyCountry} onChange={(e) => setCyCountry(e.target.value)}>
              <option value="all">All top-20</option>
              {cyCountries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <select value={cyY0} onChange={(e) => setCyY0(Number(e.target.value))}>
              {cyYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={cyY1} onChange={(e) => setCyY1(Number(e.target.value))}>
              {cyYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll short">
          <table>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0 }}>
                  <button className="btn" onClick={() => cySortBy('country')}>
                    Country{cyArrow('country')}
                  </button>
                </th>
                <th>
                  <button className="btn" onClick={() => cySortBy('total')}>
                    Total{cyArrow('total')}
                  </button>
                </th>
                {cyCols.map((y) => (
                  <th key={y}>
                    <button className="btn" onClick={() => cySortBy(String(y))}>
                      {y}
                      {cyArrow(String(y))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cyShown.map((r) => (
                <tr key={r.c}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--surface)' }}>
                    {r.c}
                  </td>
                  <td>
                    <strong>{fmtInt.format(r.total)}</strong>
                  </td>
                  {cyCols.map((y) => (
                    <td key={y}>{fmtInt.format(r.vals.get(y) ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          The exact numbers behind the stack chart above, pivoted: one row per country
          (most→fewest trials by default), one column per registration year. Click any
          header to sort; totals respect the year range. 100%-mode shares derive from
          these trials. Row totals can exceed all-time country totals: a trial registered
          in different years across registries counts in each year (notably EU).{' '}
          {!!cyShown.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  'who-top20-by-year.csv',
                  ['country', 'total', ...cyCols.map(String)],
                  cyShown.map((r) => [
                    r.c,
                    r.total,
                    ...cyCols.map((y) => r.vals.get(y) ?? 0),
                  ]),
                )
              }
            >
              CSV
            </button>
          )}
        </p>
      </section>

      <section className="panel">
        <h2>
          All countries{' '}
          {!!rows.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  'who-countries.csv',
                  ['country', 'band', 'records', 'trials'],
                  rows.map((r) => [r.country, r.band, r.records, r.trials]),
                )
              }
            >
              CSV
            </button>
          )}
        </h2>
        <div className="table-scroll short">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Region</th>
                <th>Records</th>
                <th>Trials</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.country}>
                  <td>{r.country}</td>
                  <td>
                    <span
                      className="swatch"
                      style={{ background: BAND_COLORS[r.band] ?? '#333' }}
                    />{' '}
                    {r.band}
                  </td>
                  <td>{fmtInt.format(r.records)}</td>
                  <td>{fmtInt.format(r.trials)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          All-time ICTRP figures per portal country, ALL statuses. Zero rows for Côte
          d&apos;Ivoire and Laos are portal indexing gaps (CT.gov lists 114 and 50 studies);
          North Korea (≈1 study) is shown as the portal reported it.
        </p>
      </section>
    </>
  );
}
