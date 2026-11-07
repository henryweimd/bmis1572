import { useEffect, useState } from 'react';
import { escapeLiteral, query } from './duckdb';
import { CategoryBars, MultiLineChart, StackedMultiBars } from './charts';

const CN_COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#7f7f7f'];
import type { LineSeries } from './charts';
import { intIn, pick, readHash, writeHash } from './hash';
import { downloadCsv, stackedCsv } from './csv';

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num0 = (v: unknown): number =>
  v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? 0 : Number(v);

interface CnSiteRow {
  id: string;
  zh: string;
  en: string;
  curated: boolean;
  prov: string;
  prove: string;
  pairs: number;
  rows: number;
  specs: number;
  year: number;
  topg: string;
}

interface CnLeaderRow {
  name: string;
  inst: number;
  rows: number;
  specs: number;
  provs: number;
  year: number;
  prov: string;
}

interface CnHit {
  id: number;
  name: string;
  inst: string;
  inste: string;
  prov: string;
  prove: string;
  rows: number;
  year: number;
}

interface CnAffRow {
  year: number;
  inst: string;
  inste: string;
  spec: string;
  spece: string | null;
  group: string;
  groupz: string;
  role: string;
  rolee: string;
  prov: string;
  prove: string;
}

export default function ChinaTab({
  demo,
  ready,
}: {
  demo: boolean;
  ready: boolean;
}) {
  const [hashInit] = useState(readHash);
  const [lang, setLang] = useState<'zh' | 'en'>(() => pick(hashInit['cn.l'], ['zh', 'en'] as const, 'zh'));
  const [prov, setProv] = useState(() => hashInit['cn.p'] ?? 'all');
  const [y0, setY0] = useState(() => intIn(hashInit['cn.y0'], 2019, 2025, 2019));
  const [y1, setY1] = useState(() => intIn(hashInit['cn.y1'], 2019, 2025, 2025));
  const [provs, setProvs] = useState<{ zh: string; en: string }[]>([]);
  const [kpi, setKpi] = useState<{ pairs: number; names: number; insts: number; specs: number; v20: number } | null>(null);
  const [vintStack, setVintStack] = useState<LineSeries[]>([]);
  const [cumline, setCumline] = useState<LineSeries[]>([]);
  const [newpairs, setNewpairs] = useState<{ category: string; v: number }[]>([]);
  const [specBars, setSpecBars] = useState<{ category: string; v: number }[]>([]);
  const [provBars, setProvBars] = useState<{ category: string; v: number }[]>([]);
  const [sites, setSites] = useState<CnSiteRow[]>([]);
  const [sizeBins, setSizeBins] = useState<{ category: string; v: number }[]>([]);
  const [siteSort, setSiteSort] = useState<'pairs' | 'rows'>(() =>
    pick(hashInit['cn.o'], ['pairs', 'rows'] as const, 'pairs'),
  );
  const [leaders, setLeaders] = useState<CnLeaderRow[]>([]);
  const [affil, setAffil] = useState<{ category: string; v: number }[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CnHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [sel, setSel] = useState<{ id: number; name: string } | null>(() => {
    const n = Number(hashInit['cn.s']);
    return Number.isInteger(n) && n >= 0 && hashInit['cn.sn'] ? { id: n, name: hashInit['cn.sn'] } : null;
  });
  const [affs, setAffs] = useState<CnAffRow[]>([]);
  const [siteSel, setSiteSel] = useState<{ id: string; name: string } | null>(null);
  const [siteMix, setSiteMix] = useState<{ category: string; v: number }[]>([]);
  const [siteInvs, setSiteInvs] = useState<{ name: string; n: number }[]>([]);
  const [note, setNote] = useState('');

  const zh = lang === 'zh';
  const yearOpts = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    (async () => {
      try {
        const pc = prov === 'all' ? '' : ` AND province_zh = '${escapeLiteral(prov)}'`;
        const [pl, k, vy, sb, pb, st, ld, ad, pv, sz] = await Promise.all([
          query<{ zh: string; en: string }>(
            `SELECT CAST(province_zh AS VARCHAR) AS zh, CAST(province_en AS VARCHAR) AS en` +
              ` FROM cn_province_year GROUP BY 1, 2 ORDER BY 1`,
          ),
          query<{ pairs: number; names: number; insts: number; specs: number; v20: number }>(
            `SELECT (SELECT COUNT(*) FROM cn_person_index) AS pairs,` +
              ` (SELECT COUNT(*) FROM cn_leaderboard) AS names,` +
              ` (SELECT COUNT(*) FROM cn_site_index) AS insts,` +
              ` (SELECT COUNT(DISTINCT group_en) FROM cn_specialty_year) AS specs,` +
              ` (SELECT SUM(n_pairs) FROM cn_filing_year WHERE year = 2020) AS v20`,
          ),
          query<{ y: number; n: number; nn: number; c: number }>(
            `SELECT CAST(year AS INTEGER) AS y, CAST(SUM(n_pairs) AS DOUBLE) AS n,` +
              ` CAST(SUM(n_new_pairs) AS DOUBLE) AS nn, CAST(MAX(cum_pairs) AS DOUBLE) AS c` +
              ` FROM cn_filing_year WHERE year BETWEEN ${y0} AND ${y1} AND year >= 2021` +
              ` GROUP BY 1 ORDER BY 1`,
          ),
          query<{ g: string; gz: string; n: number }>(
            `SELECT CAST(group_en AS VARCHAR) AS g, CAST(group_zh AS VARCHAR) AS gz,` +
              ` CAST(SUM(n_pairs) AS DOUBLE) AS n FROM cn_specialty_year` +
              ` WHERE year BETWEEN ${y0} AND ${y1} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`,
          ),
          query<{ p: string; pe: string; n: number }>(
            `SELECT CAST(province_zh AS VARCHAR) AS p, CAST(province_en AS VARCHAR) AS pe,` +
              ` CAST(SUM(n_pairs) AS DOUBLE) AS n FROM cn_province_year` +
              ` WHERE year BETWEEN ${y0} AND ${y1}${pc} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`,
          ),
          query<CnSiteRow>(
            `SELECT CAST(inst_id AS VARCHAR) AS id, CAST(name_zh AS VARCHAR) AS zh,` +
              ` CAST(name_en AS VARCHAR) AS en, CAST(name_en_curated AS BOOLEAN) AS curated,` +
              ` CAST(province_zh AS VARCHAR) AS prov, CAST(province_en AS VARCHAR) AS prove,` +
              ` CAST(n_pairs AS INTEGER) AS pairs, CAST(n_rows AS INTEGER) AS rows,` +
              ` CAST(n_spec AS INTEGER) AS specs, CAST(filing_year AS INTEGER) AS year,` +
              ` CAST(top_group_en AS VARCHAR) AS topg FROM cn_site_index WHERE 1 = 1${pc}` +
              ` AND filing_year BETWEEN ${y0} AND ${y1}` +
              ` ORDER BY ${siteSort === 'rows' ? 'n_rows DESC' : 'n_pairs DESC'} LIMIT 25`,
          ),
          query<CnLeaderRow>(
            `SELECT CAST(name_zh AS VARCHAR) AS name, CAST(n_inst AS INTEGER) AS inst,` +
              ` CAST(n_rows AS INTEGER) AS rows, CAST(n_spec AS INTEGER) AS specs,` +
              ` CAST(n_prov AS INTEGER) AS provs, CAST(first_year AS INTEGER) AS year,` +
              ` CAST(province_zh AS VARCHAR) AS prov FROM cn_leaderboard WHERE 1 = 1${pc}` +
              ` AND first_year BETWEEN ${y0} AND ${y1} ORDER BY n_rows DESC, n_inst DESC LIMIT 25`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CASE WHEN n_inst >= 6 THEN '6+' ELSE CAST(n_inst AS VARCHAR) END AS category,` +
              ` CAST(COUNT(*) AS DOUBLE) AS v, MIN(n_inst) AS o FROM cn_leaderboard` +
              ` WHERE 1 = 1${pc} AND first_year BETWEEN ${y0} AND ${y1}` +
              ` GROUP BY 1 ORDER BY 3`,
          ).catch(() => []),
          query<{ y: number; p: string; n: number }>(
            `SELECT CAST(year AS INTEGER) AS y,` +
              ` CAST(${zh ? 'province_zh' : 'province_en'} AS VARCHAR) AS p,` +
              ` CAST(SUM(n_pairs) AS DOUBLE) AS n FROM cn_province_year` +
              ` WHERE year BETWEEN ${y0} AND ${y1} AND year >= 2021${pc}` +
              ` GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
          ).catch(() => []),
          query<{ category: string; v: number }>(
            `SELECT CASE WHEN n_pairs < 5 THEN '1-4' WHEN n_pairs < 15 THEN '5-14'` +
              ` WHEN n_pairs < 40 THEN '15-39' WHEN n_pairs < 100 THEN '40-99'` +
              ` ELSE '100+' END AS category, CAST(COUNT(*) AS DOUBLE) AS v,` +
              ` MIN(n_pairs) AS o FROM cn_site_index WHERE 1 = 1${pc}` +
              ` AND filing_year BETWEEN ${y0} AND ${y1} GROUP BY 1 ORDER BY 3`,
          ).catch(() => []),
        ]);
        if (cancelled) return;
        setProvs(pl);
        setKpi({ pairs: num0(k[0]?.pairs), names: num0(k[0]?.names), insts: num0(k[0]?.insts), specs: num0(k[0]?.specs), v20: num0(k[0]?.v20) });
        const provTotals = new Map<string, number>();
        for (const r of pv) provTotals.set(r.p, (provTotals.get(r.p) ?? 0) + num0(r.n));
        const topProv = [...provTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([p]) => p);
        const vyears = [...new Set(pv.map((r) => r.y))].sort((a, b) => a - b);
        const at = (y: number, pred: (p: string) => boolean): number =>
          pv.filter((r) => r.y === y && pred(r.p)).reduce((a, r) => a + num0(r.n), 0);
        const stack: LineSeries[] = topProv.map((p, i) => ({
          label: p,
          color: CN_COLORS[i % CN_COLORS.length],
          points: vyears.map((y) => ({ x: y, y: at(y, (q) => q === p) })),
        }));
        if (topProv.length < provTotals.size) {
          stack.push({
            label: zh ? '其他' : 'Other',
            color: '#7f7f7f',
            points: vyears.map((y) => ({ x: y, y: at(y, (q) => !topProv.includes(q)) })),
          });
        }
        setVintStack(stack);
        setNewpairs(vy.map((r) => ({ category: String(r.y), v: num0(r.nn) })));
        setCumline([
          {
            label: 'Cumulative unique pairs',
            color: '#d62728',
            points: vy.map((r) => ({ x: r.y, y: num0(r.c) })),
          },
        ]);
        setSpecBars(sb.map((r) => ({ category: zh ? `${r.gz} ${r.g}` : r.g, v: num0(r.n) })));
        setProvBars(pb.map((r) => ({ category: zh ? r.p : r.pe, v: num0(r.n) })));
        setSites(st);
        setSizeBins(sz.map((r) => ({ category: r.category, v: num0(r.v) })));
        setLeaders(ld);
        setAffil(ad.map((r) => ({ category: `${r.category} institution${r.category === '1' ? '' : 's'}`, v: num0(r.v) })));
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`China query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, demo, prov, y0, y1, siteSort, lang]);

  useEffect(() => {
    if (!ready || demo || !sel) {
      setAffs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await query<CnAffRow>(
          `SELECT CAST(filing_year AS INTEGER) AS year, CAST(inst_zh AS VARCHAR) AS inst,` +
            ` CAST(inst_en AS VARCHAR) AS inste, CAST(specialty_zh AS VARCHAR) AS spec,` +
            ` CAST(specialty_en AS VARCHAR) AS spece, CAST(group_en AS VARCHAR) AS "group",` +
            ` CAST(group_zh AS VARCHAR) AS groupz, CAST(role_zh AS VARCHAR) AS role,` +
            ` CAST(role_en AS VARCHAR) AS rolee, CAST(province_zh AS VARCHAR) AS prov,` +
            ` CAST(province_en AS VARCHAR) AS prove FROM cn_person_rows` +
            ` WHERE pair_id = ${sel.id} ORDER BY filing_year DESC LIMIT 200`,
        );
        if (cancelled) return;
        setAffs(r);
      } catch (e) {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, sel]);

  useEffect(() => {
    if (!ready || demo || !siteSel) {
      setSiteMix([]);
      setSiteInvs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [mx, iv] = await Promise.all([
          query<{ category: string; v: number }>(
            `SELECT CAST(r.group_en AS VARCHAR) AS category, CAST(COUNT(DISTINCT r.pair_id) AS DOUBLE) AS v` +
              ` FROM cn_person_rows r JOIN cn_person_index i ON r.pair_id = i.pair_id` +
              ` WHERE i.inst_id = '${escapeLiteral(siteSel.id)}' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
          ).catch(() => [] as { category: string; v: number }[]),
          query<{ name: string; n: number }>(
            `SELECT CAST(name_zh AS VARCHAR) AS name, CAST(n_rows AS INTEGER) AS n` +
              ` FROM cn_person_index WHERE inst_id = '${escapeLiteral(siteSel.id)}'` +
              ` ORDER BY n_rows DESC, name_zh LIMIT 100`,
          ).catch(() => [] as { name: string; n: number }[]),
        ]);
        if (cancelled) return;
        setSiteMix(mx);
        setSiteInvs(iv);
      } catch (e) {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, siteSel]);

  useEffect(() => {
    writeHash({
      'cn.l': lang,
      'cn.p': prov,
      'cn.y0': String(y0),
      'cn.y1': String(y1),
      'cn.o': siteSort,
      'cn.s': sel ? String(sel.id) : '',
      'cn.sn': sel ? sel.name : '',
    });
  }, [lang, prov, y0, y1, siteSort, sel]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || demo || q.trim().length < 1) return;
    const needle = `%${escapeLiteral(q.trim())}%`;
    try {
      const r = await query<CnHit>(
        `SELECT CAST(pair_id AS INTEGER) AS id, CAST(name_zh AS VARCHAR) AS name,` +
          ` CAST(inst_zh AS VARCHAR) AS inst, CAST(inst_en AS VARCHAR) AS inste,` +
          ` CAST(province_zh AS VARCHAR) AS prov, CAST(province_en AS VARCHAR) AS prove,` +
          ` CAST(n_rows AS INTEGER) AS rows, CAST(filing_year AS INTEGER) AS year` +
          ` FROM cn_person_index WHERE name_zh LIKE '${needle}' ORDER BY n_rows DESC LIMIT 50`,
      );
      setHits(r);
      setSearched(true);
    } catch (e2) {
      setNote(`Investigator search failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }

  if (demo) return <p className="muted">Run the pipeline for China data.</p>;

  return (
    <>
      {note && <p className="banner">{note}</p>}
      <p className="banner">
        Partial CFDI extract (not the full registry) · filing year is institution registration vintage,
        not investigator activity · Chinese is authoritative; EN labels are curated or pattern-derived.
      </p>
      <section className="panel controls">
        <div className="filters">
          <div className="seg" role="group" aria-label="Language">
            <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')} title="Show Chinese labels">
              中文
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')} title="Show English labels">
              EN
            </button>
          </div>
          <label>
            Province
            <select value={prov} onChange={(e) => setProv(e.target.value)}>
              <option value="all">All provinces</option>
              {provs.map((p) => (
                <option key={p.zh} value={p.zh}>
                  {zh ? p.zh : p.en}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <select
              value={y0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setY0(v);
                if (v > y1) setY1(v);
              }}
            >
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select
              value={y1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setY1(v);
                if (v < y0) setY0(v);
              }}
            >
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">Names stay in Chinese in both modes.</span>
        </div>
      </section>

      <section className="panel">
        <p>
          <strong>About this data:</strong> China&apos;s National Medical Products Administration
          (NMPA, 国家药品监督管理局) oversees drug trials through its Center for Food and Drug
          Inspection (CFDI, 食品药品审核查验中心), which operates the public filing system for
          clinical trial institutions (药物和医疗器械临床试验机构备案系统). Institutions file
          (备案) their trial units — specialties, sites, and principal investigators — and anyone
          can query the registry by institution, province, specialty, or investigator name.{' '}
          <a
            href="https://beian.cfdi.org.cn/CTMDS/apps/pub/drugPublic1.jsp"
            target="_blank"
            rel="noreferrer"
          >
            Open the CFDI public query portal
          </a>
          . This tab analyzes a partial extract of the drug-institution filings (retrieved
          2026-11-06), not the live system: coverage is incomplete, filing year marks
          registration vintage (bulk 2019–2020 wave), and person = (name, institution) pair.
        </p>
      </section>

      <section className="kpis">
        <div className="kpi">
          <span className="kpi-label">Investigator-institution pairs</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.pairs) : '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Distinct names · institutions</span>
          <span className="kpi-value">
            {kpi ? `${fmtInt.format(kpi.names)} · ${fmtInt.format(kpi.insts)}` : '—'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Specialty groups</span>
          <span className="kpi-value">{kpi ? fmtInt.format(kpi.specs) : '—'}</span>
        </div>
      </section>
      <p className="caption">
        Pairs count affiliations, not humans: one person at two institutions = two pairs, while two
        same-named people at one institution = one pair (common names such as 张伟 collide across
        institutions and are not mobility). Rows are exact-deduped at ingest; the 2020 bulk filing
        captured the registry stock at once, so totals read as roster size, not trial activity.
      </p>

      <section className="panel">
        <h2>Registry by filing vintage</h2>
        <StackedMultiBars series={vintStack} allTicks />
        <p className="caption">
          Investigator-institution pairs at institutions filed each year (2021+), top 6 provinces
          plus others. Toggle 100% for yearly share. The 2020 bulk-registration spike (
          {kpi ? fmtInt.format(kpi.v20) : '—'} pairs) is omitted from the graph; cumulative
          registry {kpi ? fmtInt.format(kpi.pairs) : '—'} pairs.{' '}
          {!!vintStack.length && (
            <button
              className="btn"
              onClick={() => stackedCsv('china-vintage-by-province.csv', vintStack)}
            >
              CSV
            </button>
          )}
        </p>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Cumulative unique pairs</h2>
          <MultiLineChart series={cumline} />
          <p className="caption">
            Each investigator-institution pair counted once, at its first vintage. Nearly flat
            after 2020: the registry was loaded in the bulk wave.
          </p>
        </div>
        <div className="panel">
          <h2>New unique pairs by vintage</h2>
          <CategoryBars data={newpairs} />
          <p className="caption">
            First-seen pairs per vintage — true registry growth, no cross-year repeats.
          </p>
        </div>
      </section>

      <section className="panels">
        <div className="panel">
          <h2>Top specialty groups</h2>
          <CategoryBars data={specBars} />
          <p className="caption">
            Investigator-institution pairs by specialty group. 1,937 raw specialty strings grouped
            (3.9% Other).
          </p>
        </div>
        <div className="panel">
          <h2>Top provinces</h2>
          <CategoryBars data={provBars} />
        </div>
      </section>

      <section className="panel">
        <h2>Top institutions{prov === 'all' ? '' : `: ${zh ? prov : provs.find((p) => p.zh === prov)?.en ?? prov}`}</h2>
        <div className="filters">
          <div className="seg" role="group" aria-label="Site sort">
            <button
              className={siteSort === 'pairs' ? 'active' : ''}
              onClick={() => setSiteSort('pairs')}
              title="Rank by investigator pairs"
            >
              Pairs
            </button>
            <button
              className={siteSort === 'rows' ? 'active' : ''}
              onClick={() => setSiteSort('rows')}
              title="Rank by affiliation rows"
            >
              Rows
            </button>
          </div>
          <span className="muted">
            Pairs = investigator-institution pairs. Click a row for detail. * = curated EN; else pattern translation.
          </span>
          {!!sites.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  'china-top-sites.csv',
                  ['name_zh', 'name_en', 'curated_en', 'province', 'pairs', 'rows', 'specialties', 'filing_year', 'top_group'],
                  sites.map((r) => [r.zh, r.en, r.curated ? 'yes' : 'no', r.prov, r.pairs, r.rows, r.specs, r.year, r.topg]),
                )
              }
            >
              CSV
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Institution</th>
                <th>Province</th>
                <th>Pairs</th>
                <th>Rows</th>
                <th>Specs</th>
                <th>Filed</th>
                <th>Top group</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSiteSel({ id: r.id, name: zh ? r.zh : r.en })}
                  className={siteSel?.id === r.id ? 'picked' : 'pickable'}
                >
                  <td>
                    {zh ? r.zh : r.en}
                    {!zh && !r.curated && ' *'}
                    <br />
                    <span className="muted">{zh ? (r.curated ? r.en : '') : r.zh}</span>
                  </td>
                  <td>{zh ? r.prov : r.prove}</td>
                  <td>{fmtInt.format(r.pairs)}</td>
                  <td>{fmtInt.format(r.rows)}</td>
                  <td>{r.specs}</td>
                  <td>{r.year}</td>
                  <td>{r.topg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {siteSel && (
        <section className="panel">
          <h2>{siteSel.name}</h2>
          <h3>Specialty mix (investigator-institution pairs)</h3>
          <CategoryBars data={siteMix} />
          <h3>
            Investigators <span className="muted">· top 100 by affiliations</span>
          </h3>
          {siteInvs.length ? (
            <div className="table-scroll short">
              <table>
                <thead>
                  <tr>
                    <th>Investigator</th>
                    <th>Affiliations</th>
                  </tr>
                </thead>
                <tbody>
                  {siteInvs.map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td>{r.name}</td>
                      <td>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No investigators found.</p>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Institutions by pair count</h2>
        <CategoryBars data={sizeBins} />
        <p className="caption">
          Institutions grouped by investigator-institution pairs (same province and filing-vintage
          filters as the leaderboard). A long tail of small filers sits beside a few
          mega-sites with 100+ pairs.
        </p>
      </section>

      <section className="panel">
        <h2>Names by institution count</h2>
        <CategoryBars data={affil} />
        <p className="caption">
          How many institutions each distinct name spans (same filters as the leaderboard). The
          long tail is dominated by common-name collision, not mobility — e.g. the top name spans
          27 institutions. Pairs, not names, are the person unit.
        </p>
      </section>

      <section className="panel">
        <h2>
          Top investigators by affiliations{' '}
          {!!leaders.length && (
            <button
              className="btn"
              onClick={() =>
                downloadCsv(
                  'china-top-investigators.csv',
                  ['investigator', 'sites', 'affiliations', 'specialties', 'provinces', 'first_filed'],
                  leaders.map((r) => [r.name, r.inst, r.rows, r.specs, r.provs, r.year]),
                )
              }
            >
              CSV
            </button>
          )}
        </h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Investigator</th>
                <th>Sites</th>
                <th>Affiliations</th>
                <th>Specialties</th>
                <th>Provinces</th>
                <th>First filed</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td>{r.name}</td>
                  <td>{r.inst}</td>
                  <td>{r.rows}</td>
                  <td>{r.specs}</td>
                  <td>{r.provs}</td>
                  <td>{r.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">
          Name-level: common names across institutions may conflate distinct people. Click a name in
          search results for affiliation rows.
        </p>
      </section>

      <section className="panel">
        <h2>Search investigators</h2>
        <form className="filters" onSubmit={runSearch}>
          <label>
            Name (Chinese)
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 张彬" size={24} />
          </label>
          <button type="submit" className="btn">
            Search
          </button>
          {searched && <span className="muted">{hits.length} matches (top 50 by affiliations)</span>}
          {!!hits.length && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadCsv(
                  'china-search.csv',
                  ['investigator', 'institution_zh', 'institution_en', 'province_zh', 'province_en', 'affiliations', 'filed'],
                  hits.map((r) => [r.name, r.inst, r.inste, r.prov, r.prove, r.rows, r.year]),
                )
              }
            >
              CSV
            </button>
          )}
        </form>
        {!!hits.length && (
          <div className="table-scroll short">
            <table>
              <thead>
                <tr>
                  <th>Investigator</th>
                  <th>Institution</th>
                  <th>Province</th>
                  <th>Affiliations</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSel({ id: r.id, name: r.name })}
                    className={sel?.id === r.id ? 'picked' : 'pickable'}
                  >
                    <td>{r.name}</td>
                    <td>{zh ? r.inst : r.inste}</td>
                    <td>{zh ? r.prov : r.prove}</td>
                    <td>{r.rows}</td>
                    <td>{r.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sel && (
          <>
            <h3>
              {sel.name} <span className="muted">· affiliation rows</span>{' '}
              {!!affs.length && (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    downloadCsv(
                      'china-affiliations.csv',
                      ['filed', 'institution_zh', 'institution_en', 'specialty_zh', 'specialty_en', 'group_zh', 'group_en', 'role_zh', 'role_en', 'province_zh', 'province_en'],
                      affs.map((r) => [r.year, r.inst ?? '', r.inste ?? '', r.spec ?? '', r.spece ?? '', r.groupz ?? '', r.group ?? '', r.role ?? '', r.rolee ?? '', r.prov ?? '', r.prove ?? '']),
                    )
                  }
                >
                  CSV
                </button>
              )}
            </h3>
            {affs.length ? (
              <div className="table-scroll short">
                <table>
                  <thead>
                    <tr>
                      <th>Filed</th>
                      <th>Institution</th>
                      <th>Specialty</th>
                      <th>Group</th>
                      <th>Role</th>
                      <th>Province</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affs.map((r, i) => (
                      <tr key={i}>
                        <td>{r.year}</td>
                        <td>{zh ? r.inst : r.inste}</td>
                        <td>
                          {r.spec}
                          {!zh && r.spece && <span className="muted"> · {r.spece}</span>}
                        </td>
                        <td>{zh ? r.groupz : r.group}</td>
                        <td>{zh ? r.role : r.rolee}</td>
                        <td>{zh ? r.prov : r.prove}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No rows.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}
