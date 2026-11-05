const fmtCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

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
  const P = { l: 52, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.points).filter((p) => p.y !== null) as { x: number; y: number }[];
  if (!all.length) return <p className="muted">No data.</p>;
  const xs = all.map((p) => p.x);
  const vs = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const min = Math.min(0, ...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const x = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const ticks = [0, 1, 2, 3].map((i) => min + (span * i) / 3);

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

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.length} series over time`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
              {fmtCompact.format(t)}
            </text>
          </g>
        ))}
        {series.map((s) =>
          runs(s.points).map((pts, j) => (
            <polyline key={`${s.label}-${j}`} points={pts} fill="none" stroke={s.color} strokeWidth={2} />
          )),
        )}
        <text x={P.l} y={H - 8} className="tick">
          {x0}
        </text>
        <text x={(P.l + W - P.r) / 2} y={H - 8} textAnchor="middle" className="tick">
          {Math.round((x0 + x1) / 2)}
        </text>
        <text x={W - P.r} y={H - 8} textAnchor="end" className="tick">
          {x1}
        </text>
      </svg>
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
  const P = { l: 52, r: 12, t: 12, b: 26 };
  if (!data.length) return <p className="muted">No data.</p>;
  const [cBottom, cTop] = colors ?? ['#1f77b4', '#ff7f0e'];
  const max = Math.max(...data.map((d) => d.bottom + d.top)) || 1;
  const bw = (W - P.l - P.r) / data.length;
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const ticks = [0, 1, 2, 3].map((i) => (max * i) / 3);
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
              <rect x={bx} y={yMid} width={w} height={Math.max(0, yBase - yMid)} fill={cBottom} />
              <rect x={bx} y={yTop} width={w} height={Math.max(0, yMid - yTop)} fill={cTop} />
            </g>
          );
        })}
        <text x={P.l} y={H - 8} className="tick">
          {data[0].x}
        </text>
        <text x={W - P.r} y={H - 8} textAnchor="end" className="tick">
          {data[data.length - 1].x}
        </text>
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
