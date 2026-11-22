import { useMemo, useState } from 'react';
import { fmtCompact, fmtInt, fmtPct1, fmtVal, vintageCellStyle } from './lib/format';

type BarMode = 'abs' | 'pct';
type ViewMode = 'chart' | 'table';

export interface RefLine {
  x: number;
  label: string;
}

function ChartToolbar({
  mode,
  setMode,
  view,
  setView,
  showScale = false,
}: {
  mode?: BarMode;
  setMode?: (m: BarMode) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  showScale?: boolean;
}) {
  return (
    <div className="chart-toolbar">
      {showScale && mode && setMode && view === 'chart' && (
        <div className="seg" role="group" aria-label="Bar scale">
          <button
            type="button"
            className={mode === 'abs' ? 'active' : ''}
            aria-pressed={mode === 'abs'}
            onClick={() => setMode('abs')}
            title="Bar height shows absolute counts"
          >
            Absolute
          </button>
          <button
            type="button"
            className={mode === 'pct' ? 'active' : ''}
            aria-pressed={mode === 'pct'}
            onClick={() => setMode('pct')}
            title="Each bar scaled to 100%; segments show share of the year"
          >
            100%
          </button>
        </div>
      )}
      <div className="seg" role="group" aria-label="Display format">
        <button
          type="button"
          className={view === 'chart' ? 'active' : ''}
          aria-pressed={view === 'chart'}
          onClick={() => setView('chart')}
          title="Visual chart view"
        >
          Chart
        </button>
        <button
          type="button"
          className={view === 'table' ? 'active' : ''}
          aria-pressed={view === 'table'}
          onClick={() => setView('table')}
          title="Underlying numeric data table"
        >
          Table
        </button>
      </div>
    </div>
  );
}

