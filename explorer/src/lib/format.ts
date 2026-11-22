export const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const fmtCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Number.isInteger(v)) return fmtInt.format(v);
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);
}

export function fmtPct1(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function num0(v: unknown): number {
  return num(v) ?? 0;
}

export function pct(v: number | null, decimals = 1): string {
  return v === null ? '—' : `${(v * 100).toFixed(decimals)}%`;
}

export function growthPct(current: number | undefined, baseline: number | undefined): string | null {
  if (current === undefined || baseline === undefined || baseline <= 0) return null;
  const g = ((current - baseline) / baseline) * 100;
  return `${g >= 0 ? '+' : ''}${g.toFixed(1)}`;
}

/** Client twin of the pipeline's name_key normalization (ASCII-folded,
 * uppercase, letters/spaces only) — output is LIKE-safe by construction. */
export function normName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function yearRange(min: number, max: number): number[] {
  const out: number[] = [];
  for (let y = min; y <= max; y++) out.push(y);
  return out;
}

export function clampYearPair(a: number, b: number, min: number, max: number): [number, number] {
  const lo = Math.min(max, Math.max(min, Math.min(a, b)));
  const hi = Math.min(max, Math.max(min, Math.max(a, b)));
  return [lo, hi];
}

export interface RawVintageRow {
  cohort: number;
  k: number;
  v: number;
  n: number;
  na: number;
}

export interface PivotedVintageRow {
  cohort: number;
  n: number;
  cells: (number | null)[];
  counts: (number | null)[];
}

export function pivotVintage(rows: RawVintageRow[], kMax: number): PivotedVintageRow[] {
  const byVintage = new Map<number, { n: number; m: Map<number, number>; c: Map<number, number> }>();
  for (const r of rows) {
    let e = byVintage.get(r.cohort);
    if (!e) {
      e = { n: num0(r.n), m: new Map(), c: new Map() };
      byVintage.set(r.cohort, e);
    }
    e.n = num0(r.n);
    e.m.set(r.k, num0(r.v) * 100);
    e.c.set(r.k, num0(r.na));
  }
  return [...byVintage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cohort, e]) => ({
      cohort,
      n: e.n,
      cells: Array.from({ length: kMax + 1 }, (_, k) => e.m.get(k) ?? null),
      counts: Array.from({ length: kMax + 1 }, (_, k) => e.c.get(k) ?? null),
    }));
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Teal heatmap cell background + WCAG-verified foreground text color. */
export function vintageCellStyle(v: number): { background: string; color: string } {
  const t = Math.min(1, Math.max(0, v / 100));
  const r = Math.round(244 - t * 233);
  const g = Math.round(249 - t * 167);
  const b = Math.round(247 - t * 170);
  const lum = relativeLuminance(r, g, b);
  const darkLum = relativeLuminance(15, 23, 20); // #0f1714
  const whiteContrast = contrastRatio(1, lum);
  const darkContrast = contrastRatio(lum, darkLum);
  return {
    background: `rgb(${r},${g},${b})`,
    color: whiteContrast >= darkContrast ? '#ffffff' : '#0f1714',
  };
}
