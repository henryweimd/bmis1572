import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { escapeLike, query } from '../duckdb';
import { DEF_TITLES, TABS, TAB_LABEL, TAB_SUBTITLE } from '../lib/constants';
import type { TabId } from '../lib/constants';
import { fmtCount, fmtInt, fmtPhase, normName } from '../lib/format';
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

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  meta: string;
  onSelect: () => void;
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
  onJumpSite: (siteN: number, version?: 'strict' | 'merged') => void;
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
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open]);

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

  const groups = useMemo(() => {
    const out: { label: string; items: PaletteItem[] }[] = [];
    if (sites.length) {
      out.push({
        label: 'Research Sites (BMIS)',
        items: sites.map((s) => ({
          id: `cmd-site-${s.site_n}`,
          group: 'sites',
          title: s.name,
          meta: `${s.city}, ${s.country} · ${fmtCount(s.n_inv, 'investigator')} · ${fmtCount(s.n_receipts, 'IND filing')}`,
          onSelect: () => {
            onJumpSite(s.site_n, 'strict');
            onClose();
          },
        })),
      });
    }
    if (pis.length) {
      out.push({
        label: 'Investigators (Strict Persons)',
        items: pis.map((p) => ({
          id: `cmd-pi-${p.person_id}`,
          group: 'pis',
          title: p.display_name,
          meta: `${p.site ?? '—'} · ${p.country} · ${fmtCount(p.n_trials, 'IND filing')}`,
          onSelect: () => {
            onJumpInvestigator(p.display_name);
            onClose();
          },
        })),
      });
    }
    if (trials.length) {
      out.push({
        label: 'US Industry Trials (CT.gov)',
        items: trials.map((t) => ({
          id: `cmd-trial-${t.nct}`,
          group: 'trials',
          title: `${t.nct} · ${t.sponsor}`,
          meta: `${fmtPhase(t.phase)}${t.start_y ? ` · started ${t.start_y}` : ''}`,
          onSelect: () => {
            onJumpTrial(t.nct);
            onClose();
          },
        })),
      });
    }
    if (cros.length) {
      out.push({
        label: 'CRO Companies',
        items: cros.map((c) => ({
          id: `cmd-cro-${c.org}`,
          group: 'cros',
          title: c.org,
          meta: `${fmtInt.format(c.n)} receipts`,
          onSelect: () => {
            onJumpOrg('cro', c.org);
            onClose();
          },
        })),
      });
    }
    if (irbs.length) {
      out.push({
        label: 'IRB Boards',
        items: irbs.map((c) => ({
          id: `cmd-irb-${c.org}`,
          group: 'irbs',
          title: c.org,
          meta: `${fmtInt.format(c.n)} receipts`,
          onSelect: () => {
            onJumpOrg('irb', c.org);
            onClose();
          },
        })),
      });
    }
    if (matchingDefs.length) {
      out.push({
        label: 'Methodology & Glossary',
        items: matchingDefs.map(([k, title]) => ({
          id: `cmd-def-${k}`,
          group: 'defs',
          title,
          meta: 'Open in glossary',
          onSelect: () => {
            onJumpDefinition(title);
            onClose();
          },
        })),
      });
    }
    if (matchingTabs.length) {
      out.push({
        label: 'Navigate Views',
        items: matchingTabs.map((t) => ({
          id: `cmd-tab-${t}`,
          group: 'tabs',
          title: TAB_LABEL[t],
          meta: TAB_SUBTITLE[t],
          onSelect: () => {
            onNavigateTab(t);
            onClose();
          },
        })),
      });
    }
    return out;
  }, [
    sites,
    pis,
    trials,
    cros,
    irbs,
    matchingDefs,
    matchingTabs,
    onJumpSite,
    onJumpInvestigator,
    onJumpTrial,
    onJumpOrg,
    onJumpDefinition,
    onNavigateTab,
    onClose,
  ]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActiveIdx(0);
  }, [term, sites, pis, trials, cros, irbs]);

  const moveSelection = useCallback(
    (next: number) => {
      if (!flatItems.length) return;
      const wrapped = ((next % flatItems.length) + flatItems.length) % flatItems.length;
      setActiveIdx(wrapped);
      itemRefs.current[wrapped]?.scrollIntoView({ block: 'nearest' });
    },
    [flatItems.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = [
          ...modalRef.current.querySelectorAll<HTMLElement>(
            'input, button:not([tabindex="-1"]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(activeIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(activeIdx - 1);
      } else if (e.key === 'Home' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        moveSelection(0);
      } else if (e.key === 'End' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        moveSelection(flatItems.length - 1);
      } else if (e.key === 'Enter' && flatItems[activeIdx]) {
        e.preventDefault();
        flatItems[activeIdx].onSelect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, moveSelection, activeIdx, flatItems]);

  if (!open) return null;

  const activeItem = flatItems[activeIdx];
  let runningIdx = 0;

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
      <div className="cmd-modal" ref={modalRef}>
        <div className="cmd-input-row">
          <IconSearch className="icon muted" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search sites, investigators, NCT numbers, sponsors, CROs, IRBs, views, or glossary…"
            aria-label="Search across all datasets"
            aria-controls="cmd-results-list"
            aria-activedescendant={activeItem?.id}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
          {term && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setTerm('');
                inputRef.current?.focus();
              }}
            >
              Clear
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search">
            <IconClose />
          </button>
        </div>

        <div className="cmd-results" id="cmd-results-list" role="listbox" aria-label="Search results">
          {busy && (
            <p className="muted cmd-status" role="status" aria-live="polite">
              Searching datasets…
            </p>
          )}

          {groups.map((group) => (
            <div key={group.label} className="cmd-group" role="group" aria-label={group.label}>
              <div className="cmd-group-label">{group.label}</div>
              {group.items.map((item) => {
                const idx = runningIdx++;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={item.id}
                    id={item.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    tabIndex={-1}
                    role="option"
                    aria-selected={isActive}
                    className={`cmd-item${isActive ? ' active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={item.onSelect}
                  >
                    <span className="cmd-title">{item.title}</span>
                    <span className="cmd-meta">{item.meta}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {!busy && term.trim().length >= 2 && flatItems.length === 0 && (
            <p className="muted cmd-status">
              No matches for “{term}”. Try a hospital name (e.g. MD Anderson), city (Houston), NCT
              number (NCT01188928), or investigator surname.
            </p>
          )}
        </div>
        <div className="cmd-footer muted">
          <span>↑↓ navigate · ↵ open · Esc close</span>
          <span>Live in-browser DuckDB-WASM search</span>
        </div>
      </div>
    </div>
  );
}
