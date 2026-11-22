import { useEffect, useState } from 'react';
import { query } from './duckdb';
import type { Manifest } from './duckdb';
import { MultiLineChart, StackedMultiBars } from './charts';
import type { LineSeries } from './charts';
import { BANDS, BAND_COLORS, CONTEXT_LINKS, LATEST_FULL } from './lib/constants';
import type { TabId } from './lib/constants';
import { fmtInt, growthPct, num, num0 } from './lib/format';
import { IconArrowRight, IconExternal, IconInfo } from './components/Icons';

export interface FeasibilityPreset {
  mode: 'sites' | 'pis';
  ta?: string;
  phase?: string;
  band?: string;
  state?: string;
  minYear?: number;
  minInv?: number;
  minRefs?: number;
  linkMode?: 'all' | 'any' | 'strong';
}

export default function OverviewTab({
  ready,
  demo,
  manifest,
  onNavigateTab,
  onLaunchFeasibility,
  onJumpDefinition,
}: {
  ready: boolean;
  demo: boolean;
  manifest: Manifest | null;
  onNavigateTab: (tab: TabId, section?: string) => void;
  onLaunchFeasibility: (preset: FeasibilityPreset) => void;
  onJumpDefinition: (term: string) => void;
}) {
  const [geo, setGeo] = useState<LineSeries[]>([]);
  const [tight, setTight] = useState<LineSeries[]>([]);
  const [whoTotal, setWhoTotal] = useState<number | null>(null);
  const [sitesActive, setSitesActive] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [g, tser, wg, sa] = await Promise.all([
          query<{ y: number; band: string; n: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(band AS VARCHAR) AS band,` +
              ` CAST(SUM(n_active) AS DOUBLE) AS n FROM investigators_year_geo` +
              ` WHERE version = 'strict' AND year BETWEEN 2008 AND 2026` +
              ` GROUP BY 1, 2 ORDER BY 1, 2`,
          ),
          demo
            ? Promise.resolve([])
            : query<{ y: number; pr: number | null; ps: number | null }>(
                `SELECT CAST(year AS INTEGER) AS y, CAST(per_running AS DOUBLE) AS pr,` +
                  ` CAST(per_start AS DOUBLE) AS ps FROM tightness` +
                  ` WHERE version = 'strict' AND scope = 'adjusted' AND year BETWEEN 2009 AND 2025 ORDER BY 1`,
              ),
          demo
            ? Promise.resolve([])
            : query<{ trials: number }>(`SELECT CAST(trials AS DOUBLE) AS trials FROM who_global`).catch(
                () => [],
              ),
          demo
            ? Promise.resolve([])
            : query<{ n: number }>(
                `SELECT CAST(SUM(n_sites) AS DOUBLE) AS n FROM sites_year_geo` +
                  ` WHERE version = 'strict' AND year = ${LATEST_FULL}`,
              ).catch(() => []),
        ]);
        if (cancelled) return;
        setGeo(
          BANDS.map((b) => ({
            label: b,
            color: BAND_COLORS[b] ?? '#333',
            points: g.filter((r) => r.band === b).map((r) => ({ x: r.y, y: num0(r.n) })),
          })),
        );
        setTight(
          tser.length
            ? [
                {
                  label: 'Active investigators / running US trial',
                  color: '#d62728',
                  points: tser.map((r) => ({ x: r.y, y: num(r.pr) })),
                },
                {
                  label: 'Active investigators / started US trial',
                  color: '#1f77b4',
                  points: tser.map((r) => ({ x: r.y, y: num(r.ps) })),
                },
              ]
            : [],
        );
        setWhoTotal(wg[0]?.trials ? num0(wg[0].trials) : null);
        setSitesActive(sa[0]?.n ? num0(sa[0].n) : null);
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`Overview query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo]);

  const stats = (manifest?.stats ?? {}) as {
    persons_ever?: { strict?: number };
    active_2009_2025?: { strict?: [number, number] };
    us_active_2009_2025?: { strict?: [number, number] };
    strict_one_trial_share?: number;
    linkage?: { trials?: number; sponsors?: number; persons_linked?: number };
  };

  const global09 = stats.active_2009_2025?.strict?.[0];
  const global25 = stats.active_2009_2025?.strict?.[1];
  const us09 = stats.us_active_2009_2025?.strict?.[0];
  const us25 = stats.us_active_2009_2025?.strict?.[1];
  const globalGrowth = growthPct(global25, global09);
  const usGrowth = growthPct(us25, us09);

  return (
    <>
      {note && <p className="banner">{note}</p>}

      <section className="panel hero-brief">
        <div className="hero-grid">
          <div>
            <h2>Global Clinical Trial Investigator Supply &amp; Site Feasibility Intelligence</h2>
            <p className="prose">
              Evaluate longitudinal clinical investigator capacity, screen research centers by
              therapeutic area and trial phase, and benchmark FDA Form 1572 supply against
              industry trial demand from ClinicalTrials.gov, China CFDI, and WHO ICTRP — queried
              directly in your browser with DuckDB-WASM.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="btn"
                onClick={() => onLaunchFeasibility({ mode: 'sites', band: 'United States', minYear: 2023 })}
              >
                Open Feasibility Workbench
              </button>
              <a className="btn btn-ghost" href="data/exports/bmis-supply-deck.pdf" target="_blank" rel="noreferrer">
                Executive Slide Deck (PDF)
              </a>
            </div>
          </div>
          <div className="hero-callout">
            <div className="callout-title">
              <IconInfo className="icon" /> Scope &amp; Reading Guide
            </div>
            <ul className="compact-list">
              <li>
                <strong>Supply:</strong> FDA CDER BMIS (Form 1572/1571) — drugs &amp; biologics,
                2009–2025 headline window.{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onJumpDefinition('BMIS scope')}
                >
                  Definition
                </button>
              </li>
              <li>
                <strong>2021* EU break:</strong> Sharp EU BMIS drop reflects EU GCP restrictions on
                signing Form 1572, not proven attrition.{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onJumpDefinition('2021* EU 1572 note')}
                >
                  Why?
                </button>
              </li>
              <li>
                <strong>Feasibility linkages:</strong> CT.gov facility &amp; official cross-checks
                are experimental indicators — always verify site capacity directly.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="kpis five">
        <div className="kpi">
          <span className="kpi-label">Global investigators</span>
          <span className="kpi-value">{global25 ? fmtInt.format(global25) : '—'}</span>
          <span className="kpi-sub">
            {globalGrowth ? `${LATEST_FULL} · ${globalGrowth}% vs 2009` : 'Strict persons'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">US investigators</span>
          <span className="kpi-value">{us25 ? fmtInt.format(us25) : '—'}</span>
          <span className="kpi-sub">
            {usGrowth ? `${LATEST_FULL} · ${usGrowth}% vs 2009` : 'United States'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Active sites</span>
          <span className="kpi-value">{sitesActive ? fmtInt.format(sitesActive) : '—'}</span>
          <span className="kpi-sub">{LATEST_FULL} · strict addresses</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">US industry trials</span>
          <span className="kpi-value">
            {stats.linkage?.trials ? fmtInt.format(stats.linkage.trials) : '—'}
          </span>
          <span className="kpi-sub">
            {stats.linkage?.sponsors ? `${fmtInt.format(stats.linkage.sponsors)} lead sponsors` : 'CT.gov interventional'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Global trials (WHO)</span>
          <span className="kpi-value">{whoTotal ? fmtInt.format(whoTotal) : '—'}</span>
          <span className="kpi-sub">ICTRP deduplicated</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Clinical Trial Feasibility &amp; Exploration Pathways</h2>
          <span className="muted">Jump straight into a pre-configured analytical workflow</span>
        </div>
        <div className="pathway-grid">
          <button
            type="button"
            className="pathway-card"
            onClick={() =>
              onLaunchFeasibility({
                mode: 'sites',
                ta: 'Oncology',
                band: 'United States',
                minYear: 2023,
                minInv: 5,
              })
            }
          >
            <div className="pathway-head">
              <strong>Screen US Oncology Research Sites</strong>
              <IconArrowRight />
            </div>
            <p className="muted">
              Filter active US sites (≥2023) with ≥5 historical investigators and CT.gov oncology
              trial activity; compare phases and shortlist candidates.
            </p>
          </button>

          <button
            type="button"
            className="pathway-card"
            onClick={() =>
              onLaunchFeasibility({
                mode: 'pis',
                band: 'United States',
                minYear: 2023,
                minRefs: 15,
              })
            }
          >
            <div className="pathway-head">
              <strong>Find Active Investigators</strong>
              <IconArrowRight />
            </div>
            <p className="muted">
              Locate repeat, high-volume US investigators (≥15 IND references, active ≥2023),
              inspect site affiliations, and review linked CT.gov studies.
            </p>
          </button>

          <button
            type="button"
            className="pathway-card"
            onClick={() =>
              onLaunchFeasibility({
                mode: 'sites',
                ta: 'Cardiology',
                phase: 'P3',
                band: 'United States',
                minYear: 2023,
              })
            }
          >
            <div className="pathway-head">
              <strong>Phase 3 Cardiology Site Feasibility</strong>
              <IconArrowRight />
            </div>
            <p className="muted">
              Combine Therapeutic Area + Phase 3 CT.gov cross-checks with recent BMIS filings to
              build an exportable shortlist of candidate centers.
            </p>
          </button>

          <button
            type="button"
            className="pathway-card"
            onClick={() => onNavigateTab('inv', 'eu-break')}
          >
            <div className="pathway-head">
              <strong>Inspect the 2021* EU Form 1572 Break</strong>
              <IconArrowRight />
            </div>
            <p className="muted">
              Review pre-registered OLS pre-trend extrapolations, 2016/2017 placebos, and why EU
              BMIS filings dropped ~62% after Form 1572 restrictions.
            </p>
          </button>

          <button
            type="button"
            className="pathway-card"
            onClick={() => onNavigateTab('trials')}
          >
            <div className="pathway-head">
              <strong>Benchmark Sponsor &amp; Phase Demand</strong>
              <IconArrowRight />
            </div>
            <p className="muted">
              Analyze 53.5k US industry trials across 7,940 sponsors, phase mix shifts, therapeutic
              area distribution, and NCT-level official lookups.
            </p>
          </button>

          <button
            type="button"
            className="pathway-card"
            onClick={() => onNavigateTab('who')}
          >
            <div className="pathway-head">
              <strong>Compare Global Country Footprints</strong>
              <IconArrowRight />
            </div>
            <p className="muted">
              Contrast FDA BMIS supply with WHO ICTRP global trial counts (1.18M studies across 199
              countries) and China CFDI institution filings.
            </p>
          </button>
        </div>
      </section>

      <section className="panels">
        <div className="panel">
          <div className="panel-head">
            <h2>Active investigators per year by geography</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigateTab('inv')}>
              Full Investigators tab →
            </button>
          </div>
          <StackedMultiBars series={geo} marks={{ 2021: '*' }} />
          <p className="caption">
            Strict persons with ≥1 BMIS receipt/year. US active supply rose +27.8% (2009→2025) while
            reported ex-US supply dropped after the 2021* EU Form 1572 restriction. Toggle 100% or
            Table view above.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>US supply tightness (investigators per trial)</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigateTab('inv', 'tightness')}
            >
              Scope &amp; workload →
            </button>
          </div>
          {demo ? (
            <p className="muted">Run the pipeline for tightness data.</p>
          ) : (
            <>
              <MultiLineChart series={tight} />
              <p className="caption">
                Adjusted US scope: active US investigators divided by running and started US
                industry trials. Tightness fell from ~3.3 (2009) to ~2.5 (2025) active CIs per
                running trial.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Key Empirical Takeaways for Trial Planning</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigateTab('about')}>
            Methods &amp; Caveats →
          </button>
        </div>
        <div className="takeaway-grid">
          <div className="takeaway-item">
            <h3>High one-and-done attrition</h3>
            <p className="muted">
              49.3% of all strict investigators (43% US vs. 54–67% ex-US) appear on only one IND
              reference. Five-year cohort retention has declined from 13.6% (2009 vintage) to ~9%
              (2016–2020 vintages), and ~85% of 5-year actives are re-entrants after gaps.
            </p>
            <button
              type="button"
              className="link-btn"
              onClick={() => onNavigateTab('inv', 'retention')}
            >
              Inspect vintage attrition &amp; re-entry →
            </button>
          </div>
          <div className="takeaway-item">
            <h3>Work concentrating into larger centers</h3>
            <p className="muted">
              References per active investigator rose 1.38 → 1.73 and investigators per active site
              rose 1.38 → 1.85 (2009→2025). Top-10% investigator receipt share climbed 27% → 32%,
              and sites outlive individual investigators in retention.
            </p>
            <button type="button" className="link-btn" onClick={() => onNavigateTab('site')}>
              Explore site size mix &amp; churn →
            </button>
          </div>
          <div className="takeaway-item">
            <h3>CRO &amp; IRB consolidation</h3>
            <p className="muted">
              951 CROs and 3,779 IRBs were active in 2025, led globally by PPD, IQVIA, and Syneos on
              the CRO side and WCG, Advarra, and Copernicus among central IRBs — useful context for
              vendor and central-IRB strategy.
            </p>
            <div className="inline-links">
              <button type="button" className="link-btn" onClick={() => onNavigateTab('cro')}>
                FDA CROs →
              </button>
              <button type="button" className="link-btn" onClick={() => onNavigateTab('irb')}>
                FDA IRBs →
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Authoritative Sources, Regulatory Context &amp; Documentation</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigateTab('about')}>
            All resources &amp; playbook →
          </button>
        </div>
        <div className="resource-grid">
          {CONTEXT_LINKS.slice(0, 6).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="resource-card"
            >
              <div className="resource-head">
                <strong>{link.title}</strong>
                <IconExternal className="icon" />
              </div>
              <span className="resource-cat">{link.category}</span>
              <p className="muted">{link.description}</p>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
