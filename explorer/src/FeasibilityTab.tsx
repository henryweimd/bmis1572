import { useEffect, useMemo, useRef, useState } from 'react';
import { escapeLike, escapeLiteral, query } from './duckdb';
import { CategoryBars, StackedMultiBars } from './charts';
import { DataTable } from './components/DataTable';
import type { ColumnDef } from './components/DataTable';
import { IconBookmark, IconExternal, IconInfo } from './components/Icons';
import { intIn, pick, readHash, writeHash } from './hash';
import {
  BANDS,
  LATEST_FULL,
  THERAPEUTIC_AREAS,
  TRIAL_PHASES,
} from './lib/constants';
import { fmtInt, fmtPhase, normName, num0 } from './lib/format';
import { useShortlist } from './lib/shortlist';
import type { FeasibilityPreset } from './OverviewTab';

interface SiteCandidate {
  site_id: string;
  site_n: number;
  name: string;
  addr: string;
  city: string;
  state: string;
  country: string;
  band: string;
  n_inv: number;
  n_receipts: number;
  first_year: number;
  last_year: number;
  n_years: number;
  n_variants: number;
  ct_plausible: number;
  ct_strong: number;
  ta_trials: number;
  phase_trials: number;
}

interface PiCandidate {
  person_id: string;
  display_name: string;
  site: string;
  city: string;
  state: string;
  country: string;
  band: string;
  n_trials: number;
  n_years: number;
  first_year: number;
  last_year: number;
  linked_trials: number;
  strong_links: number;
}

interface SiteDossier {
  site: SiteCandidate;
  yearly: { y: number; invs: number }[];
  tamix: { category: string; v: number }[];
  phasemix: { category: string; v: number }[];
  xcheck: { n: number; ns: number; fac: string; sib: number; samp: string } | null;
  sampTrials: { nct: string; sponsor: string; phase: string; ta: string }[];
  roster: { person_id: string; name: string; country: string; n: number; n_trials: number; first_year: number; last_year: number }[];
}

interface PiDossier {
  pi: PiCandidate;
  receipts: { rcvd: string; site: string; city: string; state: string; country: string; site_n: number }[];
  linked: { nct: string; role: string; tier: string; sponsor: string; phase: string; ta: string; start_y: number | null }[];
  colleagues: { person_id: string; display_name: string; n_trials: number; first_year: number; last_year: number }[];
}

