import { CONTEXT_LINKS } from './lib/constants';
import type { TabId } from './lib/constants';
import { fmtInt, num } from './lib/format';
import { IconExternal } from './components/Icons';
import type { FeasibilityPreset } from './OverviewTab';

export default function About({
  stats,
  onNavigateTab,
  onLaunchFeasibility,
}: {
  stats?: Record<string, unknown>;
  onNavigateTab?: (tab: TabId, section?: string) => void;
  onLaunchFeasibility?: (preset: FeasibilityPreset) => void;
}) {
  const lk = ((stats ?? {}).linkage ?? {}) as Record<string, unknown>;
  const linked = num(lk.persons_linked);
  const ever = num(((stats ?? {}).persons_ever as Record<string, unknown> | undefined)?.strict);

  const groupedLinks = [
    'Regulatory & Primary Sources',
    'EU 1572 Policy Context',
    'Methodology & Exports',
  ] as const;

  return (
    <>
      <section className="panel">
        <h2>About this explorer</h2>
        <p className="prose">
          How has the supply of clinical trial investigators trended over time, how does it compare
          against industry trial demand, and which research centers and investigators show durable
          activity in specific therapeutic areas? This application pairs the FDA&apos;s Form 1572
          investigator registry (BMIS) with trial demand from ClinicalTrials.gov, China&apos;s CFDI
          institution filing system, and WHO ICTRP global counts — running entirely in your browser
          via DuckDB-WASM.
        </p>

        <h3>Clinical Trial Feasibility Playbook</h3>
        <div className="takeaway-grid">
          <div className="takeaway-item">
            <h4>1. Screen &amp; Shortlist Sites</h4>
            <p className="muted">
              Start in the Feasibility Workbench to filter 137k+ street-address sites by US state,
              therapeutic area, trial phase, team size, and recency (active ≥2023/2025). Bookmark
              candidate centers and export a CSV or Markdown feasibility brief.
            </p>
            {onLaunchFeasibility && (
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  onLaunchFeasibility({ mode: 'sites', band: 'United States', minYear: 2023 })
                }
              >
                Launch Site Feasibility Finder →
              </button>
            )}
          </div>
          <div className="takeaway-item">
            <h4>2. Vet Investigators &amp; Site Stability</h4>
            <p className="muted">
              Open any site dossier to check year-by-year investigator roster counts, join/exit
              churn, and linked CT.gov studies. Pair BMIS IND reference volume with recency to avoid
              inactive or one-and-done profiles.
            </p>
            {onLaunchFeasibility && (
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  onLaunchFeasibility({
                    mode: 'pis',
                    band: 'United States',
                    minYear: 2023,
                    minRefs: 10,
                  })
                }
              >
                Launch Investigator Finder →
              </button>
            )}
          </div>
          <div className="takeaway-item">
            <h4>3. Contextualize Country &amp; Vendor Strategy</h4>
            <p className="muted">
              Account for the 2021* EU Form 1572 reporting break when comparing US vs. EU BMIS
              counts, cross-check global volume in WHO ICTRP and China CFDI, and inspect CRO/IRB
              geographic footprints.
            </p>
            {onNavigateTab && (
              <button
                type="button"
                className="link-btn"
                onClick={() => onNavigateTab('inv', 'eu-break')}
              >
                Review 2021* EU Break Study →
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Data sources, methods &amp; limitations</h2>
        <h3>How to read the metrics</h3>
        <ul className="about-list">
          <li>
            <strong>Persons, not rows:</strong> BMIS Reviewer IDs are one-per-site-record, so rows
            are clustered into name+site persons. <strong>Strict</strong> (exact match) is the
            headline; <strong>Merged</strong> unions multi-site investigators;{' '}
            <strong>Raw</strong> counts Reviewer IDs as a naive upper bound.
          </li>
          <li>
            <strong>Active in year</strong> means ≥1 receipt that year; <strong>new</strong> means
            first receipt ever (2008–09 inflated: the file starts Oct 2008). Headline window is
            2009–2025; 2026 is partial through August 31.
          </li>
          <li>
            <strong>Trials per person</strong> counts IND references per cluster — a proxy, not
            confirmed distinct trials. <strong>Trials/year</strong> divides that by the inclusive
            first–last span.
          </li>
          <li>
            <strong>FDA Sites tab &amp; Feasibility Workbench</strong> roll rows up to street
            addresses (Strict exact, Merged fuzzy-unioned) and join US institutions to CT.gov
            facilities by institution×city (experimental — shared across sibling addresses of one
            institution).
          </li>
          <li>
            <strong>CT.gov person linkage (experimental):</strong>{' '}
            {linked !== null && ever ? (
              <>
                covers {fmtInt.format(linked)} of {fmtInt.format(ever)} strict persons (
                {((linked / ever) * 100).toFixed(1)}%): most trials name only study-level officials,
                so linked investigators skew toward study chairs and KOLs (audited precision ≈80%
                strong, ≈60% weak).
              </>
            ) : (
              <>
                covers ~4.8% of strict persons: most trials name only study-level officials, so
                linked investigators skew toward study chairs and KOLs.
              </>
            )}
          </li>
          <li>
            <strong>WHO ICTRP &amp; China CFDI:</strong> WHO ICTRP provides aggregate deduplicated
            trial counts across primary registries (multi-country trials repeat per country — never
            sum countries). China CFDI is a partial 2026-11-06 snapshot where filing year is
            institution registration vintage (2019–2020 bulk wave), not activity.
          </li>
        </ul>

        <h3>Key limitations</h3>
        <ul className="about-list">
          <li>
            BMIS covers CDER IND drugs/biologics only, and FDA notes it is not comprehensive (Form
            1572 goes to sponsors; forwarding to FDA is voluntary-ish). No devices, CBER, or non-IND
            studies.
          </li>
          <li>
            BMIS carries date and site only (no therapeutic area, phase, or NCT ID); TA and phase
            breakdowns come exclusively from matched CT.gov trials and inherit all linkage caveats.
          </li>
          <li>
            ~7,300 CI rows (0.7%) lack usable names: kept in headline counts, excluded from search,
            leaderboards, rosters, and site-detail series.
          </li>
          <li>
            Always verify site enrollment capacity, active protocols, and PI availability directly
            before study startup.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Authoritative Context, Regulatory Links &amp; Methodology Docs</h2>
        {groupedLinks.map((cat) => (
          <div key={cat} className="resource-section">
            <h3>{cat}</h3>
            <div className="resource-grid">
              {CONTEXT_LINKS.filter((l) => l.category === cat).map((link) => (
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
                  <p className="muted">{link.description}</p>
                </a>
              ))}
            </div>
          </div>
        ))}

        <h3>Executive Slide Deck &amp; Reproducibility</h3>
        <p className="prose">
          Download the pre-built slide deck (same charts and figures, caveated on every slide):{' '}
          <a href="data/exports/bmis-supply-deck.pptx">PowerPoint (PPTX)</a> ·{' '}
          <a href="data/exports/bmis-supply-deck.pdf" target="_blank" rel="noreferrer">
            PDF
          </a>
          . Full open-source pipeline and tests:{' '}
          <a href="https://github.com/henryweimd/bmis1572" target="_blank" rel="noreferrer">
            github.com/henryweimd/bmis1572
          </a>
          . Rebuild locally with <code>uv run python pipeline/build.py</code>.
        </p>
      </section>
    </>
  );
}
