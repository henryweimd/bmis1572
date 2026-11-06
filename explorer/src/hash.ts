/** URL-hash view state: shareable, bookmarkable filter state.
 * Writers merge into the existing hash so the investigator tab and the org
 * tabs can share it without clobbering each other's keys. */

export function readHash(): Record<string, string> {
  const out: Record<string, string> = {};
  const h = window.location.hash.replace(/^#/, '');
  if (!h) return out;
  for (const part of h.split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
    } catch {
      /* ignore malformed pairs */
    }
  }
  return out;
}

export function writeHash(patch: Record<string, string>): void {
  const cur = readHash();
  Object.assign(cur, patch);
  const s = Object.entries(cur)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  window.history.replaceState(null, '', s ? `#${s}` : window.location.pathname);
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
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
