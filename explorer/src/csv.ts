export function downloadCsv(filename: string, cols: string[], rows: (string | number)[][]) {
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [cols, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv' });
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
  if (!series.length || !series[0].points.length) return;
  const n = series[0].points.length;
  downloadCsv(
    filename,
    ['year', ...series.map((s) => s.label)],
    Array.from({ length: n }, (_, i) => [
      series[0].points[i].x,
      ...series.map((s) => s.points[i]?.y ?? ''),
    ]),
  );
}
