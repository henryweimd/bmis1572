import * as duckdb from '@duckdb/duckdb-wasm';
import { escapeLike, escapeLiteral, readerFor } from './lib/sql';

export { escapeLike, escapeLiteral, readerFor };

export interface ManifestDataset {
  id: string;
  title: string;
  format: 'parquet' | 'csv';
  files: string[];
  row_count: number;
  columns?: string[];
}

export interface Manifest {
  generated_at: string;
  generator: string;
  datasets: ManifestDataset[];
  demo: { file: string; row_count: number };
  versions?: Record<string, string>;
  definitions?: Record<string, string>;
  stats?: Record<string, unknown>;
  sources?: Record<string, unknown>;
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;
let queryQueue: Promise<unknown> = Promise.resolve();

const MAX_CACHE_ENTRIES = 250;
const queryCache = new Map<string, Promise<unknown[]>>();

function resolveAppBase(): string {
  const origin = window.location.origin;
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  return `${origin}${base}`;
}

/** Singleton DuckDB-WASM instance. Retries cleanly if initial load failed. */
export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const bundles = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(bundles);
        if (!bundle.mainWorker) throw new Error('DuckDB bundle has no worker script');
        // Same-origin Blob wrapper: lets the worker load its cross-origin CDN script.
        const workerUrl = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
        );
        const worker = new Worker(workerUrl);
        const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        if (bundle.pthreadWorker) {
          await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        } else {
          await db.instantiate(bundle.mainModule);
        }
        URL.revokeObjectURL(workerUrl);
        return db;
      } catch (err) {
        dbPromise = null;
        throw err;
      }
    })();
  }
  return dbPromise;
}

function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = getDb()
      .then((db) => db.connect())
      .catch((err) => {
        connPromise = null;
        throw err;
      });
  }
  return connPromise;
}

/** Serialize statements on the shared connection so single-threaded WASM never
 * races across concurrent Promise.all() calls. */
function runExclusive<T>(fn: (conn: duckdb.AsyncDuckDBConnection) => Promise<T>): Promise<T> {
  const next = queryQueue.then(async () => {
    const conn = await getConn();
    return fn(conn);
  });
  queryQueue = next.catch(() => undefined);
  return next;
}

export function clearQueryCache(): void {
  queryCache.clear();
}

/** Pipeline manifest when the full lake snapshot is present, else null (demo mode). */
export async function loadManifest(): Promise<{ manifest: Manifest | null; baseUrl: string }> {
  const baseUrl = resolveAppBase();
  try {
    const res = await fetch(`${baseUrl}/data/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return { manifest: null, baseUrl };
    return { manifest: (await res.json()) as Manifest, baseUrl };
  } catch {
    return { manifest: null, baseUrl };
  }
}

/** Create one SQL view per manifest dataset in a single batched round-trip;
 * in demo mode creates a single strict-only view over the committed demo CSV. */
export async function createViews(
  baseUrl: string,
  manifest: Manifest | null,
): Promise<string[]> {
  clearQueryCache();
  const views: string[] = [];
  const statements: string[] = [];

  if (manifest) {
    for (const ds of manifest.datasets) {
      const view = ds.id.replace(/-/g, '_');
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(view)) continue;
      const rel = ds.files[0].replace(/^\/+/, '');
      statements.push(
        `CREATE OR REPLACE VIEW ${view} AS SELECT * FROM ${readerFor(ds.format)}('${escapeLiteral(baseUrl)}/${escapeLiteral(rel)}')`,
      );
      views.push(view);
    }
  } else {
    statements.push(
      `CREATE OR REPLACE VIEW investigators_year_geo AS SELECT *, 'strict' AS version` +
        ` FROM read_csv_auto('${escapeLiteral(baseUrl)}/data/demo-investigators.csv')`,
    );
    views.push('investigators_year_geo');
  }

  if (statements.length) {
    await runExclusive(async (conn) => {
      await conn.query(statements.join(';\n'));
    });
  }
  return views;
}

/** Execute a read-only SQL query with in-flight deduplication and LRU caching
 * (safe because the served Parquet snapshot is immutable per session). */
export function query<T>(sql: string): Promise<T[]> {
  const cached = queryCache.get(sql);
  if (cached) {
    // Refresh recency for LRU eviction.
    queryCache.delete(sql);
    queryCache.set(sql, cached);
    return cached as Promise<T[]>;
  }

  const p = runExclusive(async (conn) => {
    const result = await conn.query(sql);
    return (result.toArray() as Array<{ toJSON(): T }>).map((row) => row.toJSON());
  }).catch((err) => {
    queryCache.delete(sql);
    throw err;
  });

  if (queryCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(sql, p as Promise<unknown[]>);
  return p;
}
