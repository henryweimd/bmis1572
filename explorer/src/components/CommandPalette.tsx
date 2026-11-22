import { useEffect, useMemo, useRef, useState } from 'react';
import { escapeLike, query } from '../duckdb';
import { DEF_TITLES, TABS, TAB_LABEL, TAB_SUBTITLE } from '../lib/constants';
import type { TabId } from '../lib/constants';
import { fmtInt, normName } from '../lib/format';
import { IconClose, IconSearch } from './Icons';

interface SiteHit {
  site_n: number;
  name: string;
  city: string;
  country: string;
  n_inv: number;
  n_receipts: number;
}

interface PiHit {
  person_id: string;
  display_name: string;
  site: string | null;
  country: string;
  n_trials: number;
}

interface TrialHit {
  nct: string;
  sponsor: string;
  phase: string;
  start_y: number | null;
}

interface OrgHit {
  org: string;
  n: number;
}

export default function CommandPalette({
  open,
  ready,
  demo,
  onClose,
  onNavigateTab,
  onJumpInvestigator,
  onJumpSite,
  onJumpTrial,
  onJumpOrg,
  onJumpDefinition,
}: {
  open: boolean;
  ready: boolean;
  demo: boolean;
  onClose: () => void;
  onNavigateTab: (tab: TabId) => void;
  onJumpInvestigator: (name: string) => void;
  onJumpSite: (siteN: number) => void;
  onJumpTrial: (nct: string) => void;
  onJumpOrg: (kind: 'cro' | 'irb', org: string) => void;
  onJumpDefinition: (term: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [sites, setSites] = useState<SiteHit[]>([]);
  const [pis, setPis] = useState<PiHit[]>([]);
  const [trials, setTrials] = useState<TrialHit[]>([]);
  const [cros, setCros] = useState<OrgHit[]>([]);
  const [irbs, setIrbs] = useState<OrgHit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !ready || demo) return;
    const raw = term.trim();
    if (raw.length < 2) {
      setSites([]);
      setPis([]);
      setTrials([]);
      setCros([]);
      setIrbs([]);
      setBusy(false);
      return;
    }
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const up = escapeLike(raw.toUpperCase());
        const piKey = normName(raw);
        const [st, pi, tr, cr, ir] = await Promise.all([
          query<SiteHit>(
            `SELECT CAST(site_n AS INTEGER) AS site_n, CAST(display_name AS VARCHAR) AS name,` +
              ` CAST(city AS VARCHAR) AS city, CAST(country AS VARCHAR) AS country,` +
              ` CAST(n_inv_ever AS INTEGER) AS n_inv, CAST(n_receipts AS INTEGER) AS n_receipts` +
              ` FROM site_index WHERE version = 'strict'` +
              ` AND (UPPER(display_name) LIKE '%${up}%' ESCAPE '\\' OR UPPER(city) LIKE '%${up}%' ESCAPE '\\')` +
              ` ORDER BY n_receipts DESC LIMIT 6`,
          ).catch(() => []),
          piKey.length >= 2
            ? query<PiHit>(
                `SELECT CAST(person_id AS VARCHAR) AS person_id, CAST(display_name AS VARCHAR) AS display_name,` +
                  ` CAST(site AS VARCHAR) AS site, CAST(country AS VARCHAR) AS country,` +
                  ` CAST(n_trials AS INTEGER) AS n_trials FROM person_index` +
                  ` WHERE name_key LIKE '%${piKey}%' ORDER BY n_trials DESC LIMIT 6`,
              ).catch(() => [])
            : Promise.resolve([]),
          /^NCT\d+/i.test(raw) || raw.length >= 4
            ? query<TrialHit>(
                `SELECT CAST(nct AS VARCHAR) AS nct, CAST(sponsor_disp AS VARCHAR) AS sponsor,` +
                  ` CAST(phase AS VARCHAR) AS phase, CAST(start_y AS INTEGER) AS start_y` +
                  ` FROM ctgov_trials WHERE UPPER(nct) LIKE '%${up}%' ESCAPE '\\'` +
                  ` OR UPPER(sponsor_disp) LIKE '%${up}%' ESCAPE '\\' ORDER BY start_y DESC NULLS LAST LIMIT 5`,
              ).catch(() => [])
            : Promise.resolve([]),
          query<OrgHit>(
            `SELECT CAST(cro AS VARCHAR) AS org, CAST(n_receipts AS INTEGER) AS n FROM cro_index` +
              ` WHERE UPPER(cro) LIKE '%${up}%' ESCAPE '\\' ORDER BY n_receipts DESC LIMIT 4`,
          ).catch(() => []),
          query<OrgHit>(
            `SELECT CAST(irb AS VARCHAR) AS org, CAST(n_receipts AS INTEGER) AS n FROM irb_index` +
              ` WHERE UPPER(irb) LIKE '%${up}%' ESCAPE '\\' ORDER BY n_receipts DESC LIMIT 4`,
          ).catch(() => []),
        ]);
        if (seq !== seqRef.current) return;
        setSites(st);
        setPis(pi);
        setTrials(tr);
        setCros(cr);
        setIrbs(ir);
      } finally {
        if (seq === seqRef.current) setBusy(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [open, ready, demo, term]);

  const matchingTabs = useMemo(() => {
    const q = term.trim().toLowerCase();
    return TABS.filter(
      (t) =>
        !q ||
        TAB_LABEL[t].toLowerCase().includes(q) ||
        TAB_SUBTITLE[t].toLowerCase().includes(q),
    );
  }, [term]);

  const matchingDefs = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return DEF_TITLES.filter(
      ([k, title]) => title.toLowerCase().includes(q) || k.toLowerCase().includes(q),
    ).slice(0, 5);
  }, [term]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Global explorer search"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmd-modal">
        <div className="cmd-input-row">
          <IconSearch className="icon muted" />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search sites, investigators, NCT numbers, sponsors, CROs, IRBs, views, or glossary…"
            aria-label="Search across all datasets"
          />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search">
            <IconClose />
          </button>
        </div>

        <div className="cmd-results">
          {busy && <p className="muted cmd-status">Searching DuckDB lake…</p>}

          {!!sites.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">Research Sites (BMIS)</div>
              {sites.map((s) => (
                <button
                  key={s.site_n}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onJumpSite(s.site_n);
                    onClose();
                  }}
                >
                  <span className="cmd-title">{s.name}</span>
                  <span className="cmd-meta">
                    {s.city}, {s.country} · {fmtInt.format(s.n_inv)} invs · {fmtInt.format(s.n_receipts)} refs
                  </span>
                </button>
              ))}
            </div>
          )}

          {!!pis.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">Investigators (Strict Persons)</div>
              {pis.map((p) => (
                <button
                  key={p.person_id}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onJumpInvestigator(p.display_name);
                    onClose();
                  }}
                >
                  <span className="cmd-title">{p.display_name}</span>
                  <span className="cmd-meta">
                    {p.site ?? '—'} · {p.country} · {fmtInt.format(p.n_trials)} refs
                  </span>
                </button>
              ))}
            </div>
          )}

          {!!trials.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">US Industry Trials (CT.gov)</div>
              {trials.map((t) => (
                <button
                  key={t.nct}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onJumpTrial(t.nct);
                    onClose();
                  }}
                >
                  <span className="cmd-title">
                    {t.nct} · {t.sponsor}
                  </span>
                  <span className="cmd-meta">
                    {t.phase} {t.start_y ? `· started ${t.start_y}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!!cros.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">CRO Companies</div>
              {cros.map((c) => (
                <button
                  key={c.org}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onJumpOrg('cro', c.org);
                    onClose();
                  }}
                >
                  <span className="cmd-title">{c.org}</span>
                  <span className="cmd-meta">{fmtInt.format(c.n)} receipts</span>
                </button>
              ))}
            </div>
          )}

          {!!irbs.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">IRB Boards</div>
              {irbs.map((c) => (
                <button
                  key={c.org}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onJumpOrg('irb', c.org);
                    onClose();
                  }}
                >
                  <span className="cmd-title">{c.org}</span>
                  <span className="cmd-meta">{fmtInt.format(c.n)} receipts</span>
                </button>
              ))}
            </div>
          )}

          {!!matchingDefs.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">Methodology &amp; Glossary</div>
              {matchingDefs.map(([k, title]) => (
                <button
                  key={k}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onJumpDefinition(title);
                    onClose();
                  }}
                >
                  <span className="cmd-title">{title}</span>
                  <span className="cmd-meta">Open in glossary</span>
                </button>
              ))}
            </div>
          )}

          {!!matchingTabs.length && (
            <div className="cmd-group">
              <div className="cmd-group-label">Navigate Views</div>
              {matchingTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    onNavigateTab(t);
                    onClose();
                  }}
                >
                  <span className="cmd-title">{TAB_LABEL[t]}</span>
                  <span className="cmd-meta">{TAB_SUBTITLE[t]}</span>
                </button>
              ))}
            </div>
          )}

          {!busy &&
            term.trim().length >= 2 &&
            !sites.length &&
            !pis.length &&
            !trials.length &&
            !cros.length &&
            !irbs.length &&
            !matchingDefs.length &&
            !matchingTabs.length && (
              <p className="muted cmd-status">
                No matches for “{term}”. Try a hospital name (e.g. MD Anderson), city (Houston), NCT
                number (NCT01188928), or investigator surname.
              </p>
            )}
        </div>
        <div className="cmd-footer muted">
          <span>Esc to close</span>
          <span>Live in-browser DuckDB-WASM search</span>
        </div>
      </div>
    </div>
  );
}
