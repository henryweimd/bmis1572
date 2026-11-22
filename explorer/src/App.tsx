import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createViews, loadManifest } from './duckdb';
import type { Manifest } from './duckdb';
import DefinitionsPanel from './DefinitionsPanel';
import { pick, readHash, writeHash } from './hash';
import {
  BANDS,
  LATEST_FULL,
  TABS,
  TAB_LABEL,
  YEAR_MAX,
  YEAR_MIN,
} from './lib/constants';
import type { TabId } from './lib/constants';
import './App.css';

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

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [demo, setDemo] = useState(false);
  const [copied, setCopied] = useState(false);

  const [tab, setTab] = useState<TabId>(() => pick(readHash().t, TABS, 'inv'));
  const [jumpRequest, setJumpRequest] = useState<{ name: string; seq: number } | null>(null);
  const jumpSeq = useRef(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
  }, [tab]);

  // Keep active tab synced with browser hash navigation.
  useEffect(() => {
    const onHashChange = () => {
      const next = pick(readHash().t, TABS, 'inv');
      setTab(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const jumpInvestigator = useCallback((name: string) => {
    jumpSeq.current += 1;
    setJumpRequest({ name, seq: jumpSeq.current });
    setTab('inv');
  }, []);

  const jumpToSite = useCallback((siteN: number) => {
    writeHash({ t: 'site', 'site.v': 'strict', 'site.s': `strict:${siteN}` });
    setTab('site');
  }, []);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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
    <div className="wrap">
      <header>
        <div>
          <h1>Global Clinical Trial Investigator Talent Supply Data Explorer</h1>
          <p className="muted">
            {demo ? 'Demo sample (strict, yearly geo)' : 'FDA BMIS investigators vs. industry trials'}
            {manifest && !demo && ` · built ${manifest.generated_at.slice(0, 16).replace('T', ' ')} UTC`}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void copyShareLink()}
            title="Copy shareable URL with current filters"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <span className={demo ? 'badge demo' : 'badge'}>{demo ? 'demo data' : 'full lake'}</span>
        </div>
      </header>

      {demo && (
        <p className="banner">
          Showing the committed demo sample. Run <code>uv run python pipeline/build.py</code> to
          build and explore the full lake locally.
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="Views" onKeyDown={onTabKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <main>
        <Suspense fallback={<TabSkeleton />}>
          {tab === 'inv' && (
            <InvestigatorsTab
              ready={status === 'ready'}
              demo={demo}
              manifest={manifest}
              jumpRequest={jumpRequest}
              onJumpSite={jumpToSite}
            />
          )}

          {tab === 'cro' && (
            <OrgTab
              key="cro"
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
              key="irb"
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
              bands={bandList}
              yearMin={YEAR_MIN}
              yearMax={YEAR_MAX}
              latestFull={LATEST_FULL}
              demo={demo}
              ready={status === 'ready'}
              onJump={jumpInvestigator}
            />
          )}

          {tab === 'trials' && (
            <TrialsTab demo={demo} ready={status === 'ready'} onJump={jumpInvestigator} />
          )}

          {tab === 'china' && <ChinaTab demo={demo} ready={status === 'ready'} />}
          {tab === 'who' && <WHOTab demo={demo} ready={status === 'ready'} />}
          {tab === 'about' && <About stats={manifest?.stats} />}
        </Suspense>
      </main>

      <DefinitionsPanel defs={defs} />

      <footer className="muted">
        Queried in-browser with DuckDB-WASM · no backend · BMIS {sources.bmis_file ?? 'file'} ·
        CT.gov snapshot {ctgovTs} · {demo ? 'demo-investigators.csv' : 'parquet lake'} ·{' '}
        <a href="https://github.com/henryweimd/bmis1572" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
