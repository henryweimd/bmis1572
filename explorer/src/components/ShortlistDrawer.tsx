import { useEffect, useRef, useState } from 'react';
import { downloadCsv } from '../csv';
import { fmtInt } from '../lib/format';
import { serializeShortlistMarkdown, useShortlist } from '../lib/shortlist';
import { IconClose } from './Icons';

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ShortlistDrawer({
  open,
  onClose,
  onJumpSite,
  onJumpInvestigator,
  onGoFeasibility,
}: {
  open: boolean;
  onClose: () => void;
  onJumpSite: (siteN: number) => void;
  onJumpInvestigator: (name: string) => void;
  onGoFeasibility: () => void;
}) {
  const { sites, pis, totalCount, removeSite, removePi, clearAll } = useShortlist();
  const [copiedMd, setCopiedMd] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      setConfirmClear(false);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 4500);
    return () => clearTimeout(t);
  }, [confirmClear]);

  if (!open) return null;

  const copyBrief = async () => {
    const md = serializeShortlistMarkdown(sites, pis);
    try {
      await navigator.clipboard.writeText(md);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 1800);
    } catch {
      downloadMarkdown('feasibility-shortlist.md', md);
    }
  };

  return (
    <div
      className="modal-backdrop drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Feasibility shortlist"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <h2>Feasibility Shortlist ({totalCount})</h2>
            <p className="muted">Saved locally in your browser for side-by-side comparison &amp; export.</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close shortlist"
          >
            <IconClose />
          </button>
        </div>

        <div className="drawer-body">
          <span className="sr-only" aria-live="polite">
            {copiedMd ? 'Markdown feasibility brief copied to clipboard.' : ''}
          </span>
          {totalCount === 0 ? (
            <div className="empty-state">
              <p>
                <strong>No candidate sites or investigators saved yet.</strong>
              </p>
              <p className="muted">
                Use the bookmark button on any site or investigator row in Feasibility, FDA Sites,
                or FDA Investigators to build a protocol feasibility shortlist.
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onGoFeasibility();
                  onClose();
                }}
              >
                Open Feasibility Workbench
              </button>
            </div>
          ) : (
            <>
              <div className="drawer-actions">
                <button type="button" className="btn" onClick={() => void copyBrief()}>
                  {copiedMd ? 'Copied Markdown brief' : 'Copy Markdown brief'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    downloadMarkdown(
                      'feasibility-shortlist.md',
                      serializeShortlistMarkdown(sites, pis),
                    )
                  }
                >
                  Download .md
                </button>
                {!!sites.length && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      downloadCsv(
                        'feasibility-shortlist-sites.csv',
                        ['site', 'address', 'city', 'state', 'country', 'investigators', 'ind_refs', 'first_year', 'last_year', 'ctgov_plausible', 'ctgov_strong'],
                        sites.map((s) => [
                          s.name,
                          s.addr ?? '',
                          s.city,
                          s.state ?? '',
                          s.country,
                          s.n_inv,
                          s.n_receipts,
                          s.first_year,
                          s.last_year,
                          s.ctgov_plausible ?? '',
                          s.ctgov_strong ?? '',
                        ]),
                      )
                    }
                  >
                    Export Sites CSV
                  </button>
                )}
                {!!pis.length && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      downloadCsv(
                        'feasibility-shortlist-investigators.csv',
                        ['investigator', 'site', 'country', 'ind_refs', 'active_years', 'first_year', 'last_year', 'ctgov_linked'],
                        pis.map((p) => [
                          p.display_name,
                          p.site,
                          p.country,
                          p.n_trials,
                          p.n_years,
                          p.first_year,
                          p.last_year,
                          p.linked_trials ?? '',
                        ]),
                      )
                    }
                  >
                    Export PIs CSV
                  </button>
                )}
                {confirmClear ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger-ghost"
                      onClick={() => {
                        clearAll();
                        setConfirmClear(false);
                      }}
                    >
                      Confirm clear ({totalCount})
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setConfirmClear(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setConfirmClear(true)}
                  >
                    Clear all
                  </button>
                )}
              </div>

              {!!sites.length && (
                <section className="drawer-section">
                  <h3>Candidate Sites ({sites.length})</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Site</th>
                          <th>Location</th>
                          <th className="num">Invs</th>
                          <th className="num">Refs</th>
                          <th className="num">CT.gov</th>
                          <th>Span</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {sites.map((s) => (
                          <tr key={s.site_id}>
                            <td>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => {
                                  onJumpSite(s.site_n);
                                  onClose();
                                }}
                              >
                                {s.name}
                              </button>
                            </td>
                            <td>
                              {s.city}
                              {s.state && s.state !== 'NG' ? `, ${s.state}` : ''} {s.country}
                            </td>
                            <td className="num">{fmtInt.format(s.n_inv)}</td>
                            <td className="num">{fmtInt.format(s.n_receipts)}</td>
                            <td className="num">
                              {s.ctgov_plausible ? fmtInt.format(s.ctgov_plausible) : '—'}
                            </td>
                            <td>
                              {s.first_year}–{s.last_year}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => removeSite(s.site_id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {!!pis.length && (
                <section className="drawer-section">
                  <h3>Candidate Investigators ({pis.length})</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Investigator</th>
                          <th>Site</th>
                          <th>Country</th>
                          <th className="num">Refs</th>
                          <th>Span</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {pis.map((p) => (
                          <tr key={p.person_id}>
                            <td>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => {
                                  onJumpInvestigator(p.display_name);
                                  onClose();
                                }}
                              >
                                {p.display_name}
                              </button>
                            </td>
                            <td>{p.site}</td>
                            <td>{p.country}</td>
                            <td className="num">{fmtInt.format(p.n_trials)}</td>
                            <td>
                              {p.first_year}–{p.last_year}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => removePi(p.person_id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
