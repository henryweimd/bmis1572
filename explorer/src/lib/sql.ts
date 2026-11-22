export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/** Escape a substring for SQL `LIKE '%...%' ESCAPE '\'` so user-typed `%`, `_`,
 * `\`, and `'` behave literally instead of as wildcards or syntax errors. */
export function escapeLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/'/g, "''");
}

export function readerFor(format: 'parquet' | 'csv'): string {
  return format === 'parquet' ? 'read_parquet' : 'read_csv_auto';
}
