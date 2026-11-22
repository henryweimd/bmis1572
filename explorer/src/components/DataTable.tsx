import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { downloadCsv } from '../csv';

export interface ColumnDef<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortValue?: (row: T) => string | number | null | undefined;
  render: (row: T, index: number) => ReactNode;
  csvValue?: (row: T) => string | number | null | undefined;
  title?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  defaultSort,
  filterPlaceholder,
  filterText,
  onRowClick,
  isSelected,
  rowTitle,
  csvFilename,
  emptyMessage = 'No matching rows.',
  pageSize = 25,
  compact = false,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T, index: number) => string;
  defaultSort?: { key: string; dir: 1 | -1 };
  filterPlaceholder?: string;
  filterText?: (row: T) => string;
  onRowClick?: (row: T) => void;
  isSelected?: (row: T) => boolean;
  rowTitle?: (row: T) => string;
  csvFilename?: string;
  emptyMessage?: string;
  pageSize?: number;
  compact?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(defaultSort ?? null);
  const [queryText, setQueryText] = useState('');
  const [shown, setShown] = useState(pageSize);

  useEffect(() => {
    setShown(pageSize);
  }, [rows, pageSize]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q || !filterText) return rows;
    return rows.filter((r) => filterText(r).toLowerCase().includes(q));
  }, [rows, queryText, filterText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const getter = col.sortValue;
    return [...filtered].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sort.dir * (va - vb);
      }
      return sort.dir * String(va).localeCompare(String(vb));
    });
  }, [filtered, sort, columns]);

  const toggleSort = (col: ColumnDef<T>) => {
    if (!col.sortValue) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === 1 ? -1 : 1 }
        : { key: col.key, dir: col.align === 'right' ? -1 : 1 },
    );
  };

  const visible = sorted.slice(0, shown);

  const exportCsv = () => {
    if (!csvFilename) return;
    const exportCols = columns.filter((c) => c.csvValue);
    downloadCsv(
      csvFilename,
      exportCols.map((c) => c.label),
      sorted.map((r) => exportCols.map((c) => c.csvValue?.(r) ?? '')),
    );
  };

  return (
    <div className="datatable">
      {(filterText || csvFilename) && (
        <div className="datatable-bar">
          {filterText && (
            <input
              type="search"
              value={queryText}
              onChange={(e) => {
                setQueryText(e.target.value);
                setShown(pageSize);
              }}
              placeholder={filterPlaceholder ?? 'Filter table…'}
              aria-label={filterPlaceholder ?? 'Filter table'}
            />
          )}
          <span className="muted datatable-count">
            {sorted.length === rows.length
              ? `${rows.length.toLocaleString('en-US')} rows`
              : `${sorted.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} rows`}
          </span>
          {csvFilename && sorted.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={exportCsv}>
              CSV
            </button>
          )}
        </div>
      )}
      {visible.length === 0 ? (
        <div className="datatable-bar">
          <p className="muted">{emptyMessage}</p>
          {queryText && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQueryText('');
                setShown(pageSize);
              }}
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className={compact ? 'table-scroll short' : 'table-scroll'}>
          <table>
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  const arrow = active ? (sort.dir === 1 ? ' ▲' : ' ▼') : '';
                  const ariaSort = c.sortValue
                    ? active
                      ? sort.dir === 1
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined;
                  return (
                    <th
                      key={c.key}
                      className={c.align === 'right' ? 'num' : undefined}
                      title={c.title}
                      aria-sort={ariaSort}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          className={`sort-btn${active ? ' active' : ''}`}
                          onClick={() => toggleSort(c)}
                        >
                          {c.label}
                          {arrow}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, idx) => {
                const picked = isSelected?.(row) ?? false;
                const clickable = Boolean(onRowClick);
                return (
                  <tr
                    key={rowKey(row, idx)}
                    className={picked ? 'picked' : clickable ? 'pickable' : undefined}
                    title={rowTitle?.(row)}
                    aria-selected={clickable ? picked : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>
                        {c.render(row, idx)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length > visible.length && (
        <div className="datatable-more">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShown((s) => s + pageSize)}
          >
            Show more ({sorted.length - visible.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
