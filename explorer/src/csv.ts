export function formatCsvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(cols: string[], rows: (string | number | null | undefined)[][]): string {
  return [cols, ...rows].map((r) => r.map(formatCsvCell).join(',')).join('\r\n');
}

export function downloadCsv(
  filename: string,
  cols: string[],
  rows: (string | number | null | undefined)[][],
): void {
  // Prepend UTF-8 BOM so Excel displays Chinese/Unicode labels without mojibake.
  const text = `\uFEFF${buildCsv(cols, rows)}`;
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export interface TrendPoint {
  d: string;
  v: number;
}

export function trendCsv(filename: string, data: TrendPoint[]): void {
  downloadCsv(
    filename,
    ['year', 'value'],
    data.map((r) => [r.d, r.v]),
  );
}

export interface StackSeries {
  label: string;
  points: { x: number; y: number | null }[];
}

export function stackedCsv(filename: string, series: StackSeries[]): void {
  if (!series.length) return;
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  if (!xs.length) return;
  const maps = series.map((s) => new Map(s.points.map((p) => [p.x, p.y])));
  downloadCsv(
    filename,
    ['year', ...series.map((s) => s.label)],
    xs.map((x) => [x, ...maps.map((m) => m.get(x) ?? '')]),
  );
}
