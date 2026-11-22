import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCsv, formatCsvCell } from '../src/csv.ts';
import { intIn, parseHashString, pick, serializeHash } from '../src/hash.ts';
import {
  clampYearPair,
  contrastRatio,
  fmtVal,
  growthPct,
  normName,
  num,
  num0,
  pct,
  pivotVintage,
  relativeLuminance,
  vintageCellStyle,
} from '../src/lib/format.ts';
import { escapeLike, escapeLiteral, readerFor } from '../src/lib/sql.ts';
import { serializeShortlistMarkdown } from '../src/lib/shortlistFormat.ts';

test('format helpers handle edge values cleanly', () => {
  assert.equal(num(null), null);
  assert.equal(num(undefined), null);
  assert.equal(num(''), null);
  assert.equal(num(NaN), null);
  assert.equal(num('42.5'), 42.5);
  assert.equal(num0(null), 0);
  assert.equal(pct(null), '—');
  assert.equal(pct(0.493), '49.3%');
  assert.equal(growthPct(125, 100), '+25.0');
  assert.equal(growthPct(80, 100), '-20.0');
  assert.equal(growthPct(10, 0), null);
  assert.equal(fmtVal(1234), '1,234');
  assert.equal(fmtVal(2.456), '2.46');
  assert.equal(fmtVal(Infinity), '—');
});

test('normName mirrors pipeline ASCII-folded uppercase name_key', () => {
  assert.equal(normName('  Müller-Schmidt, José  '), 'MULLERSCHMIDT JOSE');
  assert.equal(normName("O'Connor 123%"), 'OCONNOR');
});

test('clampYearPair orders and clamps endpoints', () => {
  assert.deepEqual(clampYearPair(2024, 2015, 2008, 2026), [2015, 2024]);
  assert.deepEqual(clampYearPair(1999, 2035, 2008, 2026), [2008, 2026]);
});

test('pivotVintage groups cohorts and preserves nulls for right-censored lags', () => {
  const rows = pivotVintage(
    [
      { cohort: 2024, k: 0, v: 1.0, n: 100, na: 100 },
      { cohort: 2024, k: 1, v: 0.25, n: 100, na: 25 },
      { cohort: 2023, k: 0, v: 1.0, n: 200, na: 200 },
    ],
    2,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cohort, 2023);
  assert.deepEqual(rows[0].cells, [100, null, null]);
  assert.equal(rows[1].cohort, 2024);
  assert.deepEqual(rows[1].cells, [100, 25, null]);
  assert.deepEqual(rows[1].counts, [100, 25, null]);
});

test('CSV escaping handles commas, quotes, CR/LF, and CJK', () => {
  assert.equal(formatCsvCell('plain'), 'plain');
  assert.equal(formatCsvCell('a,b'), '"a,b"');
  assert.equal(formatCsvCell('say "hi"'), '"say ""hi"""');
  assert.equal(formatCsvCell('line1\r\nline2'), '"line1\r\nline2"');
  assert.equal(formatCsvCell('张彬'), '张彬');
  assert.equal(buildCsv(['a', 'b'], [['x,1', 2]]), 'a,b\r\n"x,1",2');
});

test('hash parsing, serialization, pick, and intIn', () => {
  const parsed = parseHashString('#t=feas&feas.b=Europe%20(EU%2BUK)&bad=%E0%A4%A');
  assert.equal(parsed.t, 'feas');
  assert.equal(parsed['feas.b'], 'Europe (EU+UK)');
  assert.equal(parsed.bad, undefined);

  assert.equal(serializeHash({ t: 'overview', empty: '', v: 'strict' }), 't=overview&v=strict');
  assert.equal(pick('strict', ['strict', 'merged'] as const, 'merged'), 'strict');
  assert.equal(pick('bogus', ['strict', 'merged'] as const, 'merged'), 'merged');
  assert.equal(intIn('2020', 2008, 2026, 2008), 2020);
  assert.equal(intIn('', 2008, 2026, 2015), 2015);
  assert.equal(intIn('9999', 2008, 2026, 2015), 2026);
});

test('SQL escaping protects literals and LIKE wildcards', () => {
  assert.equal(escapeLiteral("O'Brien"), "O''Brien");
  assert.equal(escapeLike("100% _test\\O'Brien"), "100\\% \\_test\\\\O''Brien");
  assert.equal(readerFor('parquet'), 'read_parquet');
  assert.equal(readerFor('csv'), 'read_csv_auto');
});

test('vintageCellStyle maintains strong contrast across 0..100%', () => {
  for (let v = 0; v <= 100; v += 5) {
    const { background, color } = vintageCellStyle(v);
    const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(background);
    assert.ok(m, `unexpected background ${background}`);
    const bgLum = relativeLuminance(Number(m[1]), Number(m[2]), Number(m[3]));
    const fgLum = color === '#ffffff' ? 1 : relativeLuminance(15, 23, 20);
    const ratio = contrastRatio(bgLum, fgLum);
    assert.ok(ratio >= 4.2, `v=${v}% contrast ${ratio.toFixed(2)} below floor`);
  }
  assert.equal(vintageCellStyle(0).color, '#0f1714');
  assert.equal(vintageCellStyle(100).color, '#ffffff');
});

test('serializeShortlistMarkdown formats sites and investigators cleanly', () => {
  const md = serializeShortlistMarkdown(
    [
      {
        site_id: 'strict:42',
        site_n: 42,
        version: 'strict',
        name: 'MD Anderson | Cancer Ctr',
        city: 'HOUSTON',
        state: 'TX',
        country: 'USA',
        n_inv: 847,
        n_receipts: 5390,
        first_year: 2008,
        last_year: 2026,
        ctgov_plausible: 2900,
        ctgov_strong: 1467,
      },
    ],
    [
      {
        person_id: 'S:1',
        display_name: 'SMITH, JANE',
        site: 'MD Anderson',
        country: 'USA',
        n_trials: 42,
        n_years: 10,
        first_year: 2015,
        last_year: 2025,
        linked_trials: 8,
      },
    ],
  );
  assert.match(md, /MD Anderson \/ Cancer Ctr/);
  assert.match(md, /HOUSTON, TX, USA/);
  assert.match(md, /2900 \(1467\)/);
  assert.match(md, /SMITH, JANE/);
});
