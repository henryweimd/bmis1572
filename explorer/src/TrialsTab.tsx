import { useEffect, useState } from 'react';
import { query } from './duckdb';
import { CategoryBars } from './charts';

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num0 = (v: unknown): number =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? 0 : Number(v);

interface KolRow {
  name: string;
  country: string;
  n: number;
  sponsors: number;
}

interface CoverRow {
  band: string;
  n: number;
  lk: number;
}

export default function TrialsTab({ demo, ready }: { demo: boolean; ready: boolean }) {
  const [bounds, setBounds] = useState<{ lo: number; hi: number } | null>(null);
  const [y0, setY0] = useState<number | null>(null);
  const [y1, setY1] = useState<number | null>(null);
  const [kpi, setKpi] = useState<{ trials: number; withOff: number; sponsors: number; linked: number } | null>(null);
  const [sponsors, setSponsors] = useState<{ category: string; v: number }[]>([]);
  const [phases, setPhases] = useState<{ category: string; v: number }[]>([]);
  const [tas, setTas] = useState<{ category: string; v: number }[]>([]);
  const [kols, setKols] = useState<KolRow[]>([]);
  const [cover, setCover] = useState<CoverRow[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        if (y0 === null || y1 === null) {
          const b = await query<{ lo: number; hi: number }>(
            `SELECT CAST(MIN(start_y) AS INTEGER) AS lo, CAST(MAX(start_y) AS INTEGER) AS hi FROM ctgov_trials`,
          );
          if (cancelled || !b.length) return;
          setBounds({ lo: b[0].lo, hi: b[0].hi });
          setY0(b[0].lo);
          setY1(b[0].hi);
          return;
        }
        const yr = `start_y BETWEEN ${y0} AND ${y1}`;
        const [k, sp, ph, ta, ko, cv] = await Promise.all([
          query<{ trials: number; withOff: number; sponsors: number; linked: number }>(
            `SELECT (SELECT COUNT(*) FROM ctgov_trials WHERE ${yr}) AS trials,` +
              ` (SELECT COUNT(DISTINCT o.nct) FROM ctgov_officials o` +
              ` JOIN ctgov_trials t ON t.nct = o.nct WHERE t.${yr}) AS withOff,` +
              ` (SELECT COUNT(DISTINCT sponsor) FROM ctgov_trials WHERE ${yr}) AS sponsors,` +
              ` (SELECT COUNT(DISTINCT l.person_id) FROM person_ctgov_link l` +
              ` JOIN ctgov_trials t ON t.nct = l.nct WHERE t.${yr}) AS linked`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CAST(sponsor_disp AS VARCHAR) AS category, CAST(COUNT(*) AS DOUBLE) AS v` +
              ` FROM ctgov_trials WHERE ${yr} GROUP BY sponsor, sponsor_disp ORDER BY 2 DESC LIMIT 15`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CAST(phase AS VARCHAR) AS category, CAST(COUNT(*) AS DOUBLE) AS v` +
              ` FROM ctgov_trials WHERE ${yr} GROUP BY 1 ORDER BY 2 DESC`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CAST(ta1 AS VARCHAR) AS category, CAST(COUNT(*) AS DOUBLE) AS v FROM (` +
              ` SELECT UNNEST(STRING_SPLIT(ta, ';')) AS ta1 FROM ctgov_trials` +
              ` WHERE ta <> '' AND ${yr}) GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
          ),
          query<KolRow>(
            `SELECT CAST(p.display_name AS VARCHAR) AS name, CAST(p.country AS VARCHAR) AS country,` +
              ` CAST(COUNT(DISTINCT l.nct) AS INTEGER) AS n,` +
              ` CAST(COUNT(DISTINCT t.sponsor) AS INTEGER) AS sponsors` +
              ` FROM person_ctgov_link l JOIN person_index p ON p.person_id = l.person_id` +
              ` JOIN ctgov_trials t ON t.nct = l.nct WHERE t.${yr}` +
              ` GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 25`,
          ),
          query<CoverRow>(
            `SELECT CAST(p.band AS VARCHAR) AS band, CAST(COUNT(*) AS INTEGER) AS n,` +
              ` CAST(COUNT(DISTINCT l.person_id) AS INTEGER) AS lk FROM person_index p` +
              ` LEFT JOIN (SELECT DISTINCT l2.person_id FROM person_ctgov_link l2` +
              ` JOIN ctgov_trials t ON t.nct = l2.nct WHERE t.${yr}) l` +
              ` ON l.person_id = p.person_id GROUP BY 1 ORDER BY 2 DESC`,
          ),
        ]);
        if (cancelled) return;
        setKpi({
          trials: num0(k[0]?.trials),
          withOff: num0(k[0]?.withOff),
          sponsors: num0(k[0]?.sponsors),
          linked: num0(k[0]?.linked),
        });
        setSponsors(sp.map((r) => ({ category: r.category, v: num0(r.v) })));
        setPhases(ph.map((r) => ({ category: r.category, v: num0(r.v) })));
        setTas(ta.map((r) => ({ category: r.category, v: num0(r.v) })));
        setKols(ko);
        setCover(cv);
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`Trials query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, y0, y1]);

  if (demo) return <p className="muted">Run the pipeline for trials data.</p>;

  const yearOpts: number[] = [];
  if (bounds) for (let y = bounds.lo; y <= bounds.hi; y++) yearOpts.push(y);

  return (
    <>
      {note && <p className="banner">{note}</p>}
      <section className="panel">
        <p>
          <strong>About this data:</strong> US industry-led interventional trials from the
          clinicaltrials.gov API, with study-level officials (chairs, directors, PIs —{' '}
          <em>not</em> site investigators), lead sponsors, phases, and keyword therapeutic areas.
          Person links match officials to BMIS investigators by name + affiliation; see
          Definitions. Trials with unknown start year are excluded when filtering.
        </p>
        <div className="filters">
          <label>
            From
            <select value={y0 ?? ''} onChange={(e) => setY0(Number(e.target.value))}>
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={y1 ?? ''} onChange={(e) => setY1(Number(e.target.value))}>
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="kpis four">
        <div className="kpi">
          <span className="kpi-label">US industry trials</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.trials) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Trials naming officials</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.withOff) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Lead sponsors</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.sponsors) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">BMIS persons linked</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.linked) : '—'}</span>
        </div>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Top sponsors by US trials</h2>
          <CategoryBars data={sponsors} />
          <p className="caption">Exact per-trial lead sponsor; name variants merged by key.</p>
        </div>
        <div className="panel">
          <h2>Trials by phase</h2>
          <CategoryBars data={phases} />
          <p className="caption">NA = no phase listed; combos (e.g. P2+P3) kept whole.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Trials by therapeutic area</h2>
        <CategoryBars data={tas} />
        <p className="caption">
          Keyword classification of CT.gov conditions text; multi-area trials count once per
          area; trials with no conditions excluded.
        </p>
      </section>

      <section className="panel">
        <h2>Most-linked investigators (study officials)</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Investigator</th>
                <th>Country</th>
                <th>CT.gov trials</th>
                <th>Sponsors</th>
              </tr>
            </thead>
            <tbody>
              {kols.map((r) => (
                <tr key={`${r.name}-${r.country}`}>
                  <td>{r.name}</td>
                  <td>{r.country}</td>
                  <td>{fmtInt.format(r.n)}</td>
                  <td>{r.sponsors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          BMIS persons by linked CT.gov trials in range (strong + weak tiers). Skews toward study
          chairs and KOLs — CT.gov names no site investigators, so most investigators cannot
          appear here.
        </p>
      </section>

      <section className="panel">
        <h2>Linkage coverage by geography</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Band</th>
                <th>BMIS persons</th>
                <th>Linked</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {cover.map((r) => (
                <tr key={r.band}>
                  <td>{r.band}</td>
                  <td>{fmtInt.format(r.n)}</td>
                  <td>{r.lk}</td>
                  <td>{r.n > 0 ? `${((r.lk / r.n) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          Share of strict persons matching ≥1 study official in range. Thin everywhere by
          construction; gaps reflect CT.gov reporting, not investigator quality.
        </p>
      </section>
    </>
  );
}
