import { useEffect, useMemo, useRef, useState } from 'react';
import { escapeLiteral, query } from './duckdb';
import { CategoryBars, StackedMultiBars, TrendChart } from './charts';
import type { LineSeries } from './charts';
import { DataTable } from './components/DataTable';
import type { ColumnDef } from './components/DataTable';
import { intIn, readHash, writeHash } from './hash';
import { downloadCsv, stackedCsv, trendCsv } from './csv';
import { clampYearPair, fmtInt, num0, yearRange } from './lib/format';
import type { FeasibilityPreset } from './OverviewTab';

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

const PHASE_ORDER = ['EARLY_P1', 'P1', 'P1+P2', 'P2', 'P2+P3', 'P3', 'P4', 'NA'] as const;
const PHASE_COLORS = ['#9467bd', '#1f77b4', '#17becf', '#2ca02c', '#bcbd22', '#ff7f0e', '#d62728', '#7f7f7f'];

export default function TrialsTab({
  demo,
  ready,
  jumpTrial,
  onJump,
  onLaunchFeasibility,
}: {
  demo: boolean;
  ready: boolean;
  jumpTrial?: { nct: string; seq: number } | null;
  onJump: (name: string) => void;
  onLaunchFeasibility?: (preset: FeasibilityPreset) => void;
}) {
  const [hashInit] = useState(readHash);
  const [bounds, setBounds] = useState<{ lo: number; hi: number } | null>(null);
  const [y0, setY0] = useState<number | null>(null);
  const [y1, setY1] = useState<number | null>(null);
  const [kpi, setKpi] = useState<{ trials: number; withOff: number; sponsors: number; linked: number; conc: number } | null>(null);
  const [sponsors, setSponsors] = useState<{ category: string; v: number }[]>([]);
  const [phases, setPhases] = useState<{ category: string; v: number }[]>([]);
  const [tas, setTas] = useState<{ category: string; v: number }[]>([]);
  const [kols, setKols] = useState<KolRow[]>([]);
  const [cover, setCover] = useState<CoverRow[]>([]);
  const [audit, setAudit] = useState<
    { tier: string; nl: number; np: number; sc: number; mo: number; ot: number; ol: number }[]
  >([]);
  const [triYoy, setTriYoy] = useState<{ d: string; v: number }[]>([]);
  const [phaseTrend, setPhaseTrend] = useState<LineSeries[]>([]);
  const [note, setNote] = useState('');
  const [nctIn, setNctIn] = useState('');
  const [trial, setTrial] = useState<{
    nct: string;
    sponsor: string;
    phase: string;
    ta: string;
    start_y: number | null;
  } | null>(null);
  const [trialOffs, setTrialOffs] = useState<{ name: string; role: string; aff: string }[]>([]);
  const [trialLinked, setTrialLinked] = useState<
    { name: string; site: string; country: string; tier: string }[]
  >([]);
  const [searched, setSearched] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<string | null>(null);
  const [sponsorTrials, setSponsorTrials] = useState<
    { nct: string; phase: string; ta: string; start_y: number | null }[]
  >([]);
  const lookupSeq = useRef(0);

  const lookupTrial = async (e?: React.FormEvent, overrideNct?: string) => {
    e?.preventDefault();
    const nct = (overrideNct ?? nctIn).trim().toUpperCase();
    if (overrideNct !== undefined) setNctIn(nct);
    if (!nct) return;
    const seq = ++lookupSeq.current;
    const id = escapeLiteral(nct);
    try {
      const [tr, of, lk] = await Promise.all([
        query<{ nct: string; sponsor: string; phase: string; ta: string; start_y: number | null }>(
          `SELECT CAST(nct AS VARCHAR) AS nct, CAST(sponsor_disp AS VARCHAR) AS sponsor,` +
            ` CAST(phase AS VARCHAR) AS phase, CAST(ta AS VARCHAR) AS ta,` +
            ` CAST(start_y AS INTEGER) AS start_y FROM ctgov_trials WHERE nct = '${id}'`,
        ),
        query<{ name: string; role: string; aff: string }>(
          `SELECT CAST(name_raw AS VARCHAR) AS name, CAST(role AS VARCHAR) AS role,` +
            ` CAST(affiliation AS VARCHAR) AS aff FROM ctgov_officials WHERE nct = '${id}'`,
        ),
        query<{ name: string; site: string; country: string; tier: string }>(
          `SELECT CAST(p.display_name AS VARCHAR) AS name, CAST(p.site AS VARCHAR) AS site,` +
            ` CAST(p.country AS VARCHAR) AS country, CAST(l.tier AS VARCHAR) AS tier` +
            ` FROM person_ctgov_link l JOIN person_index p ON p.person_id = l.person_id` +
            ` WHERE l.nct = '${id}' ORDER BY 1`,
        ).catch(() => []),
      ]);
      if (seq !== lookupSeq.current) return;
      setTrial(tr[0] ?? null);
      setTrialOffs(of);
      setTrialLinked(lk);
      setSearched(true);
    } catch (e2) {
      if (seq !== lookupSeq.current) return;
      setNote(`Trial lookup failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  };

  useEffect(() => {
    if (!jumpTrial || !ready || demo) return;
    void lookupTrial(undefined, jumpTrial.nct);
    const t = setTimeout(() => {
      document.getElementById('trial-lookup')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTrial?.seq, ready, demo]);

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
          const lo = b[0].lo;
          const hi = b[0].hi;
          setBounds({ lo, hi });
          const [init0, init1] = clampYearPair(
            intIn(hashInit['tr.y0'], lo, hi, lo),
            intIn(hashInit['tr.y1'], lo, hi, hi),
            lo,
            hi,
          );
          setY0(init0);
          setY1(init1);
          return;
        }
        const yr = `start_y BETWEEN ${y0} AND ${y1}`;
        const [k, sp, ph, ta, ko, cv, yy, pt, au] = await Promise.all([
          query<{ trials: number; withOff: number; sponsors: number; linked: number; conc: number }>(
            `SELECT (SELECT COUNT(*) FROM ctgov_trials WHERE ${yr}) AS trials,` +
              ` (SELECT COUNT(DISTINCT o.nct) FROM ctgov_officials o` +
              ` JOIN ctgov_trials t ON t.nct = o.nct WHERE t.${yr}) AS withOff,` +
              ` (SELECT COUNT(DISTINCT sponsor) FROM ctgov_trials WHERE ${yr}) AS sponsors,` +
              ` (SELECT COUNT(DISTINCT l.person_id) FROM person_ctgov_link l` +
              ` JOIN ctgov_trials t ON t.nct = l.nct WHERE t.${yr}) AS linked,` +
              ` (SELECT CAST(SUM(CASE WHEN rn <= 10 THEN n ELSE 0 END) AS DOUBLE) / NULLIF(SUM(n), 0)` +
              ` FROM (SELECT COUNT(*) AS n, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn` +
              ` FROM ctgov_trials WHERE ${yr} GROUP BY sponsor, sponsor_disp)) AS conc`,
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
              ` GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT 100`,
          ),
          query<CoverRow>(
            `SELECT CAST(p.band AS VARCHAR) AS band, CAST(COUNT(*) AS INTEGER) AS n,` +
              ` CAST(COUNT(DISTINCT l.person_id) AS INTEGER) AS lk FROM person_index p` +
              ` LEFT JOIN (SELECT DISTINCT l2.person_id FROM person_ctgov_link l2` +
              ` JOIN ctgov_trials t ON t.nct = l2.nct WHERE t.${yr}) l` +
              ` ON l.person_id = p.person_id GROUP BY 1 ORDER BY 2 DESC`,
          ),
          query<{ y: number; n: number }>(
            `SELECT CAST(start_y AS INTEGER) AS y, CAST(COUNT(*) AS DOUBLE) AS n` +
              ` FROM ctgov_trials WHERE ${yr} GROUP BY 1 ORDER BY 1`,
          ),
          query<{ y: number; p: string; n: number }>(
            `SELECT CAST(start_y AS INTEGER) AS y, CAST(phase AS VARCHAR) AS p,` +
              ` CAST(COUNT(*) AS DOUBLE) AS n FROM ctgov_trials WHERE ${yr}` +
              ` GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
          query<{ tier: string; nl: number; np: number; sc: number; mo: number; ot: number; ol: number }>(
            `SELECT CAST(tier AS VARCHAR) AS tier, CAST(n_links AS INTEGER) AS nl,` +
              ` CAST(n_persons AS INTEGER) AS np, CAST(single_cand_share AS DOUBLE) AS sc,` +
              ` CAST(mean_overlap AS DOUBLE) AS mo, CAST(officials_total AS INTEGER) AS ot,` +
              ` CAST(officials_linked AS INTEGER) AS ol FROM link_audit_summary ORDER BY 1`,
          ).catch(() => []),
        ]);
        if (cancelled) return;
        setKpi({
          trials: num0(k[0]?.trials),
          withOff: num0(k[0]?.withOff),
          sponsors: num0(k[0]?.sponsors),
          linked: num0(k[0]?.linked),
          conc: num0(k[0]?.conc),
        });
        setSponsors(sp.map((r) => ({ category: r.category, v: num0(r.v) })));
        setPhases(ph.map((r) => ({ category: r.category, v: num0(r.v) })));
        setTas(ta.map((r) => ({ category: r.category, v: num0(r.v) })));
        setKols(ko);
        setCover(cv);
        setAudit(au);
        setTriYoy(yy.map((r) => ({ d: String(r.y), v: num0(r.n) })));
        setPhaseTrend(
          PHASE_ORDER.filter((p) => pt.some((r) => r.p === p)).map((p, i) => ({
            label: p,
            color: PHASE_COLORS[i % PHASE_COLORS.length],
            points: pt.filter((r) => r.p === p).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`Trials query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, y0, y1, hashInit]);

  useEffect(() => {
    if (y0 !== null && y1 !== null) {
      writeHash({ 'tr.y0': String(y0), 'tr.y1': String(y1) });
    }
  }, [y0, y1]);

  useEffect(() => {
    if (!ready || demo || !selectedSponsor || y0 === null || y1 === null) {
      setSponsorTrials([]);
      return;
    }
    let cancelled = false;
    query<{ nct: string; phase: string; ta: string; start_y: number | null }>(
      `SELECT CAST(nct AS VARCHAR) AS nct, CAST(phase AS VARCHAR) AS phase,` +
        ` CAST(ta AS VARCHAR) AS ta, CAST(start_y AS INTEGER) AS start_y` +
        ` FROM ctgov_trials WHERE sponsor_disp = '${escapeLiteral(selectedSponsor)}'` +
        ` AND start_y BETWEEN ${y0} AND ${y1} ORDER BY start_y DESC NULLS LAST, nct LIMIT 50`,
    )
      .then((rows) => {
        if (!cancelled) setSponsorTrials(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, demo, selectedSponsor, y0, y1]);

  const kolColumns = useMemo<ColumnDef<KolRow>[]>(
    () => [
      {
        key: 'name',
        label: 'Investigator',
        sortValue: (r) => r.name,
        csvValue: (r) => r.name,
        render: (r) => <strong>{r.name}</strong>,
      },
      {
        key: 'country',
        label: 'Country',
        sortValue: (r) => r.country,
        csvValue: (r) => r.country,
        render: (r) => r.country,
      },
      {
        key: 'n',
        label: 'CT.gov trials',
        align: 'right',
        sortValue: (r) => r.n,
        csvValue: (r) => r.n,
        render: (r) => fmtInt.format(r.n),
      },
      {
        key: 'sponsors',
        label: 'Sponsors',
        align: 'right',
        sortValue: (r) => r.sponsors,
        csvValue: (r) => r.sponsors,
        render: (r) => r.sponsors,
      },
    ],
    [],
  );

  if (demo) return <p className="muted">Run the pipeline for trials data.</p>;

  const yearOpts = bounds ? yearRange(bounds.lo, bounds.hi) : [];

  return (
    <>
      {note && <p className="banner">{note}</p>}
      <section className="panel">
        <p className="prose">
          <strong>About this data:</strong> US industry-led interventional trials from the
          clinicaltrials.gov API, with overall officials (usually study-level directors/chairs —
          median 1 per trial, though some trials list site PIs), lead sponsors, phases, and keyword
          therapeutic areas. Person links match officials to BMIS investigators by name +
          affiliation; see Definitions. Trials with unknown start year are excluded when filtering.
        </p>
        <div className="filters">
          <label>
            From
            <select
              value={y0 ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                setY0(v);
                if (y1 !== null && v > y1) setY1(v);
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
              value={y1 ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                setY1(v);
                if (y0 !== null && v < y0) setY0(v);
              }}
            >
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="kpis five">
        <div className="kpi">
          <span className="kpi-label">US industry trials</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.trials) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Top-10 sponsor share</span>
          <span className="kpi-value">{kpi ? `${(100 * kpi.conc).toFixed(1)}%` : '—'}</span>
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

      <section className="panel">
        <div className="panel-head">
          <h2>Trials by start year</h2>
          {!!triYoy.length && (
            <button
              className="btn"
              onClick={() => trendCsv(`trials-by-start-year-${y0}-${y1}.csv`, triYoy)}
            >
              CSV
            </button>
          )}
        </div>
        <TrendChart data={triYoy} label="US industry trial starts per year" />
        <p className="caption">
          Industry trial starts per year in range (CT.gov Start Date; unknown-start trials
          excluded).
        </p>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Top sponsors by US trials</h2>
          <CategoryBars
            data={sponsors}
            activeCategory={selectedSponsor ?? undefined}
            onSelect={(sp) => setSelectedSponsor((cur) => (cur === sp ? null : sp))}
          />
          <p className="caption">
            Exact per-trial lead sponsor; name variants merged by key. Click any sponsor bar to
            inspect its recent US trials below.
          </p>
        </div>
        <div className="panel">
          <h2>Trials by phase</h2>
          <CategoryBars
            data={phases}
            onSelect={
              onLaunchFeasibility
                ? (p) =>
                    p !== 'NA' &&
                    onLaunchFeasibility({
                      mode: 'sites',
                      phase: p,
                      band: 'United States',
                      minYear: 2023,
                    })
                : undefined
            }
          />
          <p className="caption">
            NA = no phase listed; combos (e.g. P2+P3) kept whole. Click any phase bar to find US
            sites in Feasibility.
          </p>
        </div>
      </section>

      {selectedSponsor && (
        <section className="panel dossier-panel">
          <div className="panel-head">
            <h2>
              Sponsor Drill-Down: {selectedSponsor}{' '}
              <span className="muted">· latest 50 US trials ({y0}–{y1})</span>
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedSponsor(null)}
            >
              Close
            </button>
          </div>
          {sponsorTrials.length ? (
            <div className="table-scroll short">
              <table>
                <thead>
                  <tr>
                    <th>Trial (click to inspect)</th>
                    <th>Phase</th>
                    <th>Therapeutic Area</th>
                    <th className="num">Start Year</th>
                  </tr>
                </thead>
                <tbody>
                  {sponsorTrials.map((r) => (
                    <tr
                      key={r.nct}
                      className="pickable"
                      onClick={() => {
                        void lookupTrial(undefined, r.nct);
                        document.getElementById('trial-lookup')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <td>
                        <strong>{r.nct}</strong>
                      </td>
                      <td>{r.phase}</td>
                      <td>{r.ta ? r.ta.replace(/;/g, ', ') : '—'}</td>
                      <td className="num">{r.start_y ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No trials found for this sponsor in range.</p>
          )}
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Phase mix over time</h2>
          {!!phaseTrend.length && (
            <button
              className="btn"
              onClick={() => stackedCsv(`phase-mix-${y0}-${y1}.csv`, phaseTrend)}
            >
              CSV
            </button>
          )}
        </div>
        <StackedMultiBars series={phaseTrend} allTicks />
        <p className="caption">
          Trial starts per year by phase in range. Toggle 100% for yearly share. NA growth reflects
          missing phase data, not a real mix shift.
        </p>
      </section>

      <section className="panel">
        <h2>Trials by therapeutic area</h2>
        <CategoryBars
          data={tas}
          onSelect={
            onLaunchFeasibility
              ? (selectedTa) =>
                  onLaunchFeasibility({
                    mode: 'sites',
                    ta: selectedTa,
                    band: 'United States',
                    minYear: 2023,
                  })
              : undefined
          }
        />
        <p className="caption">
          Keyword classification of CT.gov conditions text; multi-area trials count once per area.
          Click any therapeutic area bar to screen active US sites in Feasibility.
        </p>
      </section>

      <section className="panel" id="trial-lookup">
        <h2>Trial lookup by NCT number</h2>
        <form className="filters" onSubmit={(e) => void lookupTrial(e)}>
          <label>
            NCT
            <input
              type="search"
              value={nctIn}
              onChange={(e) => setNctIn(e.target.value)}
              placeholder="e.g. NCT01188928"
            />
          </label>
          <button type="submit" className="btn">
            Look up
          </button>
        </form>
        {searched &&
          (trial ? (
            <>
              <p>
                <strong>{trial.nct}</strong> · {trial.sponsor} · {trial.phase}
                {trial.ta ? ` · ${trial.ta.replace(/;/g, ', ')}` : ''} · started{' '}
                {trial.start_y ?? 'unknown'} ·{' '}
                <a
                  href={`https://clinicaltrials.gov/study/${trial.nct}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  CT.gov record
                </a>
              </p>
              {!!trialOffs.length && (
                <>
                  <h3>Study officials</h3>
                  <div className="table-scroll short">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Role</th>
                          <th>Affiliation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialOffs.map((r, i) => (
                          <tr key={`${r.name}-${i}`}>
                            <td>{r.name}</td>
                            <td>{r.role.replace(/_/g, ' ').toLowerCase()}</td>
                            <td>{r.aff}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <h3>Linked BMIS investigators</h3>
              {trialLinked.length ? (
                <div className="table-scroll short">
                  <table>
                    <thead>
                      <tr>
                        <th>Investigator</th>
                        <th>Site</th>
                        <th>Country</th>
                        <th>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trialLinked.map((r, i) => (
                        <tr
                          key={`${r.name}-${i}`}
                          className="pickable"
                          title="Search in FDA Investigators"
                          onClick={() => onJump(r.name)}
                        >
                          <td>{r.name}</td>
                          <td>{r.site}</td>
                          <td>{r.country}</td>
                          <td>{r.tier}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No BMIS investigators linked to this trial.</p>
              )}
            </>
          ) : (
            <p className="muted">
              {nctIn.trim().toUpperCase()} is not a US industry trial in this file.
            </p>
          ))}
        <p className="caption">
          Exact NCT match against the 53,543-trial subset. Officials are study-level; investigator
          links carry the usual tier caveats.
        </p>
      </section>

      <section className="panel">
        <h2>Most-linked investigators (study officials, top 100)</h2>
        <DataTable
          rows={kols}
          columns={kolColumns}
          rowKey={(r) => `${r.name}-${r.country}`}
          defaultSort={{ key: 'n', dir: -1 }}
          filterPlaceholder="Filter officials by name or country…"
          filterText={(r) => `${r.name} ${r.country}`}
          onRowClick={(r) => onJump(r.name)}
          rowTitle={() => 'Search in FDA Investigators'}
          csvFilename={`kol-board-${y0}-${y1}.csv`}
          pageSize={25}
        />
        <p className="caption">
          BMIS persons by linked CT.gov trials in range (strong + weak tiers). Skews toward study
          chairs and KOLs — most trials name only study-level officials, so most investigators cannot
          appear here. Click a row to search that name in FDA Investigators.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Linkage coverage by geography</h2>
          {!!cover.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  `linkage-coverage-${y0}-${y1}.csv`,
                  ['band', 'persons', 'linked'],
                  cover.map((r) => [r.band, r.n, r.lk]),
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
                <th>Band</th>
                <th className="num">BMIS persons</th>
                <th className="num">Linked</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {cover.map((r) => (
                <tr key={r.band}>
                  <td>{r.band}</td>
                  <td className="num">{fmtInt.format(r.n)}</td>
                  <td className="num">{fmtInt.format(r.lk)}</td>
                  <td className="num">{r.n > 0 ? `${((r.lk / r.n) * 100).toFixed(1)}%` : '—'}</td>
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

      {!!audit.length && (
        <section className="panel">
          <h2>Linkage audit by tier (experimental)</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th className="num">Links</th>
                  <th className="num">Persons</th>
                  <th className="num">Single-candidate</th>
                  <th className="num">Mean overlap</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((r) => (
                  <tr key={r.tier}>
                    <td>{r.tier}</td>
                    <td className="num">{fmtInt.format(r.nl)}</td>
                    <td className="num">{fmtInt.format(r.np)}</td>
                    <td className="num">{`${(r.sc * 100).toFixed(1)}%`}</td>
                    <td className="num">{r.mo.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="caption">
            {fmtInt.format(audit[0].ol)} of {fmtInt.format(audit[0].ot)} officials (
            {((audit[0].ol / audit[0].ot) * 100).toFixed(1)}%) link to ≥1 BMIS person. Eyeball audit
            of 21 sampled links: strong ≈80% plausible-correct, weak ≈60% (see
            docs/linkage_audit.md). Weak links may be name collisions.
          </p>
        </section>
      )}
    </>
  );
}
