import { useState } from 'react';

const fmtCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtVal = (v: number): string => (Number.isInteger(v) ? fmtInt.format(v) : v.toFixed(2));

export function TrendChart({ data }: { data: { d: string; v: number }[] }) {
  const W = 720;
  const H = 220;
  const P = { l: 52, r: 12, t: 12, b: 26 };
  if (!data.length) return <p className="muted">No data.</p>;
  const vs = data.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const x = (i: number) => P.l + (i / (data.length - 1 || 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const pts = data.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((i) => min + (span * i) / 3);
  const mid = data[Math.floor(data.length / 2)].d;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily total across ${data.length} days`}>
      <title>{`Daily total across ${data.length} days`}</title>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
            {fmtCompact.format(t)}
          </text>
        </g>
      ))}
      <polygon points={`${P.l},${H - P.b} ${pts} ${W - P.r},${H - P.b}`} className="area" />
      <polyline points={pts} className="line" />
      <text x={P.l} y={H - 8} className="tick">
        {data[0].d}
      </text>
      <text x={(P.l + W - P.r) / 2} y={H - 8} textAnchor="middle" className="tick">
        {mid}
      </text>
      <text x={W - P.r} y={H - 8} textAnchor="end" className="tick">
        {data[data.length - 1].d}
      </text>
    </svg>
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

export function MultiLineChart({ series }: { series: LineSeries[] }) {
  const W = 720;
  const H = 240;
  const P = { l: 52, r: 12, t: 12, b: 30 };
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points).filter((p) => p.y !== null) as { x: number; y: number }[];
  if (!all.length) return <p className="muted">No data.</p>;
  const yearSet = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const step = yearSet.length > 10 ? 2 : 1;
  const yearTicks = yearSet.filter((_, i) => i % step === 0);
  const x0 = Math.min(...yearSet);
  const x1 = Math.max(...yearSet);
  const vs = all.map((p) => p.y);
  const min = Math.min(0, ...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const x = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const ticks = [0, 1, 2, 3].map((i) => min + (span * i) / 3);
  const showDots = series.every((s) => s.points.length <= 30);

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

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const year = Math.round(x0 + ((px - P.l) / (W - P.l - P.r)) * (x1 - x0));
    const clamped = Math.min(x1, Math.max(x0, year));
    setHover(yearSet.includes(clamped) ? clamped : null);
  };

  const flip = hover !== null && (x(hover) - P.l) / (W - P.l - P.r) > 0.62;

  return (
    <div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.length} series over time`}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
                {fmtCompact.format(t)}
              </text>
            </g>
          ))}
          {yearSet.map((yr) => (
            <line key={`g${yr}`} x1={x(yr)} x2={x(yr)} y1={P.t} y2={H - P.b} className="grid grid-x" />
          ))}
          {yearTicks.map((yr) => (
            <text key={`t${yr}`} x={x(yr)} y={H - 8} textAnchor="middle" className="tick tick-x">
              {yr}
            </text>
          ))}
          {series.map((s) =>
            runs(s.points).map((pts, j) => (
              <polyline key={`${s.label}-${j}`} points={pts} fill="none" stroke={s.color} strokeWidth={2} />
            )),
          )}
          {showDots &&
            series.map((s) =>
              s.points
                .filter((p) => p.y !== null)
                .map((p) => (
                  <circle key={`${s.label}-${p.x}`} cx={x(p.x)} cy={y(p.y as number)} r={2.6} fill={s.color} />
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
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div
            className="tooltip"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: flip ? 'translate(-105%, 0)' : 'translate(5%, 0)',
            }}
          >
            <strong>{hover}</strong>
            {series.map((s) => {
              const p = s.points.find((pt) => pt.x === hover);
              return (
                <div key={s.label} className="tooltip-row">
                  <span className="swatch" style={{ background: s.color }} />
                  <span className="tooltip-label">{s.label}</span>
                  <span className="tooltip-val">{p?.y == null ? '—' : fmtVal(p.y)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface StackDatum {
  x: number;
  bottom: number;
  top: number;
}

export function StackedBars({
  data,
  labels,
  colors,
}: {
  data: StackDatum[];
  labels: [string, string];
  colors?: [string, string];
}) {
  const W = 720;
  const H = 240;
  const P = { l: 52, r: 12, t: 12, b: 30 };
  if (!data.length) return <p className="muted">No data.</p>;
  const [cBottom, cTop] = colors ?? ['#1f77b4', '#ff7f0e'];
  const max = Math.max(...data.map((d) => d.bottom + d.top)) || 1;
  const bw = (W - P.l - P.r) / data.length;
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const ticks = [0, 1, 2, 3].map((i) => (max * i) / 3);
  const step = data.length > 10 ? 2 : 1;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Stacked bars, ${data.length} years`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
              {fmtCompact.format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const bx = P.l + i * bw + bw * 0.15;
          const w = bw * 0.7;
          const yTop = y(d.bottom + d.top);
          const yMid = y(d.bottom);
          const yBase = y(0);
          return (
            <g key={d.x}>
              <rect x={bx} y={yMid} width={w} height={Math.max(0, yBase - yMid)} fill={cBottom}>
                <title>{`${d.x}: ${labels[0]} ${fmtInt.format(d.bottom)}, ${labels[1]} ${fmtInt.format(d.top)}`}</title>
              </rect>
              <rect x={bx} y={yTop} width={w} height={Math.max(0, yMid - yTop)} fill={cTop}>
                <title>{`${d.x}: ${labels[0]} ${fmtInt.format(d.bottom)}, ${labels[1]} ${fmtInt.format(d.top)}`}</title>
              </rect>
              {i % step === 0 && (
                <text x={bx + w / 2} y={H - 8} textAnchor="middle" className="tick tick-x">
                  {d.x}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: cBottom }} />
          {labels[0]}
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: cTop }} />
          {labels[1]}
        </span>
      </div>
    </div>
  );
}

export function CategoryBars({ data }: { data: { category: string; v: number }[] }) {
  if (!data.length) return <p className="muted">No data.</p>;
  const max = Math.max(...data.map((d) => d.v));
  return (
    <ul className="bars">
      {data.map((d) => (
        <li key={d.category}>
          <span className="bar-label">{d.category}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${max ? (d.v / max) * 100 : 0}%` }} />
          </span>
          <span className="bar-value">{fmtCompact.format(d.v)}</span>
        </li>
      ))}
    </ul>
  );
}

export interface VintageRow {
  cohort: number;
  n: number;
  cells: (number | null)[];
}

function vintageColor(v: number): string {
  const t = Math.min(1, Math.max(0, v / 100));
  const r = Math.round(255 - t * 232);
  const g = Math.round(255 - t * 207);
  const b = Math.round(255 - t * 149);
  return `rgb(${r},${g},${b})`;
}

export function VintageHeatmap({ rows, kMax }: { rows: VintageRow[]; kMax: number }) {
  if (!rows.length) return <p className="muted">No data.</p>;
  const ks: number[] = [];
  for (let k = 0; k <= kMax; k++) ks.push(k);
  return (
    <div className="table-scroll">
      <table className="vintage">
        <thead>
          <tr>
            <th>Vintage (first-seen year)</th>
            {ks.map((k) => (
              <th key={k}>+{k}y</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohort}>
              <td>
                {r.cohort} <span className="muted">n={r.n.toLocaleString('en-US')}</span>
              </td>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  style={c === null ? { background: '#f0f0f0', color: '#999' } : { background: vintageColor(c) }}
                  title={c === null ? `${r.cohort} vintage: censored` : `${r.cohort} vintage, +${i}y: ${c.toFixed(1)}% active`}
                >
                  {c === null ? '·' : c.toFixed(1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
