import * as duckdb from '@duckdb/duckdb-wasm';

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

/** Singleton DuckDB-WASM instance. Uses the single-threaded build unless the
 * page is cross-origin isolated, so no special server headers are needed. */
export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
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
    })();
  }
  return dbPromise;
}

/** Pipeline manifest when the full lake snapshot is present, else null (demo mode). */
export async function loadManifest(): Promise<{ manifest: Manifest | null; baseUrl: string }> {
  const baseUrl = window.location.origin;
  try {
    const res = await fetch(`${baseUrl}/data/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return { manifest: null, baseUrl };
    return { manifest: (await res.json()) as Manifest, baseUrl };
  } catch {
    return { manifest: null, baseUrl };
  }
}

export function readerFor(format: 'parquet' | 'csv'): string {
  return format === 'parquet' ? 'read_parquet' : 'read_csv_auto';
}

/** Create one SQL view per manifest dataset; in demo mode a single strict-only
 * view over the committed demo CSV. */
export async function createViews(
  baseUrl: string,
  manifest: Manifest | null,
): Promise<string[]> {
  const db = await getDb();
  const conn = await db.connect();
  const views: string[] = [];
  try {
    if (manifest) {
      for (const ds of manifest.datasets) {
        const view = ds.id.replace(/-/g, '_');
        await conn.query(
          `CREATE OR REPLACE VIEW ${view} AS SELECT * FROM ${readerFor(ds.format)}('${baseUrl}/${ds.files[0]}')`,
        );
        views.push(view);
      }
    } else {
      await conn.query(
        `CREATE OR REPLACE VIEW investigators_year_geo AS SELECT *, 'strict' AS version` +
          ` FROM read_csv_auto('${baseUrl}/data/demo-investigators.csv')`,
      );
      views.push('investigators_year_geo');
    }
  } finally {
    await conn.close();
  }
  return views;
}

export async function query<T>(sql: string): Promise<T[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    return (result.toArray() as Array<{ toJSON(): T }>).map((row) => row.toJSON());
  } finally {
    await conn.close();
  }
}

export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
