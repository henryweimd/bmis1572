export default function About() {
  return (
    <section className="panel">
      <h2>About this explorer</h2>
      <p>
        How has the supply of clinical trial investigators trended over time, and how does it compare
        against industry trial demand? This app visualizes the FDA&apos;s investigator registry against
        trial counts from clinicaltrials.gov.
      </p>

      <h3>Data sources</h3>
      <ul className="about-list">
        <li>
          <strong>Supply:</strong> FDA Bioresearch Monitoring Information System (BMIS) quarterly
          public file — investigators, CROs, and IRBs named on Form 1572/1571 submissions forwarded
          to CDER.{' '}
          <a href="https://www.fda.gov/drugs/drug-approvals-and-databases/bioresearch-monitoring-information-system-bmis" target="_blank" rel="noreferrer">
            FDA BMIS page
          </a>
        </li>
        <li>
          <strong>Demand:</strong> clinicaltrials.gov Data API v2 — industry-led interventional trial
          starts and running trials.{' '}
          <a href="https://clinicaltrials.gov/data-api/api" target="_blank" rel="noreferrer">
            API docs
          </a>
        </li>
        <li>
          <strong>China:</strong> partial extract of the CFDI drug-trial institution filing
          system (药物和医疗器械临床试验机构备案系统) — investigator affiliations at filed
          institutions, retrieved 2026-11-06.{' '}
          <a
            href="https://beian.cfdi.org.cn/CTMDS/apps/pub/drugPublic1.jsp"
            target="_blank"
            rel="noreferrer"
          >
            CFDI public query portal
          </a>
          . Filing year is registration vintage, not activity; person = (name, institution)
          pair; Chinese is authoritative and EN labels are curated or pattern-derived.
        </li>
      </ul>

      <h3>How to read it</h3>
      <ul className="about-list">
        <li>
          <strong>Persons, not rows:</strong> BMIS Reviewer IDs are one-per-site-record, so rows are
          clustered into name+site persons. <strong>Strict</strong> (exact match) is the headline;{' '}
          <strong>Merged</strong> unions multi-site investigators; <strong>Raw</strong> counts Reviewer
          IDs as a naive upper bound.
        </li>
        <li>
          <strong>Active in year</strong> means ≥1 receipt that year; <strong>new</strong> means first
          receipt ever (2008–09 inflated: the file starts Oct 2008). Headline window is 2009–2025.
        </li>
        <li>
          <strong>Trials per person</strong> counts IND references per cluster — a proxy, not confirmed
          distinct trials. <strong>Trials/year</strong> divides that by the inclusive first–last span.
        </li>
        <li>
          <strong>CRO/IRB tabs</strong> group organization rows by normalized company/board name
          (giant aliases, stopword rules, state disambiguation; residual variants audited per row).
        </li>
        <li>
          <strong>Sites tab</strong> rolls rows up to street addresses (Strict exact, Merged
          fuzzy-unioned) and tracks investigators per site plus roster churn over time.
        </li>
        <li>
          <strong>Trials tab</strong> rolls up the CT.gov demand side itself: sponsors, phases, the
          most-linked investigators, and linkage coverage — all years, experimental.
        </li>
        <li>
          <strong>Stacked charts</strong> toggle between Absolute counts and 100% yearly share;
          hover any segment for counts and shares.
        </li>
        <li>
          <strong>2021*</strong> on the geography chart marks the first full year after the 2019 EU
          Form 1572 restriction — see the footnote links (EORTC, NCI RCR) and the Definitions entry.
        </li>
      </ul>

      <h3>Data quality &amp; dedupe</h3>
      <ul className="about-list">
        <li>
          BMIS rows are exact-deduped before person clustering. ~7,300 CI rows (0.7%) lack usable
          names: kept in headline counts, excluded from search, leaderboards, rosters, and
          site-detail series.
        </li>
        <li>
          The China extract repeats ~35% of its rows; ingest drops exact duplicates (76,764 → 50,038
          rows) without changing pair counts. Pairs count affiliations, not humans — see the China
          tab caption.
        </li>
        <li>
          Residual name-variant splits remain on both sides; person/pair counts are documented
          bounds, not exact censuses of humans.
        </li>
        <li>
          CT.gov person linkage covers 12,808 of 288,855 strict persons (4.4%): only study-level
          officials can match, so linked investigators skew toward chairs and KOLs.
        </li>
      </ul>

      <h3>Limitations</h3>
      <ul className="about-list">
        <li>BMIS is CDER IND drugs/biologics only, and the FDA states it is not comprehensive.</li>
        <li>No record-level investigator↔trial linkage exists; benchmarking is year-level ratios.</li>
        <li>BMIS has no therapeutic-area or phase fields; rows carry date + site only.</li>
        <li>
          China coverage is partial (1,818 institutions) and a single 2026-11-06 snapshot; filing
          year is vintage, not activity.
        </li>
      </ul>

      <h3>Slide deck export</h3>
      <p>
        Download the pre-built deck (same charts and numbers, caveated on every slide):{' '}
        <a href="data/exports/bmis-supply-deck.pptx">PowerPoint</a> ·{' '}
        <a href="data/exports/bmis-supply-deck.pdf">PDF</a>. Rebuilt by the pipeline on every run.
      </p>

      <h3>Reproduce &amp; contribute</h3>
      <p>
        Pipeline, methods, and full definitions:{' '}
        <a href="https://github.com/henryweimd/bmis1572" target="_blank" rel="noreferrer">
          github.com/henryweimd/bmis1572
        </a>
        . Rebuild locally with <code>uv run python pipeline/build.py</code>.
      </p>
    </section>
  );
}
