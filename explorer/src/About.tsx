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
      </ul>

      <h3>Limitations</h3>
      <ul className="about-list">
        <li>BMIS is CDER IND drugs/biologics only, and the FDA states it is not comprehensive.</li>
        <li>No record-level investigator↔trial linkage exists; benchmarking is year-level ratios.</li>
        <li>BMIS has no therapeutic-area or phase fields; rows carry date + site only.</li>
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