export function TrendChart({
  data,
  label = 'Trend over time',
  suffix = '',
}: {
  data: { d: string; v: number }[];
  label?: string;
  suffix?: string;
}) {
  const W = 720;
  const H = 224;
  const P = { l: 54, r: 16, t: 14, b: 28 };
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>('chart');

  if (!data.length) return <p className="muted">No data.</p>;

  if (view === 'table') {
    return (
      <div>
        <ChartToolbar view={view} setView={setView} />
        <div className="table-scroll short">
          <table>
            <thead>
              <tr>
                <th className="sticky-col">Period</th>
                <th className="num">{label}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.d}>
                  <td className="sticky-col">{p.d}</td>
                  <td className="num">
                    {fmtVal(p.v)}
                    {suffix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const vs = data.map((p) => p.v);
  const rawMin = Math.min(...vs);
  const rawMax = Math.max(...vs);
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.1 || 1;
  const min = rawMin >= 0 ? Math.max(0, rawMin - pad) : rawMin - pad;
  const max = rawMax + pad;
  const span = max - min || 1;

  const x = (i: number) =>
    data.length === 1 ? (P.l + W - P.r) / 2 : P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const pts = data.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((i) => min + (span * i) / 3);
  const step = data.length > 22 ? 4 : data.length > 10 ? 2 : 1;
  const showDots = data.length <= 32;
  const showTick = (i: number) =>
    i % step === 0 || (i === data.length - 1 && (data.length - 1) % step >= Math.ceil(step / 2));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const px = (e.clientX - rect.left) * (W / rect.width);
    const frac = (px - P.l) / (W - P.l - P.r);
    const idx = Math.round(frac * (data.length - 1));
    setHoverIdx(Math.min(data.length - 1, Math.max(0, idx)));
  };

  const active = hoverIdx !== null ? data[hoverIdx] : null;
  const activeX = hoverIdx !== null ? x(hoverIdx) : 0;
  const flip = hoverIdx !== null && (activeX - P.l) / (W - P.l - P.r) > 0.62;

  return (
    <div>
      <ChartToolbar view={view} setView={setView} />
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label} (${data[0].d}–${data[data.length - 1].d}, ${data.length} periods)`}
        >
          <title>{`${label} (${data[0].d}–${data[data.length - 1].d})`}</title>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                {suffix ? `${t.toFixed(t < 10 ? 1 : 0)}${suffix}` : fmtCompact.format(t)}
              </text>
            </g>
          ))}
          {data.length > 1 && (
            <polygon
              points={`${x(0).toFixed(1)},${H - P.b} ${pts} ${x(data.length - 1).toFixed(1)},${H - P.b}`}
              className="area"
            />
          )}
          <polyline points={pts} className="line" />
          {showDots &&
            data.map((p, i) => (
              <circle
                key={p.d}
                cx={x(i)}
                cy={y(p.v)}
                r={hoverIdx === i ? 4.5 : 2.6}
                className={hoverIdx === i ? 'dot-active' : 'dot'}
              />
            ))}
          {data.map((p, i) =>
            showTick(i) ? (
              <text key={p.d} x={x(i)} y={H - 8} textAnchor="middle" className="tick tick-x">
                {p.d}
              </text>
            ) : null,
          )}
          {hoverIdx !== null && (
            <line x1={activeX} x2={activeX} y1={P.t} y2={H - P.b} className="crosshair" />
          )}
          <rect
            x={P.l}
            y={P.t}
            width={W - P.l - P.r}
            height={H - P.t - P.b}
            fill="transparent"
            onPointerDown={onMove}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIdx(null)}
            onPointerCancel={() => setHoverIdx(null)}
            onLostPointerCapture={() => setHoverIdx(null)}
          />
        </svg>
        {active && (
          <div
            className="tooltip"
            style={{
              left: `${(activeX / W) * 100}%`,
              transform: flip ? 'translate(-106%, 0)' : 'translate(6%, 0)',
            }}
          >
            <strong>{active.d}</strong>
            <div className="tooltip-row">
              <span className="swatch" style={{ background: 'var(--accent)' }} />
              <span className="tooltip-label">{label}</span>
              <span className="tooltip-val">
                {fmtVal(active.v)}
                {suffix}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface LinePoint {
  x: number;
  y: number | null;
}
export interface LineSeries {
  label: string;
  color: string;
  points: LinePoint[];
}

export function MultiLineChart({
  series,
  suffix = '',
  refLines,
}: {
  series: LineSeries[];
  suffix?: string;
  refLines?: RefLine[];
}) {
  const W = 720;
  const H = 244;
  const P = { l: 54, r: 16, t: 18, b: 30 };
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<ViewMode>('chart');

  const effectiveHidden = useMemo(() => {
    const labels = new Set(series.map((s) => s.label));
    const pruned = new Set([...hidden].filter((l) => labels.has(l)));
    return pruned.size >= series.length ? new Set<string>() : pruned;
  }, [series, hidden]);
  const activeSeries = useMemo(
    () => series.filter((s) => !effectiveHidden.has(s.label)),
    [series, effectiveHidden],
  );

  const all = activeSeries
    .flatMap((s) => s.points)
    .filter((p) => p.y !== null) as { x: number; y: number }[];

  if (!all.length) return <p className="muted">No data.</p>;

  const yearSet = [...new Set(activeSeries.flatMap((s) => s.points.map((p) => p.x)))].sort(
    (a, b) => a - b,
  );

  if (view === 'table') {
    const maps = activeSeries.map((s) => new Map(s.points.map((p) => [p.x, p.y])));
    return (
      <div>
        <ChartToolbar view={view} setView={setView} />
        <div className="table-scroll short">
          <table>
            <thead>
              <tr>
                <th className="sticky-col">Year</th>
                {activeSeries.map((s) => (
                  <th key={s.label} className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearSet.map((yr) => (
                <tr key={yr}>
                  <td className="sticky-col">{yr}</td>
                  {maps.map((m, i) => {
                    const v = m.get(yr);
                    return (
                      <td key={activeSeries[i].label} className="num">
                        {v == null ? '—' : `${fmtVal(v)}${suffix}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const step = yearSet.length > 10 ? 2 : 1;
  const yearTicks = yearSet.filter((_, i) => i % step === 0);
  const x0 = Math.min(...yearSet);
  const x1 = Math.max(...yearSet);
  const vs = all.map((p) => p.y);
  const min = Math.min(0, ...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const x = (v: number) =>
    x0 === x1 ? (P.l + W - P.r) / 2 : P.l + ((v - x0) / (x1 - x0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const ticks = [0, 1, 2, 3].map((i) => min + (span * i) / 3);
  const showDots = activeSeries.every((s) => s.points.length <= 32);

  const runs = (pts: LinePoint[]): string[] => {
    const out: string[] = [];
    let cur: string[] = [];
    for (const p of pts) {
      if (p.y === null) {
        if (cur.length > 1) out.push(cur.join(' '));
        cur = [];
      } else {
        cur.push(`${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`);
      }
    }
    if (cur.length > 1) out.push(cur.join(' '));
    else if (cur.length === 1) out.push(`${cur[0]} ${cur[0]}`);
    return out;
  };

  const toggleSeries = (label: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else if (series.length - next.size > 1) {
        next.add(label);
      } else {
        next.clear();
      }
      return next;
    });
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const px = (e.clientX - rect.left) * (W / rect.width);
    const year = Math.round(x0 + ((px - P.l) / (W - P.l - P.r)) * (x1 - x0));
    const clamped = Math.min(x1, Math.max(x0, year));
    setHover(yearSet.includes(clamped) ? clamped : null);
  };

  const flip = hover !== null && (x(hover) - P.l) / (W - P.l - P.r) > 0.62;

  return (
    <div>
      <ChartToolbar view={view} setView={setView} />
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${activeSeries.map((s) => s.label).join(', ')} (${x0}–${x1})`}
        >
          <title>{`${activeSeries.map((s) => s.label).join(', ')} (${x0}–${x1})`}</title>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                {suffix ? `${t.toFixed(0)}${suffix}` : fmtCompact.format(t)}
              </text>
            </g>
          ))}
          {yearSet.map((yr) => (
            <line key={`g${yr}`} x1={x(yr)} x2={x(yr)} y1={P.t} y2={H - P.b} className="grid grid-x" />
          ))}
          {refLines?.map((rl) =>
            rl.x >= x0 && rl.x <= x1 ? (
              <g key={`ref-${rl.x}`}>
                <line x1={x(rl.x)} x2={x(rl.x)} y1={P.t} y2={H - P.b} className="ref-line" />
                <text
                  x={x(rl.x) > W - P.r - 48 ? x(rl.x) - 4 : x(rl.x) + 4}
                  y={P.t + 10}
                  textAnchor={x(rl.x) > W - P.r - 48 ? 'end' : 'start'}
                  className="tick ref-label"
                >
                  {rl.label}
                </text>
              </g>
            ) : null,
          )}
          {yearTicks.map((yr) => (
            <text key={`t${yr}`} x={x(yr)} y={H - 8} textAnchor="middle" className="tick tick-x">
              {yr}
            </text>
          ))}
          {activeSeries.map((s) =>
            runs(s.points).map((pts, j) => (
              <polyline
                key={`${s.label}-${j}`}
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )),
          )}
          {showDots &&
            activeSeries.map((s) =>
              s.points
                .filter((p) => p.y !== null)
                .map((p) => (
                  <circle
                    key={`${s.label}-${p.x}`}
                    cx={x(p.x)}
                    cy={y(p.y as number)}
                    r={hover === p.x ? 4.2 : 2.6}
                    fill={s.color}
                    stroke={hover === p.x ? 'var(--surface)' : 'none'}
                    strokeWidth={hover === p.x ? 1.5 : 0}
                  />
                )),
            )}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} className="crosshair" />
          )}
          <rect
            x={P.l}
            y={P.t}
            width={W - P.l - P.r}
            height={H - P.t - P.b}
            fill="transparent"
            onPointerDown={onMove}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onPointerCancel={() => setHover(null)}
            onLostPointerCapture={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div
            className="tooltip"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: flip ? 'translate(-106%, 0)' : 'translate(6%, 0)',
            }}
          >
            <strong>{hover}</strong>
            {activeSeries.map((s) => {
              const p = s.points.find((pt) => pt.x === hover);
              return (
                <div key={s.label} className="tooltip-row">
                  <span className="swatch" style={{ background: s.color }} />
                  <span className="tooltip-label">{s.label}</span>
                  <span className="tooltip-val">
                    {p?.y == null ? '—' : `${fmtVal(p.y)}${suffix}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="legend">
        {series.map((s) => {
          const isHidden = effectiveHidden.has(s.label);
          return series.length > 1 ? (
            <button
              key={s.label}
              type="button"
              className={`legend-item interactive${isHidden ? ' off' : ''}`}
              aria-pressed={!isHidden}
              onClick={() => toggleSeries(s.label)}
              title={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
            >
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </button>
          ) : (
            <span key={s.label} className="legend-item">
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          );
        })}
        {effectiveHidden.size > 0 && (
          <button type="button" className="legend-reset" onClick={() => setHidden(new Set())}>
            Show all
          </button>
        )}
      </div>
    </div>
  );
}

export function StackedMultiBars({
  series,
  marks,
  allTicks,
}: {
  series: LineSeries[];
  marks?: Record<number, string>;
  allTicks?: boolean;
}) {
  const W = 720;
  const H = 244;
  const P = { l: 54, r: 14, t: 14, b: 30 };
  const [mode, setMode] = useState<BarMode>('abs');
  const [view, setView] = useState<ViewMode>('chart');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const effectiveHidden = useMemo(() => {
    const labels = new Set(series.map((s) => s.label));
    const pruned = new Set([...hidden].filter((l) => labels.has(l)));
    return pruned.size >= series.length ? new Set<string>() : pruned;
  }, [series, hidden]);
  const activeSeries = useMemo(
    () => series.filter((s) => !effectiveHidden.has(s.label)),
    [series, effectiveHidden],
  );

  const years = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b),
    [series],
  );

  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of series) {
      for (const p of s.points) m.set(`${s.label}|${p.x}`, p.y ?? 0);
    }
    return m;
  }, [series]);

  if (!series.length || !years.length) return <p className="muted">No data.</p>;

  const totals = years.map((yr) =>
    activeSeries.reduce((a, s) => a + (lookup.get(`${s.label}|${yr}`) ?? 0), 0),
  );

  if (view === 'table') {
    return (
      <div>
        <ChartToolbar mode={mode} setMode={setMode} view={view} setView={setView} showScale={false} />
        <div className="table-scroll short">
          <table>
            <thead>
              <tr>
                <th className="sticky-col">Year</th>
                {activeSeries.length > 1 && <th className="num">Total</th>}
                {activeSeries.map((s) => (
                  <th key={s.label} className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((yr, i) => (
                <tr key={yr}>
                  <td className="sticky-col">
                    {yr}
                    {marks?.[yr] ?? ''}
                  </td>
                  {activeSeries.length > 1 && (
                    <td className="num">
                      <strong>{fmtInt.format(totals[i])}</strong>
                    </td>
                  )}
                  {activeSeries.map((s) => (
                    <td key={s.label} className="num">
                      {fmtInt.format(lookup.get(`${s.label}|${yr}`) ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const max = mode === 'abs' ? Math.max(...totals) || 1 : 100;
  const scale = (v: number, t: number) => (mode === 'abs' ? v : t > 0 ? (v / t) * 100 : 0);
  const plotW = W - P.l - P.r;
  const slotW = plotW / years.length;
  const barW = Math.min(48, slotW * 0.72);
  const barX = (i: number) => P.l + i * slotW + (slotW - barW) / 2;
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const ticks = mode === 'abs' ? [0, 1, 2, 3].map((i) => (max * i) / 3) : [0, 25, 50, 75, 100];
  const tickFmt = (t: number) => (mode === 'abs' ? fmtCompact.format(t) : `${t}%`);
  const step = slotW < 34 ? Math.ceil(34 / slotW) : allTicks ? 1 : years.length > 10 ? 2 : 1;

  const toggleSeries = (label: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else if (series.length - next.size > 1) {
        next.add(label);
      } else {
        next.clear();
      }
      return next;
    });
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const px = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.floor((px - P.l) / slotW);
    setHoverIdx(Math.min(years.length - 1, Math.max(0, idx)));
  };

  const hoverYear = hoverIdx !== null ? years[hoverIdx] : null;
  const hoverTotal = hoverIdx !== null ? totals[hoverIdx] : 0;
  const hoverCenter = hoverIdx !== null ? barX(hoverIdx) + barW / 2 : 0;
  const flip = hoverIdx !== null && (hoverCenter - P.l) / plotW > 0.6;

  return (
    <div>
      <ChartToolbar
        mode={mode}
        setMode={setMode}
        view={view}
        setView={setView}
        showScale={series.length > 1}
      />
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Stacked bars, ${years.length} years, ${activeSeries.length} segments, ${mode === 'pct' ? 'percent' : 'absolute'}`}
        >
          <title>{`Stacked bars across ${years[0]}–${years[years.length - 1]}`}</title>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                {tickFmt(t)}
              </text>
            </g>
          ))}
          {hoverIdx !== null && (
            <rect
              x={P.l + hoverIdx * slotW}
              y={P.t}
              width={slotW}
              height={H - P.t - P.b}
              className="bar-hover-band"
            />
          )}
          {years.map((yr, i) => {
            const t = totals[i];
            const bx = barX(i);
            let acc = 0;
            const marked = marks?.[yr];
            return (
              <g key={yr}>
                {marked && (
                  <line
                    x1={bx + barW / 2}
                    x2={bx + barW / 2}
                    y1={P.t}
                    y2={H - P.b}
                    className="ref-line"
                  />
                )}
                {activeSeries.map((s) => {
                  const v = lookup.get(`${s.label}|${yr}`) ?? 0;
                  const yBase = y(acc);
                  acc += scale(v, t);
                  const yTop = y(acc);
                  return (
                    <rect
                      key={s.label}
                      x={bx}
                      y={yTop}
                      width={barW}
                      height={Math.max(0, yBase - yTop)}
                      fill={s.color}
                      opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.72}
                    />
                  );
                })}
                {(i % step === 0 || marked) && (
                  <text
                    x={bx + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="tick tick-x"
                    fontWeight={marked ? 'bold' : undefined}
                  >
                    {yr}
                    {marked ?? ''}
                  </text>
                )}
              </g>
            );
          })}
          <rect
            x={P.l}
            y={P.t}
            width={plotW}
            height={H - P.t - P.b}
            fill="transparent"
            onPointerDown={onMove}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIdx(null)}
            onPointerCancel={() => setHoverIdx(null)}
            onLostPointerCapture={() => setHoverIdx(null)}
          />
        </svg>
        {hoverYear !== null && (
          <div
            className="tooltip"
            style={{
              left: `${(hoverCenter / W) * 100}%`,
              transform: flip ? 'translate(-106%, 0)' : 'translate(6%, 0)',
            }}
          >
            <strong>
              {hoverYear}
              {marks?.[hoverYear] ?? ''} · {fmtInt.format(hoverTotal)}
            </strong>
            {[...activeSeries]
              .reverse()
              .map((s) => {
                const v = lookup.get(`${s.label}|${hoverYear}`) ?? 0;
                if (v === 0 && activeSeries.length > 4) return null;
                const sh = hoverTotal > 0 ? fmtPct1((v / hoverTotal) * 100) : '—';
                return (
                  <div key={s.label} className="tooltip-row">
                    <span className="swatch" style={{ background: s.color }} />
                    <span className="tooltip-label">{s.label}</span>
                    <span className="tooltip-val">
                      {activeSeries.length === 1
                        ? fmtInt.format(v)
                        : mode === 'pct'
                          ? `${sh} (${fmtInt.format(v)})`
                          : `${fmtInt.format(v)} (${sh})`}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
      <div className="legend">
        {series.map((s) => {
          const isHidden = effectiveHidden.has(s.label);
          return series.length > 1 ? (
            <button
              key={s.label}
              type="button"
              className={`legend-item interactive${isHidden ? ' off' : ''}`}
              aria-pressed={!isHidden}
              onClick={() => toggleSeries(s.label)}
              title={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
            >
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </button>
          ) : (
            <span key={s.label} className="legend-item">
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          );
        })}
        {effectiveHidden.size > 0 && (
          <button type="button" className="legend-reset" onClick={() => setHidden(new Set())}>
            Show all
          </button>
        )}
      </div>
    </div>
  );
}

export function CategoryBars({
  data,
  onSelect,
  activeCategory,
}: {
  data: { category: string; v: number }[];
  onSelect?: (category: string) => void;
  activeCategory?: string;
}) {
  if (!data.length) return <p className="muted">No data.</p>;
  const max = Math.max(...data.map((d) => d.v));
  const total = data.reduce((a, d) => a + d.v, 0);
  return (
    <ul className="bars">
      {data.map((d) => {
        const share = total > 0 ? ((d.v / total) * 100).toFixed(1) : '0.0';
        const isActive = activeCategory === d.category;
        const inner = (
          <>
            <span className="bar-label">{d.category}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${max ? (d.v / max) * 100 : 0}%` }} />
            </span>
            <span className="bar-value">{fmtCompact.format(d.v)}</span>
          </>
        );
        return (
          <li
            key={d.category}
            className={isActive ? 'bar-active' : undefined}
            title={`${d.category}: ${fmtInt.format(d.v)} (${share}% of shown)${onSelect ? ' — click to filter' : ''}`}
          >
            {onSelect ? (
              <button
                type="button"
                className="bar-row-btn"
                aria-pressed={isActive}
                onClick={() => onSelect(d.category)}
              >
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface VintageRow {
  cohort: number;
  n: number;
  cells: (number | null)[];
  counts?: (number | null)[];
}

const VINTAGE_UNIT: Record<string, { head: string; who: string }> = {
  investigators: { head: 'Investigator vintage (first filed)', who: 'investigators' },
  sites: { head: 'Site vintage (first filed)', who: 'sites' },
  cro: { head: 'CRO vintage (first filed)', who: 'companies' },
  irb: { head: 'IRB vintage (first filed)', who: 'boards' },
};

export { vintageCellStyle };

export function VintageHeatmap({
  rows,
  kMax,
  unit = 'investigators',
  mode = 'attrition',
  nullTip = 'censored',
}: {
  rows: VintageRow[];
  kMax: number;
  unit?: 'investigators' | 'sites' | 'cro' | 'irb';
  mode?: 'attrition' | 'reentry';
  nullTip?: string;
}) {
  if (!rows.length) return <p className="muted">No data.</p>;
  const ks: number[] = [];
  for (let k = 0; k <= kMax; k++) ks.push(k);
  const u = VINTAGE_UNIT[unit];
  return (
    <div>
      <div className="table-scroll">
        <table className="vintage">
          <thead>
            <tr>
              <th>{u.head}</th>
              {ks.map((k) => (
                <th key={k} className="num">
                  +{k}y
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cohort}>
                <td>
                  <strong>{r.cohort}</strong>{' '}
                  <span className="muted">n={r.n.toLocaleString('en-US')}</span>
                </td>
                {r.cells.map((c, i) => {
                  const na = r.counts?.[i] ?? null;
                  const tip =
                    c === null
                      ? `${r.cohort} vintage: ${nullTip}`
                      : mode === 'attrition'
                        ? `${r.cohort} vintage, +${i}y: ${c.toFixed(1)}% of ${u.who} active` +
                          (na !== null
                            ? ` (${na.toLocaleString('en-US')} of ${r.n.toLocaleString('en-US')})`
                            : '')
                        : `${r.cohort} vintage, +${i}y: ${c.toFixed(1)}% of active ${u.who} re-entered after a gap` +
                          (na !== null ? ` (${na.toLocaleString('en-US')} re-entered)` : '');
                  return (
                    <td
                      key={i}
                      className="num vintage-cell"
                      style={
                        c === null
                          ? { background: 'var(--bg)', color: 'var(--muted)' }
                          : vintageCellStyle(c)
                      }
                      title={tip}
                    >
                      {c === null ? '·' : c.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="vintage-scale" aria-hidden="true">
        <span>0%</span>
        <span className="vintage-ramp" />
        <span>100%</span>
        <span className="vintage-na">· {nullTip}</span>
      </div>
    </div>
  );
}
