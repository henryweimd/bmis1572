import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createViews, loadManifest } from './duckdb';
import type { Manifest } from './duckdb';
import DefinitionsPanel from './DefinitionsPanel';
import CommandPalette from './components/CommandPalette';
import ShortlistDrawer from './components/ShortlistDrawer';
import { BrandMark, IconBookmark, IconLink, IconSearch } from './components/Icons';
import { pick, readHash, writeHash } from './hash';
import {
  BANDS,
  LATEST_FULL,
  NAV_GROUPS,
  TABS,
  TAB_LABEL,
  TAB_SUBTITLE,
  YEAR_MAX,
  YEAR_MIN,
} from './lib/constants';
import type { TabId } from './lib/constants';
import { ShortlistProvider, useShortlist } from './lib/shortlist';
import type { FeasibilityPreset } from './OverviewTab';
import './App.css';

const OverviewTab = lazy(() => import('./OverviewTab'));
const FeasibilityTab = lazy(() => import('./FeasibilityTab'));
const InvestigatorsTab = lazy(() => import('./InvestigatorsTab'));
const OrgTab = lazy(() => import('./OrgTab'));
const SiteTab = lazy(() => import('./SiteTab'));
const TrialsTab = lazy(() => import('./TrialsTab'));
const ChinaTab = lazy(() => import('./ChinaTab'));
const WHOTab = lazy(() => import('./WHOTab'));
const About = lazy(() => import('./About'));

type Status = 'loading' | 'ready' | 'error';

function TabSkeleton() {
  return (
    <div className="skeleton-stack" aria-busy="true" aria-label="Loading view">
      <div className="kpis four">
        <div className="kpi skeleton-box" />
        <div className="kpi skeleton-box" />
        <div className="kpi skeleton-box" />
        <div className="kpi skeleton-box" />
      </div>
      <div className="panel skeleton-chart" />
    </div>
  );
}

