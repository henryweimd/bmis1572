/** URL-hash view state: shareable, bookmarkable filter state.
 * Writers merge into the existing hash so tabs share it without clobbering
 * each other's keys; empty-string patches delete keys to keep URLs tidy. */

export function parseHashString(hash: string): Record<string, string> {
  const out: Record<string, string> = {};
  const h = hash.replace(/^#/, '');
  if (!h) return out;
  for (const part of h.split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      const k = decodeURIComponent(part.slice(0, i));
      const v = decodeURIComponent(part.slice(i + 1));
      if (k) out[k] = v;
    } catch {
      /* ignore malformed pairs */
    }
  }
  return out;
}

export function serializeHash(obj: Record<string, string>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function readHash(): Record<string, string> {
  return parseHashString(window.location.hash);
}

export function writeHash(patch: Record<string, string>): void {
  const cur = readHash();
  for (const [k, v] of Object.entries(patch)) {
    if (v === '') delete cur[k];
    else cur[k] = v;
  }
  const s = serializeHash(cur);
  const next = s ? `#${s}` : window.location.pathname;
  if ((s ? `#${s}` : '') !== window.location.hash) {
    window.history.replaceState(null, '', next);
  }
}

export function pick<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function intIn(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
