import { useMemo, useState } from 'react';
import { DEF_TITLES } from './lib/constants';

export default function DefinitionsPanel({ defs }: { defs: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const items = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return DEF_TITLES.filter(([k, title]) => {
      if (!q) return true;
      const body = (defs[k] ?? '').toLowerCase();
      return title.toLowerCase().includes(q) || k.toLowerCase().includes(q) || body.includes(q);
    });
  }, [defs, filter]);

  return (
    <section className="panel defs-panel">
      <div className="defs-head">
        <div>
          <h2>Definitions &amp; methodology glossary</h2>
          <p className="muted">
            {DEF_TITLES.length} canonical definitions embedded from the pipeline manifest.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide definitions' : `Show all ${DEF_TITLES.length}`}
        </button>
      </div>
      {open && (
        <div className="defs-body">
          <div className="filters">
            <label>
              Filter definitions
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="e.g. tightness, 2021, movers, WHO"
              />
            </label>
            <span className="muted">
              Showing {items.length} of {DEF_TITLES.length}
            </span>
          </div>
          {items.length ? (
            <dl className="defs">
              {items.map(([k, title]) => (
                <div key={k}>
                  <dt>{title}</dt>
                  <dd>{defs[k] ?? '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">No definitions match “{filter}”.</p>
          )}
        </div>
      )}
    </section>
  );
}