export default function FeasibilityTab({
  ready,
  demo,
  preset,
  onJumpSite,
  onJumpInvestigator,
  onJumpDefinition,
  onOpenShortlist,
}: {
  ready: boolean;
  demo: boolean;
  preset: (FeasibilityPreset & { seq: number }) | null;
  onJumpSite: (siteN: number, version?: 'strict' | 'merged') => void;
  onJumpInvestigator: (name: string) => void;
  onJumpDefinition: (term: string) => void;
  onOpenShortlist: () => void;
}) {
  const [hashInit] = useState(readHash);
  const [mode, setMode] = useState<'sites' | 'pis'>(() =>
    pick(hashInit['feas.m'], ['sites', 'pis'] as const, 'sites'),
  );
  const [ver, setVer] = useState<'strict' | 'merged'>(() =>
    pick(hashInit['feas.v'], ['strict', 'merged'] as const, 'strict'),
  );
  const [band, setBand] = useState(() => pick(hashInit['feas.b'], ['all', ...BANDS], 'United States'));
  const [stateFilter, setStateFilter] = useState(() => hashInit['feas.st'] ?? 'all');
  const [countryFilter, setCountryFilter] = useState(() => hashInit['feas.co'] ?? 'all');
  const [ta, setTa] = useState(() => pick(hashInit['feas.ta'], ['all', ...THERAPEUTIC_AREAS], 'all'));
  const [phase, setPhase] = useState(() => pick(hashInit['feas.ph'], ['all', ...TRIAL_PHASES], 'all'));
  const [minYear, setMinYear] = useState(() => intIn(hashInit['feas.ry'], 0, 2026, 2023));
  const [minInv, setMinInv] = useState(() => intIn(hashInit['feas.mi'], 1, 500, 1));
  const [minRefs, setMinRefs] = useState(() => intIn(hashInit['feas.mr'], 1, 500, 2));
  const [xcheckMode, setXcheckMode] = useState<'all' | 'matched' | 'strong'>(() =>
    pick(hashInit['feas.xc'], ['all', 'matched', 'strong'] as const, 'all'),
  );
  const [linkMode, setLinkMode] = useState<'all' | 'any' | 'strong'>(() =>
    pick(hashInit['feas.lk'], ['all', 'any', 'strong'] as const, 'all'),
  );
  const [keyword, setKeyword] = useState(() => hashInit['feas.q'] ?? '');
  const [debouncedKw, setDebouncedKw] = useState(() => hashInit['feas.q'] ?? '');

  const [usStates, setUsStates] = useState<string[]>([]);
  const [countryOpts, setCountryOpts] = useState<string[]>([]);
  const [siteRows, setSiteRows] = useState<SiteCandidate[]>([]);
  const [siteSummary, setSiteSummary] = useState<{
    total: number;
    active25: number;
    totalInv: number;
    xchecked: number;
  } | null>(null);
  const [siteByGeo, setSiteByGeo] = useState<{ category: string; v: number }[]>([]);
  const [siteByTa, setSiteByTa] = useState<{ category: string; v: number }[]>([]);
  const [piRows, setPiRows] = useState<PiCandidate[]>([]);
  const [piSummary, setPiSummary] = useState<{
    total: number;
    active25: number;
    linked: number;
    avgRefs: number;
  } | null>(null);
  const [piByGeo, setPiByGeo] = useState<{ category: string; v: number }[]>([]);

  const [siteDossier, setSiteDossier] = useState<SiteDossier | null>(null);
  const [piDossier, setPiDossier] = useState<PiDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [note, setNote] = useState('');

  const dossierSeq = useRef(0);
  const { hasSite, hasPi, toggleSite, togglePi, totalCount } = useShortlist();

  // Debounce keyword typing so DuckDB queries don't fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKw(keyword), 220);
    return () => clearTimeout(t);
  }, [keyword]);

  // Apply incoming preset from Overview pathways.
  useEffect(() => {
    if (!preset) return;
    setMode(preset.mode);
    setTa(preset.ta ?? 'all');
    setPhase(preset.phase ?? 'all');
    setBand(preset.band ?? 'United States');
    setStateFilter(preset.state ?? 'all');
    setCountryFilter('all');
    setMinYear(preset.minYear ?? 2023);
    setMinInv(preset.minInv ?? 1);
    setMinRefs(preset.minRefs ?? 2);
    setLinkMode(preset.linkMode ?? 'all');
    setXcheckMode('all');
    setKeyword('');
    setDebouncedKw('');
    setSiteDossier(null);
    setPiDossier(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.seq]);

  useEffect(() => {
    writeHash({
      'feas.m': mode,
      'feas.v': ver,
      'feas.b': band,
      'feas.st': stateFilter === 'all' ? '' : stateFilter,
      'feas.co': countryFilter === 'all' ? '' : countryFilter,
      'feas.ta': ta === 'all' ? '' : ta,
      'feas.ph': phase === 'all' ? '' : phase,
      'feas.ry': String(minYear),
      'feas.mi': String(minInv),
      'feas.mr': String(minRefs),
      'feas.xc': xcheckMode === 'all' ? '' : xcheckMode,
      'feas.lk': linkMode === 'all' ? '' : linkMode,
      'feas.q': debouncedKw.trim(),
    });
  }, [mode, ver, band, stateFilter, countryFilter, ta, phase, minYear, minInv, minRefs, xcheckMode, linkMode, debouncedKw]);

  // Populate US state & country options once.
  useEffect(() => {
    if (!ready || demo) return;
    let cancelled = false;
    Promise.all([
      query<{ st: string }>(
        `SELECT DISTINCT CAST(state AS VARCHAR) AS st FROM site_index` +
          ` WHERE country = 'USA' AND state IS NOT NULL AND state <> '' AND state <> 'NG' ORDER BY 1`,
      ),
      query<{ c: string }>(
        `SELECT CAST(country AS VARCHAR) AS c FROM site_index` +
          ` WHERE version = 'strict' AND country IS NOT NULL AND country <> '' AND country <> 'NG'` +
          ` GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 80`,
      ),
    ])
      .then(([stRows, coRows]) => {
        if (!cancelled) {
          setUsStates(stRows.map((r) => r.st));
          setCountryOpts(coRows.map((r) => r.c));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, demo]);

  // Query Site Feasibility Pool.
  useEffect(() => {
    if (!ready || demo || mode !== 'sites') return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const where: string[] = [`s.version = '${ver}'`, `s.n_inv_ever >= ${minInv}`];
        if (band !== 'all') where.push(`s.band = '${escapeLiteral(band)}'`);
        if (stateFilter !== 'all') where.push(`s.state = '${escapeLiteral(stateFilter)}'`);
        if (countryFilter !== 'all') where.push(`s.country = '${escapeLiteral(countryFilter)}'`);
        if (minYear > 0) where.push(`s.last_year >= ${minYear}`);
        if (xcheckMode === 'matched') where.push(`COALESCE(x.n_plausible, 0) >= 1`);
        if (xcheckMode === 'strong') where.push(`COALESCE(x.n_strong, 0) >= 10`);

        const kw = debouncedKw.trim().toUpperCase();
        if (kw.length >= 2) {
          const pat = `%${escapeLike(kw)}%`;
          where.push(
            `(UPPER(s.display_name) LIKE '${pat}' ESCAPE '\\'` +
              ` OR UPPER(s.city) LIKE '${pat}' ESCAPE '\\'` +
              ` OR UPPER(s.display_addr) LIKE '${pat}' ESCAPE '\\')`,
          );
        }

        const taJoin =
          ta === 'all'
            ? ''
            : ` JOIN (SELECT site_n, CAST(SUM(n_trials) AS INTEGER) AS ta_trials FROM site_ta_mix` +
              ` WHERE version = '${ver}' AND ta = '${escapeLiteral(ta)}' GROUP BY 1) t ON t.site_n = s.site_n`;
        const phJoin =
          phase === 'all'
            ? ''
            : ` JOIN (SELECT site_n, CAST(SUM(n_trials) AS INTEGER) AS phase_trials FROM site_ctgov_phase_mix` +
              ` WHERE version = '${ver}' AND phase = '${escapeLiteral(phase)}' GROUP BY 1) p ON p.site_n = s.site_n`;

        const fromSql =
          `FROM site_index s` +
          ` LEFT JOIN site_ctgov_xcheck x ON x.version = s.version AND x.site_n = s.site_n` +
          `${taJoin}${phJoin} WHERE ${where.join(' AND ')}`;

        const orderSql =
          ta !== 'all'
            ? 'ta_trials DESC, s.n_receipts DESC'
            : phase !== 'all'
              ? 'phase_trials DESC, s.n_receipts DESC'
              : 's.n_receipts DESC';

        const geoCol = band === 'United States' ? 's.state' : 's.country';

        const [sumRows, topRows, geoDist, taDist] = await Promise.all([
          query<{ total: number; active25: number; totalInv: number; xchecked: number }>(
            `SELECT CAST(COUNT(*) AS DOUBLE) AS total,` +
              ` CAST(SUM(CASE WHEN s.last_year >= ${LATEST_FULL} THEN 1 ELSE 0 END) AS DOUBLE) AS active25,` +
              ` CAST(SUM(s.n_inv_ever) AS DOUBLE) AS totalInv,` +
              ` CAST(SUM(CASE WHEN COALESCE(x.n_plausible, 0) > 0 THEN 1 ELSE 0 END) AS DOUBLE) AS xchecked ` +
              fromSql,
          ),
          query<SiteCandidate>(
            `SELECT CAST(s.site_id AS VARCHAR) AS site_id, CAST(s.site_n AS INTEGER) AS site_n,` +
              ` CAST(s.display_name AS VARCHAR) AS name, CAST(s.display_addr AS VARCHAR) AS addr,` +
              ` CAST(s.city AS VARCHAR) AS city, CAST(s.state AS VARCHAR) AS state,` +
              ` CAST(s.country AS VARCHAR) AS country, CAST(s.band AS VARCHAR) AS band,` +
              ` CAST(s.n_inv_ever AS INTEGER) AS n_inv, CAST(s.n_receipts AS INTEGER) AS n_receipts,` +
              ` CAST(s.first_year AS INTEGER) AS first_year, CAST(s.last_year AS INTEGER) AS last_year,` +
              ` CAST(s.n_years AS INTEGER) AS n_years, CAST(s.n_variants AS INTEGER) AS n_variants,` +
              ` CAST(COALESCE(x.n_plausible, 0) AS INTEGER) AS ct_plausible,` +
              ` CAST(COALESCE(x.n_strong, 0) AS INTEGER) AS ct_strong,` +
              ` CAST(${ta === 'all' ? '0' : 't.ta_trials'} AS INTEGER) AS ta_trials,` +
              ` CAST(${phase === 'all' ? '0' : 'p.phase_trials'} AS INTEGER) AS phase_trials ` +
              `${fromSql} ORDER BY ${orderSql} LIMIT 150`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CAST(${geoCol} AS VARCHAR) AS category, CAST(COUNT(*) AS DOUBLE) AS v ` +
              `${fromSql} AND ${geoCol} IS NOT NULL AND ${geoCol} <> '' AND ${geoCol} <> 'NG'` +
              ` GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CAST(tm.ta AS VARCHAR) AS category, CAST(COUNT(DISTINCT tm.site_n) AS DOUBLE) AS v ` +
              `FROM site_ta_mix tm JOIN (SELECT s.site_n ${fromSql}) pool ON pool.site_n = tm.site_n` +
              ` WHERE tm.version = '${ver}' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
          ).catch(() => []),
        ]);

        if (cancelled) return;
        setSiteSummary({
          total: num0(sumRows[0]?.total),
          active25: num0(sumRows[0]?.active25),
          totalInv: num0(sumRows[0]?.totalInv),
          xchecked: num0(sumRows[0]?.xchecked),
        });
        setSiteRows(topRows);
        setSiteByGeo(geoDist.map((r) => ({ category: r.category, v: num0(r.v) })));
        setSiteByTa(taDist.map((r) => ({ category: r.category, v: num0(r.v) })));
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`Site feasibility query failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, mode, ver, band, stateFilter, countryFilter, ta, phase, minYear, minInv, xcheckMode, debouncedKw]);

  // Query PI Feasibility Pool.
  useEffect(() => {
    if (!ready || demo || mode !== 'pis') return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const where: string[] = [`p.n_trials >= ${minRefs}`];
        if (band !== 'all') where.push(`p.band = '${escapeLiteral(band)}'`);
        if (stateFilter !== 'all') where.push(`p.state = '${escapeLiteral(stateFilter)}'`);
        if (countryFilter !== 'all') where.push(`p.country = '${escapeLiteral(countryFilter)}'`);
        if (minYear > 0) where.push(`p.last_year >= ${minYear}`);

        const kw = debouncedKw.trim();
        if (kw.length >= 2) {
          const nk = normName(kw);
          const pat = `%${escapeLike(kw.toUpperCase())}%`;
          const clauses = [
            `UPPER(p.site) LIKE '${pat}' ESCAPE '\\'`,
            `UPPER(p.city) LIKE '${pat}' ESCAPE '\\'`,
          ];
          if (nk.length >= 2) clauses.unshift(`p.name_key LIKE '%${nk}%'`);
          where.push(`(${clauses.join(' OR ')})`);
        }

        const needsLink = linkMode !== 'all' || ta !== 'all' || phase !== 'all';
        const linkFilters: string[] = [];
        if (linkMode === 'strong') linkFilters.push(`l.tier = 'strong'`);
        if (ta !== 'all') {
          const tEsc = escapeLike(ta);
          linkFilters.push(`o.ta LIKE '%${tEsc}%' ESCAPE '\\'`);
        }
        if (phase !== 'all') linkFilters.push(`o.phase = '${escapeLiteral(phase)}'`);
        const linkWhere = linkFilters.length ? ` WHERE ${linkFilters.join(' AND ')}` : '';

        const linkSub =
          `(SELECT l.person_id, COUNT(DISTINCT l.nct) AS linked_trials,` +
          ` COUNT(DISTINCT CASE WHEN l.tier = 'strong' THEN l.nct END) AS strong_links` +
          ` FROM person_ctgov_link l` +
          (ta !== 'all' || phase !== 'all'
            ? ` JOIN ctgov_officials o ON o.nct = l.nct AND o.name_raw = l.off_name`
            : '') +
          `${linkWhere} GROUP BY 1) lk`;

        const joinType = needsLink ? 'JOIN' : 'LEFT JOIN';
        const fromSql = `FROM person_index p ${joinType} ${linkSub} ON lk.person_id = p.person_id WHERE ${where.join(' AND ')}`;
        const geoCol = band === 'United States' ? 'p.state' : 'p.country';

        const [sumRows, topRows, geoDist] = await Promise.all([
          query<{ total: number; active25: number; linked: number; avgRefs: number }>(
            `SELECT CAST(COUNT(*) AS DOUBLE) AS total,` +
              ` CAST(SUM(CASE WHEN p.last_year >= ${LATEST_FULL} THEN 1 ELSE 0 END) AS DOUBLE) AS active25,` +
              ` CAST(SUM(CASE WHEN COALESCE(lk.linked_trials, 0) > 0 THEN 1 ELSE 0 END) AS DOUBLE) AS linked,` +
              ` CAST(AVG(p.n_trials) AS DOUBLE) AS avgRefs ` +
              fromSql,
          ),
          query<PiCandidate>(
            `SELECT CAST(p.person_id AS VARCHAR) AS person_id, CAST(p.display_name AS VARCHAR) AS display_name,` +
              ` CAST(COALESCE(p.site, '') AS VARCHAR) AS site, CAST(COALESCE(p.city, '') AS VARCHAR) AS city,` +
              ` CAST(COALESCE(p.state, '') AS VARCHAR) AS state, CAST(p.country AS VARCHAR) AS country,` +
              ` CAST(p.band AS VARCHAR) AS band, CAST(p.n_trials AS INTEGER) AS n_trials,` +
              ` CAST(p.n_years AS INTEGER) AS n_years, CAST(p.first_year AS INTEGER) AS first_year,` +
              ` CAST(p.last_year AS INTEGER) AS last_year,` +
              ` CAST(COALESCE(lk.linked_trials, 0) AS INTEGER) AS linked_trials,` +
              ` CAST(COALESCE(lk.strong_links, 0) AS INTEGER) AS strong_links ` +
              `${fromSql} ORDER BY ${needsLink ? 'linked_trials DESC, p.n_trials DESC' : 'p.n_trials DESC'} LIMIT 150`,
          ),
          query<{ category: string; v: number }>(
            `SELECT CAST(${geoCol} AS VARCHAR) AS category, CAST(COUNT(*) AS DOUBLE) AS v ` +
              `${fromSql} AND ${geoCol} IS NOT NULL AND ${geoCol} <> '' AND ${geoCol} <> 'NG'` +
              ` GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
          ),
        ]);

        if (cancelled) return;
        setPiSummary({
          total: num0(sumRows[0]?.total),
          active25: num0(sumRows[0]?.active25),
          linked: num0(sumRows[0]?.linked),
          avgRefs: num0(sumRows[0]?.avgRefs),
        });
        setPiRows(topRows);
        setPiByGeo(geoDist.map((r) => ({ category: r.category, v: num0(r.v) })));
        setNote('');
      } catch (e) {
        if (cancelled) return;
        setNote(`PI feasibility query failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, demo, mode, band, stateFilter, countryFilter, ta, phase, minYear, minRefs, linkMode, debouncedKw]);

  const inspectSite = async (site: SiteCandidate) => {
    const seq = ++dossierSeq.current;
    setDossierLoading(true);
    try {
      const col = ver === 'strict' ? 'site_strict' : 'site_merged';
      const yr = 'EXTRACT(YEAR FROM CAST(rcvd AS DATE))';
      const [yy, tm, pm, xq, ros] = await Promise.all([
        query<{ y: number; invs: number }>(
          `SELECT CAST(${yr} AS INTEGER) AS y, CAST(COUNT(DISTINCT person_id) AS DOUBLE) AS invs` +
            ` FROM person_receipts WHERE ${col} = ${site.site_n} GROUP BY 1 ORDER BY 1`,
        ),
        query<{ category: string; v: number }>(
          `SELECT CAST(ta AS VARCHAR) AS category, CAST(SUM(n_trials) AS DOUBLE) AS v` +
            ` FROM site_ta_mix WHERE version = '${ver}' AND site_n = ${site.site_n}` +
            ` GROUP BY 1 ORDER BY 2 DESC`,
        ).catch(() => []),
        query<{ category: string; v: number }>(
          `SELECT CAST(phase AS VARCHAR) AS category, CAST(SUM(n_trials) AS DOUBLE) AS v` +
            ` FROM site_ctgov_phase_mix WHERE version = '${ver}' AND site_n = ${site.site_n}` +
            ` GROUP BY 1 ORDER BY 2 DESC`,
        ).catch(() => []),
        query<{ n: number; ns: number; fac: string; sib: number; samp: string }>(
          `SELECT CAST(n_plausible AS INTEGER) AS n, CAST(n_strong AS INTEGER) AS ns,` +
            ` CAST(sample_fac AS VARCHAR) AS fac, CAST(n_sibling_sites AS INTEGER) AS sib,` +
            ` CAST(sample AS VARCHAR) AS samp FROM site_ctgov_xcheck` +
            ` WHERE version = '${ver}' AND site_n = ${site.site_n}`,
        ).catch(() => []),
        query<{ person_id: string; name: string; country: string; n: number; n_trials: number; first_year: number; last_year: number }>(
          `SELECT CAST(i.person_id AS VARCHAR) AS person_id, CAST(i.display_name AS VARCHAR) AS name,` +
            ` CAST(i.country AS VARCHAR) AS country, CAST(COUNT(*) AS INTEGER) AS n,` +
            ` CAST(i.n_trials AS INTEGER) AS n_trials, CAST(i.first_year AS INTEGER) AS first_year,` +
            ` CAST(i.last_year AS INTEGER) AS last_year` +
            ` FROM person_receipts r JOIN person_index i ON r.person_id = i.person_id` +
            ` WHERE r.${col} = ${site.site_n} GROUP BY 1, 2, 3, 5, 6, 7 ORDER BY 4 DESC LIMIT 60`,
        ).catch(() => []),
      ]);
      const sampNcts = (xq[0]?.samp ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      const sampTrials = sampNcts.length
        ? await query<{ nct: string; sponsor: string; phase: string; ta: string }>(
            `SELECT CAST(nct AS VARCHAR) AS nct, CAST(sponsor_disp AS VARCHAR) AS sponsor,` +
              ` CAST(phase AS VARCHAR) AS phase, CAST(ta AS VARCHAR) AS ta FROM ctgov_trials` +
              ` WHERE nct IN (${sampNcts.map((n) => `'${escapeLiteral(n)}'`).join(',')})`,
          ).catch(() => [])
        : [];
      if (seq !== dossierSeq.current) return;
      setSiteDossier({
        site,
        yearly: yy.map((r) => ({ y: r.y, invs: num0(r.invs) })),
        tamix: tm.map((r) => ({ category: r.category, v: num0(r.v) })),
        phasemix: pm.map((r) => ({ category: r.category, v: num0(r.v) })),
        xcheck: xq[0] ?? null,
        sampTrials,
        roster: ros,
      });
      setTimeout(() => document.getElementById('feas-dossier')?.scrollIntoView({ behavior: 'smooth' }), 40);
    } catch (e) {
      if (seq === dossierSeq.current) {
        setNote(`Site dossier failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      if (seq === dossierSeq.current) setDossierLoading(false);
    }
  };

  const inspectPi = async (pi: PiCandidate) => {
    const seq = ++dossierSeq.current;
    setDossierLoading(true);
    try {
      const pid = escapeLiteral(pi.person_id);
      const [rc, lk, cg] = await Promise.all([
        query<{ rcvd: string; site: string; city: string; state: string; country: string; site_n: number }>(
          `SELECT CAST(rcvd AS VARCHAR) AS rcvd, CAST(COALESCE(site, '') AS VARCHAR) AS site,` +
            ` CAST(COALESCE(city, '') AS VARCHAR) AS city, CAST(COALESCE(state, '') AS VARCHAR) AS state,` +
            ` CAST(country AS VARCHAR) AS country, CAST(site_strict AS INTEGER) AS site_n` +
            ` FROM person_receipts WHERE person_id = '${pid}' ORDER BY rcvd DESC LIMIT 200`,
        ),
        query<{ nct: string; role: string; tier: string; sponsor: string; phase: string; ta: string; start_y: number | null }>(
          `SELECT CAST(l.nct AS VARCHAR) AS nct, CAST(l.role AS VARCHAR) AS role,` +
            ` CAST(l.tier AS VARCHAR) AS tier, CAST(o.sponsor_disp AS VARCHAR) AS sponsor,` +
            ` CAST(o.phase AS VARCHAR) AS phase, CAST(o.ta AS VARCHAR) AS ta,` +
            ` CAST(o.start_y AS INTEGER) AS start_y` +
            ` FROM person_ctgov_link l JOIN ctgov_officials o ON o.nct = l.nct AND o.name_raw = l.off_name` +
            ` WHERE l.person_id = '${pid}' ORDER BY o.start_y DESC NULLS LAST, l.nct`,
        ).catch(() => []),
        query<{ person_id: string; display_name: string; n_trials: number; first_year: number; last_year: number }>(
          `SELECT CAST(q.person_id AS VARCHAR) AS person_id, CAST(q.display_name AS VARCHAR) AS display_name,` +
            ` CAST(q.n_trials AS INTEGER) AS n_trials, CAST(q.first_year AS INTEGER) AS first_year,` +
            ` CAST(q.last_year AS INTEGER) AS last_year FROM person_index q` +
            ` JOIN person_index me ON me.person_id = '${pid}' AND q.site = me.site` +
            ` WHERE q.person_id != '${pid}' ORDER BY q.n_trials DESC LIMIT 12`,
        ).catch(() => []),
      ]);
      if (seq !== dossierSeq.current) return;
      setPiDossier({ pi, receipts: rc, linked: lk, colleagues: cg });
      setTimeout(() => document.getElementById('feas-dossier')?.scrollIntoView({ behavior: 'smooth' }), 40);
    } catch (e) {
      if (seq === dossierSeq.current) {
        setNote(`Investigator dossier failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      if (seq === dossierSeq.current) setDossierLoading(false);
    }
  };

  const resetFilters = () => {
    setBand('United States');
    setStateFilter('all');
    setCountryFilter('all');
    setTa('all');
    setPhase('all');
    setMinYear(2023);
    setMinInv(1);
    setMinRefs(2);
    setXcheckMode('all');
    setLinkMode('all');
    setKeyword('');
    setDebouncedKw('');
  };

  const siteColumns = useMemo<ColumnDef<SiteCandidate>[]>(() => {
    const cols: ColumnDef<SiteCandidate>[] = [
      {
        key: 'save',
        label: 'Save',
        render: (r) => {
          const saved = hasSite(r.site_id);
          return (
            <button
              type="button"
              className={`icon-btn star-btn${saved ? ' saved' : ''}`}
              title={saved ? 'Remove from shortlist' : 'Add site to feasibility shortlist'}
              aria-label={saved ? `Remove ${r.name} from shortlist` : `Shortlist ${r.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleSite({
                  site_id: r.site_id,
                  site_n: r.site_n,
                  version: ver,
                  name: r.name,
                  addr: r.addr,
                  city: r.city,
                  state: r.state,
                  country: r.country,
                  band: r.band,
                  n_inv: r.n_inv,
                  n_receipts: r.n_receipts,
                  first_year: r.first_year,
                  last_year: r.last_year,
                  ctgov_plausible: r.ct_plausible,
                  ctgov_strong: r.ct_strong,
                });
              }}
            >
              <IconBookmark filled={saved} />
            </button>
          );
        },
      },
      {
        key: 'name',
        label: 'Research Site',
        sortValue: (r) => r.name,
        csvValue: (r) => r.name,
        render: (r) => (
          <div>
            <strong>{r.name}</strong>
            <div className="cell-sub muted">{r.addr}</div>
          </div>
        ),
      },
      {
        key: 'loc',
        label: 'Location',
        sortValue: (r) => `${r.state} ${r.city}`,
        csvValue: (r) => `${r.city}, ${r.state !== 'NG' ? r.state : ''} ${r.country}`.trim(),
        render: (r) => (
          <>
            {r.city}
            {r.state && r.state !== 'NG' ? `, ${r.state}` : ''} · {r.country}
          </>
        ),
      },
      {
        key: 'n_inv',
        label: 'Invs',
        align: 'right',
        sortValue: (r) => r.n_inv,
        csvValue: (r) => r.n_inv,
        render: (r) => fmtInt.format(r.n_inv),
      },
      {
        key: 'n_receipts',
        label: 'IND Refs',
        align: 'right',
        sortValue: (r) => r.n_receipts,
        csvValue: (r) => r.n_receipts,
        render: (r) => fmtInt.format(r.n_receipts),
      },
      {
        key: 'ct',
        label: 'CT.gov (Strong)',
        align: 'right',
        sortValue: (r) => r.ct_plausible,
        csvValue: (r) => r.ct_plausible,
        title: 'Plausible / strong institution×city CT.gov matches (experimental)',
        render: (r) =>
          r.ct_plausible > 0 ? (
            <span>
              {fmtInt.format(r.ct_plausible)}{' '}
              <span className="muted">({fmtInt.format(r.ct_strong)})</span>
            </span>
          ) : (
            <span className="muted">—</span>
          ),
      },
    ];
    if (ta !== 'all') {
      cols.push({
        key: 'ta_trials',
        label: `${ta} Trials`,
        align: 'right',
        sortValue: (r) => r.ta_trials,
        csvValue: (r) => r.ta_trials,
        render: (r) => <span className="pill">{fmtInt.format(r.ta_trials)}</span>,
      });
    }
    if (phase !== 'all') {
      cols.push({
        key: 'phase_trials',
        label: `${phase} Trials`,
        align: 'right',
        sortValue: (r) => r.phase_trials,
        csvValue: (r) => r.phase_trials,
        render: (r) => <span className="pill">{fmtInt.format(r.phase_trials)}</span>,
      });
    }
    cols.push({
      key: 'span',
      label: 'Active Span',
      sortValue: (r) => r.last_year,
      csvValue: (r) => `${r.first_year}-${r.last_year}`,
      render: (r) => (
        <span className="span-cell">
          {r.first_year}–{r.last_year}{' '}
          {r.last_year >= LATEST_FULL && <span className="pill pill-ok">Active</span>}
        </span>
      ),
    });
    return cols;
  }, [hasSite, toggleSite, ver, ta, phase]);

  const piColumns = useMemo<ColumnDef<PiCandidate>[]>(
    () => [
      {
        key: 'save',
        label: 'Save',
        render: (r) => {
          const saved = hasPi(r.person_id);
          return (
            <button
              type="button"
              className={`icon-btn star-btn${saved ? ' saved' : ''}`}
              title={saved ? 'Remove from shortlist' : 'Add investigator to feasibility shortlist'}
              aria-label={saved ? `Remove ${r.display_name}` : `Shortlist ${r.display_name}`}
              onClick={(e) => {
                e.stopPropagation();
                togglePi({
                  person_id: r.person_id,
                  display_name: r.display_name,
                  site: r.site,
                  city: r.city,
                  state: r.state,
                  country: r.country,
                  n_trials: r.n_trials,
                  n_years: r.n_years,
                  first_year: r.first_year,
                  last_year: r.last_year,
                  linked_trials: r.linked_trials,
                });
              }}
            >
              <IconBookmark filled={saved} />
            </button>
          );
        },
      },
      {
        key: 'name',
        label: 'Investigator',
        sortValue: (r) => r.display_name,
        csvValue: (r) => r.display_name,
        render: (r) => <strong>{r.display_name}</strong>,
      },
      {
        key: 'site',
        label: 'Primary Site',
        sortValue: (r) => r.site,
        csvValue: (r) => r.site,
        render: (r) => r.site || <span className="muted">—</span>,
      },
      {
        key: 'loc',
        label: 'Location',
        sortValue: (r) => `${r.country} ${r.state} ${r.city}`,
        csvValue: (r) => [r.city, r.state !== 'NG' ? r.state : '', r.country].filter(Boolean).join(', '),
        render: (r) => (
          <>
            {r.city}
            {r.state && r.state !== 'NG' ? `, ${r.state}` : ''} · {r.country}
          </>
        ),
      },
      {
        key: 'n_trials',
        label: 'IND Refs',
        align: 'right',
        sortValue: (r) => r.n_trials,
        csvValue: (r) => r.n_trials,
        render: (r) => fmtInt.format(r.n_trials),
      },
      {
        key: 'tpy',
        label: '/yr',
        align: 'right',
        sortValue: (r) => r.n_trials / (r.last_year - r.first_year + 1),
        csvValue: (r) => (r.n_trials / (r.last_year - r.first_year + 1)).toFixed(2),
        render: (r) => (r.n_trials / (r.last_year - r.first_year + 1)).toFixed(2),
      },
      {
        key: 'linked',
        label: 'CT.gov Trials',
        align: 'right',
        sortValue: (r) => r.linked_trials,
        csvValue: (r) => r.linked_trials,
        title: 'Linked study-official trials (experimental; KOL-skewed)',
        render: (r) =>
          r.linked_trials > 0 ? (
            <span className={r.strong_links > 0 ? 'pill pill-ok' : 'pill'}>
              {r.linked_trials} ({r.strong_links} strong)
            </span>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        key: 'span',
        label: 'Active Span',
        sortValue: (r) => r.last_year,
        csvValue: (r) => `${r.first_year}-${r.last_year}`,
        render: (r) => (
          <span className="span-cell">
            {r.first_year}–{r.last_year}{' '}
            {r.last_year >= LATEST_FULL && <span className="pill pill-ok">Active</span>}
          </span>
        ),
      },
    ],
    [hasPi, togglePi],
  );

  if (demo) {
    return (
      <section className="panel">
        <h2>Clinical Trial Feasibility Workbench</h2>
        <p className="muted">
          The Feasibility Workbench requires the full Parquet lake snapshot (`site_index`,
          `site_ta_mix`, `site_ctgov_phase_mix`, `person_index`). Run{' '}
          <code>uv run python pipeline/build.py</code> to generate the full lake locally.
        </p>
      </section>
    );
  }

  return (
    <>
      {note && <p className="banner">{note}</p>}

      <section className="panel controls">
        <div className="panel-head">
          <div className="seg" role="group" aria-label="Feasibility explorer mode">
            <button
              type="button"
              className={mode === 'sites' ? 'active' : ''}
              aria-pressed={mode === 'sites'}
              onClick={() => {
                setMode('sites');
                setPiDossier(null);
                setDossierLoading(false);
              }}
            >
              Site Feasibility Finder
            </button>
            <button
              type="button"
              className={mode === 'pis' ? 'active' : ''}
              aria-pressed={mode === 'pis'}
              onClick={() => {
                setMode('pis');
                setSiteDossier(null);
                setDossierLoading(false);
              }}
            >
              Investigator (PI) Finder
            </button>
          </div>
          <div className="header-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
              Reset filters
            </button>
            {totalCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenShortlist}>
                View Shortlist ({totalCount})
              </button>
            )}
          </div>
        </div>

        <div className="preset-row">
          <span className="muted">Presets:</span>
          {mode === 'sites' ? (
            <>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('Oncology');
                  setPhase('P1');
                  setMinYear(2023);
                  setMinInv(5);
                }}
              >
                US Oncology P1
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('Cardiology');
                  setPhase('P3');
                  setMinYear(2023);
                  setMinInv(5);
                }}
              >
                US Cardiology P3
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('Neurology');
                  setPhase('P2');
                  setMinYear(2023);
                  setMinInv(5);
                }}
              >
                US Neurology P2
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('all');
                  setPhase('all');
                  setMinYear(2024);
                  setMinInv(25);
                  setXcheckMode('strong');
                }}
              >
                US Mega-Centers (≥25)
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('Europe (EU+UK)');
                  setStateFilter('all');
                  setTa('all');
                  setPhase('all');
                  setMinYear(2023);
                  setMinInv(5);
                  setXcheckMode('all');
                }}
              >
                EU Centers (≥2023)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('Oncology');
                  setPhase('all');
                  setMinYear(2023);
                  setMinRefs(5);
                  setLinkMode('any');
                }}
              >
                US Oncology KOLs (Linked)
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('Cardiology');
                  setPhase('all');
                  setMinYear(2023);
                  setMinRefs(5);
                  setLinkMode('any');
                }}
              >
                US Cardiology KOLs
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('United States');
                  setStateFilter('all');
                  setTa('all');
                  setPhase('all');
                  setMinYear(2024);
                  setMinRefs(25);
                  setLinkMode('all');
                }}
              >
                High-Volume US PIs (≥25 refs)
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setBand('all');
                  setStateFilter('all');
                  setTa('all');
                  setPhase('all');
                  setMinYear(2023);
                  setMinRefs(10);
                  setLinkMode('strong');
                }}
              >
                Strong CT.gov Linked Officials
              </button>
            </>
          )}
        </div>

        <div className="filters">
          <label>
            Search {mode === 'sites' ? 'site, city, or street' : 'PI name, site, or city'}
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={mode === 'sites' ? 'Hospital, city, or street…' : 'Name, hospital, or city…'}
            />
          </label>
          <label>
            Geography band
            <select
              value={band}
              onChange={(e) => {
                setBand(e.target.value);
                setCountryFilter('all');
                if (e.target.value !== 'United States' && e.target.value !== 'all') {
                  setStateFilter('all');
                }
              }}
            >
              <option value="all">All bands</option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {band === 'United States' || band === 'all' ? (
            <label>
              US State
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="all">All states</option>
                {usStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Country (ISO-3)
              <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
                <option value="all">All countries in band</option>
                {countryOpts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Therapeutic Area {mode === 'sites' ? '(US CT.gov)' : '(Linked CT.gov)'}
            <select value={ta} onChange={(e) => setTa(e.target.value)}>
              <option value="all">Any therapeutic area</option>
              {THERAPEUTIC_AREAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trial Phase {mode === 'sites' ? '(US CT.gov)' : '(Linked CT.gov)'}
            <select value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="all">Any phase</option>
              {TRIAL_PHASES.map((p) => (
                <option key={p} value={p}>
                  {fmtPhase(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active since
            <select value={minYear} onChange={(e) => setMinYear(Number(e.target.value))}>
              <option value={0}>Any year (all-time)</option>
              <option value={2020}>Active ≥ 2020</option>
              <option value={2023}>Active ≥ 2023 (recent)</option>
              <option value={2024}>Active ≥ 2024</option>
              <option value={2025}>Active ≥ 2025</option>
            </select>
          </label>
          {mode === 'sites' ? (
            <>
              <label>
                Min team size
                <select value={minInv} onChange={(e) => setMinInv(Number(e.target.value))}>
                  <option value={1}>Any size (≥1)</option>
                  <option value={5}>≥5 investigators</option>
                  <option value={10}>≥10 investigators</option>
                  <option value={25}>≥25 investigators</option>
                  <option value={50}>≥50 investigators</option>
                </select>
              </label>
              <label>
                CT.gov cross-check
                <select
                  value={xcheckMode}
                  onChange={(e) => setXcheckMode(e.target.value as 'all' | 'matched' | 'strong')}
                >
                  <option value="all">All sites</option>
                  <option value="matched">CT.gov matched only</option>
                  <option value="strong">Strong match (≥10 trials)</option>
                </select>
              </label>
              <div className="filter-group">
                <span className="filter-label">Address clustering</span>
                <div className="seg" role="group" aria-label="Address clustering">
                  <button
                    type="button"
                    className={ver === 'strict' ? 'active' : ''}
                    aria-pressed={ver === 'strict'}
                    title="Exact normalized street + city + state + country match"
                    onClick={() => {
                      setVer('strict');
                      setSiteDossier(null);
                    }}
                  >
                    Strict
                  </button>
                  <button
                    type="button"
                    className={ver === 'merged' ? 'active' : ''}
                    aria-pressed={ver === 'merged'}
                    title="Strict plus fuzzy same-address merges"
                    onClick={() => {
                      setVer('merged');
                      setSiteDossier(null);
                    }}
                  >
                    Merged
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <label>
                Experience tier
                <select value={minRefs} onChange={(e) => setMinRefs(Number(e.target.value))}>
                  <option value={1}>All (≥1 filing)</option>
                  <option value={2}>Repeat (≥2 filings)</option>
                  <option value={5}>Experienced (≥5 filings)</option>
                  <option value={15}>High-volume (≥15 filings)</option>
                  <option value={50}>Super-PI (≥50 filings)</option>
                </select>
              </label>
              <label>
                CT.gov official link
                <select
                  value={linkMode}
                  onChange={(e) => setLinkMode(e.target.value as 'all' | 'any' | 'strong')}
                >
                  <option value="all">All BMIS investigators</option>
                  <option value="any">Linked to CT.gov (KOLs)</option>
                  <option value="strong">Strong match only (~80% prec.)</option>
                </select>
              </label>
            </>
          )}
        </div>
        <p className="caption">
          <IconInfo className="icon" />{' '}
          {mode === 'sites'
            ? 'Therapeutic area & phase filters use US CT.gov institution×city facility cross-checks (experimental) and narrow results to matched US sites. '
            : 'Therapeutic area & phase filters on PIs use experimental CT.gov overall-official linkage (~4.8% of strict persons, KOL-skewed). '}
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              onJumpDefinition(
                mode === 'sites'
                  ? 'CT.gov cross-check (experimental)'
                  : 'CT.gov person linkage (experimental)',
              )
            }
          >
            Read methodology &amp; caveats →
          </button>
        </p>
        {(band !== 'all' ||
          stateFilter !== 'all' ||
          countryFilter !== 'all' ||
          ta !== 'all' ||
          phase !== 'all' ||
          minYear > 0 ||
          (mode === 'sites' && (minInv > 1 || xcheckMode !== 'all')) ||
          (mode === 'pis' && (minRefs > 1 || linkMode !== 'all')) ||
          debouncedKw.trim().length >= 2) && (
          <div className="active-filters" aria-label="Active filters">
            <span className="muted">Active filters:</span>
            {band !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove region filter ${band}`}
                onClick={() => setBand('all')}
              >
                Region: {band} ×
              </button>
            )}
            {stateFilter !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove state filter ${stateFilter}`}
                onClick={() => setStateFilter('all')}
              >
                State: {stateFilter} ×
              </button>
            )}
            {countryFilter !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove country filter ${countryFilter}`}
                onClick={() => setCountryFilter('all')}
              >
                Country: {countryFilter} ×
              </button>
            )}
            {ta !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove therapeutic area filter ${ta}`}
                onClick={() => setTa('all')}
              >
                Area: {ta} ×
              </button>
            )}
            {phase !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove trial phase filter ${fmtPhase(phase)}`}
                onClick={() => setPhase('all')}
              >
                Phase: {fmtPhase(phase)} ×
              </button>
            )}
            {minYear > 0 && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove active year filter ${minYear}`}
                onClick={() => setMinYear(0)}
              >
                Active ≥ {minYear} ×
              </button>
            )}
            {mode === 'sites' && minInv > 1 && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove minimum investigators filter ${minInv}`}
                onClick={() => setMinInv(1)}
              >
                ≥ {minInv} investigators ×
              </button>
            )}
            {mode === 'sites' && xcheckMode !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove CT.gov filter ${xcheckMode}`}
                onClick={() => setXcheckMode('all')}
              >
                CT.gov: {xcheckMode} ×
              </button>
            )}
            {mode === 'pis' && minRefs > 1 && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove minimum filings filter ${minRefs}`}
                onClick={() => setMinRefs(1)}
              >
                ≥ {minRefs} filings ×
              </button>
            )}
            {mode === 'pis' && linkMode !== 'all' && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove CT.gov link filter ${linkMode}`}
                onClick={() => setLinkMode('all')}
              >
                Link: {linkMode} ×
              </button>
            )}
            {debouncedKw.trim().length >= 2 && (
              <button
                type="button"
                className="chip active"
                aria-label={`Remove search query ${debouncedKw.trim()}`}
                onClick={() => {
                  setKeyword('');
                  setDebouncedKw('');
                }}
              >
                Query: “{debouncedKw.trim()}” ×
              </button>
            )}
          </div>
        )}
      </section>

      {mode === 'sites' ? (
        <>
          <section className="kpis four">
            <div className="kpi">
              <span className="kpi-label">Matching candidate sites</span>
              <span className="kpi-value">{siteSummary ? fmtInt.format(siteSummary.total) : '—'}</span>
              <span className="kpi-sub">{loading ? 'Updating…' : `${ver} address clusters`}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Active in {LATEST_FULL}+</span>
              <span className="kpi-value">
                {siteSummary ? fmtInt.format(siteSummary.active25) : '—'}
              </span>
              <span className="kpi-sub">
                {siteSummary && siteSummary.total > 0
                  ? `${((100 * siteSummary.active25) / siteSummary.total).toFixed(1)}% of pool`
                  : '\u00A0'}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Investigator seats across pool</span>
              <span className="kpi-value">
                {siteSummary ? fmtInt.format(siteSummary.totalInv) : '—'}
              </span>
              <span className="kpi-sub">Sum of site-level investigators</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">CT.gov cross-checked sites</span>
              <span className="kpi-value">
                {siteSummary ? fmtInt.format(siteSummary.xchecked) : '—'}
              </span>
              <span className="kpi-sub">Institution×city matched</span>
            </div>
          </section>

          <section className="panels">
            <div className="panel">
              <h2>
                Top {band === 'United States' ? 'US states' : 'countries'} in filtered pool
              </h2>
              <CategoryBars
                data={siteByGeo}
                onSelect={
                  band === 'United States'
                    ? (st) => setStateFilter((cur) => (cur === st ? 'all' : st))
                    : (co) => setCountryFilter((cur) => (cur === co ? 'all' : co))
                }
                activeCategory={
                  band === 'United States'
                    ? stateFilter !== 'all'
                      ? stateFilter
                      : undefined
                    : countryFilter !== 'all'
                      ? countryFilter
                      : undefined
                }
              />
              <p className="caption">
                Click any bar to narrow the candidate pool to that{' '}
                {band === 'United States' ? 'state' : 'country'}.
              </p>
            </div>
            <div className="panel">
              <h2>Therapeutic area coverage in pool</h2>
              <CategoryBars
                data={siteByTa}
                onSelect={(selectedTa) => setTa((cur) => (cur === selectedTa ? 'all' : selectedTa))}
                activeCategory={ta !== 'all' ? ta : undefined}
              />
              <p className="caption">
                Sites in the current pool with ≥1 matched CT.gov trial in each TA. Click any bar to
                filter by therapeutic area.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Candidate Research Sites (top 150)</h2>
              <span className="muted">
                Click any row to open its Feasibility Dossier · bookmark to shortlist
              </span>
            </div>
            <DataTable
              rows={siteRows}
              columns={siteColumns}
              rowKey={(r) => r.site_id}
              filterPlaceholder="Filter visible sites by name, city, or street…"
              filterText={(r) => `${r.name} ${r.addr} ${r.city} ${r.state} ${r.country}`}
              onRowClick={(r) => void inspectSite(r)}
              isSelected={(r) => siteDossier?.site.site_id === r.site_id}
              rowTitle={(r) => `Inspect feasibility dossier for ${r.name}`}
              csvFilename={`feasibility-sites-${ver}.csv`}
              emptyMessage="No sites match the current filters. Try relaxing Therapeutic Area, Phase, or Active Since."
              pageSize={25}
            />
          </section>
        </>
      ) : (
        <>
          <section className="kpis four">
            <div className="kpi">
              <span className="kpi-label">Matching investigators</span>
              <span className="kpi-value">{piSummary ? fmtInt.format(piSummary.total) : '—'}</span>
              <span className="kpi-sub">{loading ? 'Updating…' : 'Strict BMIS persons'}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Active in {LATEST_FULL}+</span>
              <span className="kpi-value">{piSummary ? fmtInt.format(piSummary.active25) : '—'}</span>
              <span className="kpi-sub">
                {piSummary && piSummary.total > 0
                  ? `${((100 * piSummary.active25) / piSummary.total).toFixed(1)}% of pool`
                  : '\u00A0'}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Mean IND references</span>
              <span className="kpi-value">
                {piSummary ? piSummary.avgRefs.toFixed(1) : '—'}
              </span>
              <span className="kpi-sub">Within filtered pool</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">CT.gov linked officials</span>
              <span className="kpi-value">{piSummary ? fmtInt.format(piSummary.linked) : '—'}</span>
              <span className="kpi-sub">Study chairs / directors</span>
            </div>
          </section>

          <section className="panel">
            <h2>
              Top {band === 'United States' ? 'US states' : 'countries'} in filtered PI pool
            </h2>
            <CategoryBars
              data={piByGeo}
              onSelect={
                band === 'United States'
                  ? (st) => setStateFilter((cur) => (cur === st ? 'all' : st))
                  : (co) => setCountryFilter((cur) => (cur === co ? 'all' : co))
              }
              activeCategory={
                band === 'United States'
                  ? stateFilter !== 'all'
                    ? stateFilter
                    : undefined
                  : countryFilter !== 'all'
                    ? countryFilter
                    : undefined
              }
            />
            <p className="caption">
              Click any bar to narrow the investigator pool to that{' '}
              {band === 'United States' ? 'state' : 'country'}.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Candidate Investigators (top 150)</h2>
              <span className="muted">
                Click any row to inspect BMIS history &amp; linked trials · bookmark to shortlist
              </span>
            </div>
            <DataTable
              rows={piRows}
              columns={piColumns}
              rowKey={(r) => r.person_id}
              filterPlaceholder="Filter visible PIs by name, site, or city…"
              filterText={(r) => `${r.display_name} ${r.site} ${r.city} ${r.state} ${r.country}`}
              onRowClick={(r) => void inspectPi(r)}
              isSelected={(r) => piDossier?.pi.person_id === r.person_id}
              rowTitle={(r) => `Inspect dossier for ${r.display_name}`}
              csvFilename="feasibility-investigators.csv"
              emptyMessage="No investigators match the current filters. Try lowering Min Refs or clearing TA/Phase."
              pageSize={25}
            />
          </section>
        </>
      )}

      {dossierLoading && (
        <section className="panel" id="feas-dossier">
          <p className="muted">Loading feasibility dossier…</p>
        </section>
      )}

      {!dossierLoading && siteDossier && (
        <section className="panel dossier-panel" id="feas-dossier">
          <div className="panel-head">
            <div>
              <h2>Site Feasibility Dossier: {siteDossier.site.name}</h2>
              <p className="muted">
                {siteDossier.site.addr} · {siteDossier.site.city}
                {siteDossier.site.state && siteDossier.site.state !== 'NG'
                  ? `, ${siteDossier.site.state}`
                  : ''}{' '}
                {siteDossier.site.country} · {fmtInt.format(siteDossier.site.n_inv)} investigators ·{' '}
                {fmtInt.format(siteDossier.site.n_receipts)} IND refs ·{' '}
                {siteDossier.site.first_year}–{siteDossier.site.last_year}
              </p>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  toggleSite({
                    site_id: siteDossier.site.site_id,
                    site_n: siteDossier.site.site_n,
                    version: ver,
                    name: siteDossier.site.name,
                    addr: siteDossier.site.addr,
                    city: siteDossier.site.city,
                    state: siteDossier.site.state,
                    country: siteDossier.site.country,
                    band: siteDossier.site.band,
                    n_inv: siteDossier.site.n_inv,
                    n_receipts: siteDossier.site.n_receipts,
                    first_year: siteDossier.site.first_year,
                    last_year: siteDossier.site.last_year,
                    ctgov_plausible: siteDossier.site.ct_plausible,
                    ctgov_strong: siteDossier.site.ct_strong,
                  })
                }
              >
                {hasSite(siteDossier.site.site_id) ? 'Shortlisted ✓' : 'Add to Shortlist'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onJumpSite(siteDossier.site.site_n, ver)}
              >
                Full Site View →
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSiteDossier(null)}
              >
                Close
              </button>
            </div>
          </div>

          <h3>Active investigators by year</h3>
          <StackedMultiBars
            allTicks
            series={[
              {
                label: 'Active investigators',
                color: '#0f766e',
                points: siteDossier.yearly.map((d) => ({ x: d.y, y: d.invs })),
              },
            ]}
          />

          <div className="panels panel-spacer">
            <div className="subpanel">
              <h3>Therapeutic-area mix (CT.gov cross-check)</h3>
              {siteDossier.tamix.length ? (
                <CategoryBars data={siteDossier.tamix} />
              ) : (
                <p className="muted">No CT.gov TA match for this address.</p>
              )}
            </div>
            <div className="subpanel">
              <h3>Trial phase mix (CT.gov cross-check)</h3>
              {siteDossier.phasemix.length ? (
                <CategoryBars data={siteDossier.phasemix} />
              ) : (
                <p className="muted">No CT.gov phase match for this address.</p>
              )}
            </div>
          </div>

          {siteDossier.xcheck && (
            <div className="dossier-xcheck">
              <h3>CT.gov institution×city cross-check (experimental)</h3>
              <p className="prose">
                <strong>{fmtInt.format(siteDossier.xcheck.n)}</strong> plausible industry trials (
                <strong>{fmtInt.format(siteDossier.xcheck.ns)}</strong> strong), shared across{' '}
                {siteDossier.xcheck.sib} {siteDossier.xcheck.sib === 1 ? 'address' : 'addresses'} —
                matched facility “{siteDossier.xcheck.fac}”.
              </p>
              {!!siteDossier.sampTrials.length && (
                <div className="table-scroll short">
                  <table>
                    <thead>
                      <tr>
                        <th>NCT ID</th>
                        <th>Lead Sponsor</th>
                        <th>Phase</th>
                        <th>Therapeutic Area</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteDossier.sampTrials.map((t) => (
                        <tr key={t.nct}>
                          <td>
                            <a
                              href={`https://clinicaltrials.gov/study/${t.nct}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.nct} <IconExternal className="icon" />
                            </a>
                          </td>
                          <td>{t.sponsor}</td>
                          <td>{t.phase}</td>
                          <td>{t.ta ? t.ta.replace(/;/g, ', ') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <h3>Top investigators filing at this site (all years, top 60)</h3>
          <div className="table-scroll short">
            <table>
              <thead>
                <tr>
                  <th>Save</th>
                  <th>Investigator</th>
                  <th>Country</th>
                  <th className="num">Refs at site</th>
                  <th className="num">Lifetime refs</th>
                  <th>Span</th>
                </tr>
              </thead>
              <tbody>
                {siteDossier.roster.map((r) => {
                  const saved = hasPi(r.person_id);
                  return (
                    <tr
                      key={r.person_id}
                      className="pickable"
                      onClick={() => onJumpInvestigator(r.name)}
                    >
                      <td>
                        <button
                          type="button"
                          className={`icon-btn star-btn${saved ? ' saved' : ''}`}
                          aria-label={saved ? `Remove ${r.name}` : `Shortlist ${r.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePi({
                              person_id: r.person_id,
                              display_name: r.name,
                              site: siteDossier.site.name,
                              city: siteDossier.site.city,
                              state: siteDossier.site.state,
                              country: r.country,
                              n_trials: r.n_trials,
                              n_years: r.last_year - r.first_year + 1,
                              first_year: r.first_year,
                              last_year: r.last_year,
                            });
                          }}
                        >
                          <IconBookmark filled={saved} />
                        </button>
                      </td>
                      <td>{r.name}</td>
                      <td>{r.country}</td>
                      <td className="num">{fmtInt.format(r.n)}</td>
                      <td className="num">{fmtInt.format(r.n_trials)}</td>
                      <td>
                        {r.first_year}–{r.last_year}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!dossierLoading && piDossier && (
        <section className="panel dossier-panel" id="feas-dossier">
          <div className="panel-head">
            <div>
              <h2>Investigator Dossier: {piDossier.pi.display_name}</h2>
              <p className="muted">
                {piDossier.pi.site || 'No site recorded'} · {piDossier.pi.city}
                {piDossier.pi.state && piDossier.pi.state !== 'NG'
                  ? `, ${piDossier.pi.state}`
                  : ''}{' '}
                {piDossier.pi.country} · {fmtInt.format(piDossier.pi.n_trials)} IND refs ·{' '}
                {piDossier.pi.first_year}–{piDossier.pi.last_year}
              </p>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  togglePi({
                    person_id: piDossier.pi.person_id,
                    display_name: piDossier.pi.display_name,
                    site: piDossier.pi.site,
                    city: piDossier.pi.city,
                    state: piDossier.pi.state,
                    country: piDossier.pi.country,
                    n_trials: piDossier.pi.n_trials,
                    n_years: piDossier.pi.n_years,
                    first_year: piDossier.pi.first_year,
                    last_year: piDossier.pi.last_year,
                    linked_trials: piDossier.pi.linked_trials,
                  })
                }
              >
                {hasPi(piDossier.pi.person_id) ? 'Shortlisted ✓' : 'Add to Shortlist'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onJumpInvestigator(piDossier.pi.display_name)}
              >
                Full Search View →
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPiDossier(null)}>
                Close
              </button>
            </div>
          </div>

          {!!piDossier.linked.length && (
            <>
              <h3>CT.gov linked study-official trials ({piDossier.linked.length})</h3>
              <div className="table-scroll short">
                <table>
                  <thead>
                    <tr>
                      <th>Trial</th>
                      <th>Role</th>
                      <th>Sponsor</th>
                      <th>Phase</th>
                      <th>TA</th>
                      <th className="num">Start</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {piDossier.linked.map((r) => (
                      <tr key={`${r.nct}-${r.role}`}>
                        <td>
                          <a
                            href={`https://clinicaltrials.gov/study/${r.nct}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.nct} <IconExternal className="icon" />
                          </a>
                        </td>
                        <td>{r.role.replace(/_/g, ' ').toLowerCase()}</td>
                        <td>{r.sponsor}</td>
                        <td>{r.phase}</td>
                        <td>{r.ta ? r.ta.replace(/;/g, ', ') : '—'}</td>
                        <td className="num">{r.start_y ?? '—'}</td>
                        <td>
                          <span className={r.tier === 'strong' ? 'pill pill-ok' : 'pill'}>
                            {r.tier}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3>Recent BMIS Form 1572 receipts ({piDossier.receipts.length} shown)</h3>
          <div className="table-scroll short">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th>Location</th>
                  <th>Site Detail</th>
                </tr>
              </thead>
              <tbody>
                {piDossier.receipts.slice(0, 40).map((r, i) => (
                  <tr key={`${r.rcvd}-${i}`}>
                    <td>{r.rcvd}</td>
                    <td>{r.site}</td>
                    <td>
                      {r.city}
                      {r.state && r.state !== 'NG' ? `, ${r.state}` : ''} {r.country}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onJumpSite(r.site_n)}
                      >
                        Open Site →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!piDossier.colleagues.length && (
            <>
              <h3>Site colleagues at exact same facility</h3>
              <div className="table-scroll short">
                <table>
                  <thead>
                    <tr>
                      <th>Investigator</th>
                      <th className="num">IND Refs</th>
                      <th>Span</th>
                    </tr>
                  </thead>
                  <tbody>
                    {piDossier.colleagues.map((c) => (
                      <tr
                        key={c.person_id}
                        className="pickable"
                        onClick={() => onJumpInvestigator(c.display_name)}
                      >
                        <td>{c.display_name}</td>
                        <td className="num">{fmtInt.format(c.n_trials)}</td>
                        <td>
                          {c.first_year}–{c.last_year}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