function ExplorerShell() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [demo, setDemo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortlistOpen, setShortlistOpen] = useState(false);

  const [tab, setTab] = useState<TabId>(() => pick(readHash().t, TABS, 'overview'));
  const [jumpRequest, setJumpRequest] = useState<{ name: string; seq: number } | null>(null);
  const [invSectionReq, setInvSectionReq] = useState<{ section: string; seq: number } | null>(null);
  const [feasPreset, setFeasPreset] = useState<(FeasibilityPreset & { seq: number }) | null>(null);
  const [trialJump, setTrialJump] = useState<{ nct: string; seq: number } | null>(null);
  const [defFocus, setDefFocus] = useState<{ term: string; seq: number } | null>(null);
  const [siteJumpKey, setSiteJumpKey] = useState(0);
  const [orgJumpKey, setOrgJumpKey] = useState(0);

  const seqRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { totalCount } = useShortlist();

  const nextSeq = () => {
    seqRef.current += 1;
    return seqRef.current;
  };

  const scrollTopSafe = useCallback(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  const boot = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const { manifest: m, baseUrl } = await loadManifest();
      setManifest(m);
      setDemo(!m);
      await createViews(baseUrl, m);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    writeHash({ t: tab });
    document.title = `${TAB_LABEL[tab]} · Global Clinical Trial Investigator Talent Supply Data Explorer`;
    const activeBtn = tabRefs.current[TABS.indexOf(tab)];
    if (activeBtn && activeBtn.offsetParent !== null) {
      activeBtn.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    }
  }, [tab]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = pick(readHash().t, TABS, 'overview');
      setTab(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+K or '/' opens Command Palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (
        e.key === '/' &&
        !cmdOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cmdOpen]);

  const navigateTab = useCallback(
    (nextTab: TabId, section?: string) => {
      setTab(nextTab);
      if (nextTab === 'inv' && section) {
        setInvSectionReq({ section, seq: nextSeq() });
      }
      scrollTopSafe();
    },
    [scrollTopSafe],
  );

  const launchFeasibility = useCallback(
    (preset: FeasibilityPreset) => {
      setFeasPreset({ ...preset, seq: nextSeq() });
      setTab('feas');
      scrollTopSafe();
    },
    [scrollTopSafe],
  );

  const jumpInvestigator = useCallback((name: string) => {
    setJumpRequest({ name, seq: nextSeq() });
    setTab('inv');
  }, []);

  const jumpToSite = useCallback(
    (siteN: number, version: 'strict' | 'merged' = 'strict') => {
      writeHash({ t: 'site', 'site.v': version, 'site.s': `${version}:${siteN}` });
      setSiteJumpKey((k) => k + 1);
      setTab('site');
      scrollTopSafe();
    },
    [scrollTopSafe],
  );

  const jumpToTrial = useCallback(
    (nct: string) => {
      setTrialJump({ nct, seq: nextSeq() });
      setTab('trials');
      scrollTopSafe();
    },
    [scrollTopSafe],
  );

  const jumpToOrg = useCallback(
    (kind: 'cro' | 'irb', org: string) => {
      writeHash({ t: kind, [`${kind}.s`]: org });
      setOrgJumpKey((k) => k + 1);
      setTab(kind);
      scrollTopSafe();
    },
    [scrollTopSafe],
  );

  const jumpDefinition = useCallback((term: string) => {
    setDefFocus({ term, seq: nextSeq() });
  }, []);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked in insecure context */
    }
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.indexOf(tab);
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      setTab(TABS[nextIdx]);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  if (status === 'loading') {
    return (
      <div className="wrap">
        <header>
          <div>
            <h1>Global Clinical Trial Investigator Talent Supply Data Explorer</h1>
            <p className="muted">Initializing in-browser DuckDB-WASM query engine…</p>
          </div>
        </header>
        <TabSkeleton />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="wrap">
        <header>
          <h1>Global Clinical Trial Investigator Talent Supply Data Explorer</h1>
        </header>
        <section className="panel">
          <p className="error">Could not initialize DuckDB-WASM or load data: {error}</p>
          <p className="muted">
            Check network connectivity or run <code>uv run python pipeline/build.py</code> from the
            repo root to rebuild the snapshot.
          </p>
          <p>
            <button type="button" className="btn" onClick={() => void boot()}>
              Retry loading
            </button>
          </p>
        </section>
      </div>
    );
  }

  const defs = manifest?.definitions ?? {};
  const sources = (manifest?.sources ?? {}) as {
    bmis_file?: string;
    ctgov?: { meta?: { api_version?: { dataTimestamp?: string } } };
  };
  const ctgovTs = sources.ctgov?.meta?.api_version?.dataTimestamp?.slice(0, 10) ?? '—';
  const bandList = [...BANDS];

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Shareable explorer URL copied to clipboard.' : ''}
      </span>
      <header className="topbar">
        <div className="topbar-inner">
          <button
            type="button"
            className="brand-btn"
            onClick={() => navigateTab('overview')}
            title="Return to Executive Overview"
          >
            <BrandMark className="icon brand-icon" />
            <span className="brand-text">
              <strong>BMIS 1572 Explorer</strong>
              <span className="muted brand-sub">Clinical Trial Supply &amp; Feasibility</span>
            </span>
          </button>

          <button
            type="button"
            className="search-trigger"
            onClick={() => setCmdOpen(true)}
            aria-keyshortcuts="Meta+K Control+K /"
            title="Search sites, investigators, NCT trials, CROs, IRBs, or glossary (⌘K or /)"
          >
            <IconSearch className="icon" />
            <span className="search-trigger-text">Search sites, PIs, NCTs, CROs…</span>
            <kbd className="kbd">⌘K</kbd>
          </button>

          <div className="header-actions">
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShortlistOpen(true)}
              title="Open saved Feasibility Shortlist"
            >
              <IconBookmark filled={totalCount > 0} />
              <span>Shortlist</span>
              {totalCount > 0 && <span className="count-pill">{totalCount}</span>}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => void copyShareLink()}
              title="Copy shareable URL with current filters"
            >
              <IconLink />
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>
            <span className={demo ? 'badge demo' : 'badge'}>
              {demo ? 'Demo sample' : 'Full dataset'}
            </span>
          </div>
        </div>
      </header>

      <div className="wrap app-shell">
        <aside className="sidebar" aria-label="Workspace navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-current={tab === t ? 'page' : undefined}
                  className={`nav-item${tab === t ? ' active' : ''}`}
                  onClick={() => navigateTab(t)}
                >
                  <span>{TAB_LABEL[t]}</span>
                  {t === 'feas' && totalCount > 0 && (
                    <span className="count-pill">{totalCount}</span>
                  )}
                </button>
              ))}
            </div>
          ))}

          <div className="sidebar-footer">
            <div className="nav-group-label">Quick Exports &amp; Docs</div>
            <a href="data/exports/bmis-supply-deck.pdf" target="_blank" rel="noreferrer">
              Slide Deck (PDF)
            </a>
            <a href="data/exports/bmis-supply-deck.pptx">Slide Deck (PPTX)</a>
            <a
              href="https://www.fda.gov/drugs/drug-approvals-and-databases/bioresearch-monitoring-information-system-bmis"
              target="_blank"
              rel="noreferrer"
            >
              FDA BMIS Source
            </a>
            <a href="https://clinicaltrials.gov/" target="_blank" rel="noreferrer">
              ClinicalTrials.gov
            </a>
            <a href="https://github.com/henryweimd/bmis1572" target="_blank" rel="noreferrer">
              GitHub Repository
            </a>
          </div>
        </aside>

        <div className="workspace-main">
          <div className="tabs mobile-tabs" role="tablist" aria-label="Views" onKeyDown={onTabKeyDown}>
            {TABS.map((t, i) => (
              <button
                key={t}
                type="button"
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                aria-selected={tab === t}
                tabIndex={tab === t ? 0 : -1}
                className={tab === t ? 'active' : ''}
                onClick={() => navigateTab(t)}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          <main id="main-content" tabIndex={-1}>
            <div className="view-header">
              <div>
                <h1>{TAB_LABEL[tab]}</h1>
                <p className="muted">{TAB_SUBTITLE[tab]}</p>
              </div>
              {manifest && !demo && (
                <span className="muted view-meta">
                  Snapshot built {manifest.generated_at.slice(0, 10)} · CT.gov {ctgovTs}
                </span>
              )}
            </div>

            {demo && (
              <p className="banner">
                Showing the committed demo sample. Run <code>uv run python pipeline/build.py</code> to
                build and explore the full lake locally.
              </p>
            )}
            <Suspense fallback={<TabSkeleton />}>
              {tab === 'overview' && (
                <OverviewTab
                  ready={status === 'ready'}
                  demo={demo}
                  manifest={manifest}
                  onNavigateTab={navigateTab}
                  onLaunchFeasibility={launchFeasibility}
                  onJumpDefinition={jumpDefinition}
                />
              )}

              {tab === 'feas' && (
                <FeasibilityTab
                  ready={status === 'ready'}
                  demo={demo}
                  preset={feasPreset}
                  onJumpSite={jumpToSite}
                  onJumpInvestigator={jumpInvestigator}
                  onJumpDefinition={jumpDefinition}
                  onOpenShortlist={() => setShortlistOpen(true)}
                />
              )}

              {tab === 'inv' && (
                <InvestigatorsTab
                  ready={status === 'ready'}
                  demo={demo}
                  manifest={manifest}
                  jumpRequest={jumpRequest}
                  sectionRequest={invSectionReq}
                  onJumpSite={jumpToSite}
                  onLaunchFeasibility={launchFeasibility}
                  onJumpDefinition={jumpDefinition}
                />
              )}

              {tab === 'cro' && (
                <OrgTab
                  key={`cro-${orgJumpKey}`}
                  kind="cro"
                  bands={bandList}
                  yearMin={YEAR_MIN}
                  yearMax={YEAR_MAX}
                  latestFull={LATEST_FULL}
                  demo={demo}
                  ready={status === 'ready'}
                />
              )}

              {tab === 'irb' && (
                <OrgTab
                  key={`irb-${orgJumpKey}`}
                  kind="irb"
                  bands={bandList}
                  yearMin={YEAR_MIN}
                  yearMax={YEAR_MAX}
                  latestFull={LATEST_FULL}
                  demo={demo}
                  ready={status === 'ready'}
                />
              )}

              {tab === 'site' && (
                <SiteTab
                  key={`site-${siteJumpKey}`}
                  bands={bandList}
                  yearMin={YEAR_MIN}
                  yearMax={YEAR_MAX}
                  latestFull={LATEST_FULL}
                  demo={demo}
                  ready={status === 'ready'}
                  onJump={jumpInvestigator}
                  onLaunchFeasibility={launchFeasibility}
                />
              )}

              {tab === 'trials' && (
                <TrialsTab
                  demo={demo}
                  ready={status === 'ready'}
                  jumpTrial={trialJump}
                  onJump={jumpInvestigator}
                  onLaunchFeasibility={launchFeasibility}
                />
              )}

              {tab === 'china' && <ChinaTab demo={demo} ready={status === 'ready'} />}
              {tab === 'who' && <WHOTab demo={demo} ready={status === 'ready'} />}
              {tab === 'about' && (
                <About
                  stats={manifest?.stats}
                  onNavigateTab={navigateTab}
                  onLaunchFeasibility={launchFeasibility}
                />
              )}
            </Suspense>
          </main>

          <DefinitionsPanel defs={defs} focusTerm={defFocus} />

          <footer className="muted">
            Queried in-browser with DuckDB-WASM · no backend · BMIS {sources.bmis_file ?? 'file'} ·
            CT.gov snapshot {ctgovTs} · {demo ? 'demo-investigators.csv' : 'parquet lake'} ·{' '}
            <a href="https://github.com/henryweimd/bmis1572" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </footer>
        </div>
      </div>

      <CommandPalette
        open={cmdOpen}
        ready={status === 'ready'}
        demo={demo}
        onClose={() => setCmdOpen(false)}
        onNavigateTab={navigateTab}
        onJumpInvestigator={jumpInvestigator}
        onJumpSite={jumpToSite}
        onJumpTrial={jumpToTrial}
        onJumpOrg={jumpToOrg}
        onJumpDefinition={jumpDefinition}
      />

      <ShortlistDrawer
        open={shortlistOpen}
        onClose={() => setShortlistOpen(false)}
        onJumpSite={jumpToSite}
        onJumpInvestigator={jumpInvestigator}
        onGoFeasibility={() => navigateTab('feas')}
      />
    </div>
  );
}

export default function App() {
  return (
    <ShortlistProvider>
      <ExplorerShell />
    </ShortlistProvider>
  );
}
