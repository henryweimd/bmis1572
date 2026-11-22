export interface ShortlistedSite {
  site_id: string;
  site_n: number;
  version: 'strict' | 'merged';
  name: string;
  addr?: string;
  city: string;
  state?: string;
  country: string;
  band?: string;
  n_inv: number;
  n_receipts: number;
  first_year: number;
  last_year: number;
  ctgov_plausible?: number;
  ctgov_strong?: number;
  ta_note?: string;
}

export interface ShortlistedPi {
  person_id: string;
  display_name: string;
  site: string;
  city?: string;
  state?: string;
  country: string;
  n_trials: number;
  n_years: number;
  first_year: number;
  last_year: number;
  linked_trials?: number;
}

export function serializeShortlistMarkdown(sites: ShortlistedSite[], pis: ShortlistedPi[]): string {
  const lines: string[] = [
    '# Clinical Trial Feasibility Shortlist (FDA BMIS 1572 Explorer)',
    '',
  ];
  if (sites.length) {
    lines.push(`## Candidate Sites (${sites.length})`, '');
    lines.push('| Site | Location | Investigators | IND Refs | Active Span | CT.gov Plausible (Strong) |');
    lines.push('| --- | --- | ---: | ---: | --- | ---: |');
    for (const s of sites) {
      const loc = [s.city, s.state && s.state !== 'NG' ? s.state : '', s.country].filter(Boolean).join(', ');
      const xcheck = s.ctgov_plausible ? `${s.ctgov_plausible} (${s.ctgov_strong ?? 0})` : '—';
      lines.push(
        `| ${s.name.replace(/\|/g, '/')} | ${loc} | ${s.n_inv} | ${s.n_receipts} | ${s.first_year}–${s.last_year} | ${xcheck} |`,
      );
    }
    lines.push('');
  }
  if (pis.length) {
    lines.push(`## Candidate Investigators (${pis.length})`, '');
    lines.push('| Investigator | Site | Country | IND Refs | Active Years | Span | CT.gov Linked |');
    lines.push('| --- | --- | --- | ---: | ---: | --- | ---: |');
    for (const p of pis) {
      lines.push(
        `| ${p.display_name.replace(/\|/g, '/')} | ${(p.site || '—').replace(/\|/g, '/')} | ${p.country} | ${p.n_trials} | ${p.n_years} | ${p.first_year}–${p.last_year} | ${p.linked_trials ?? '—'} |`,
      );
    }
    lines.push('');
  }
  lines.push(
    '_Source: FDA BMIS Form 1572 & ClinicalTrials.gov cross-check (experimental). Verify site capacity directly._',
  );
  return lines.join('\n');
}
