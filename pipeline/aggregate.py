"""Rollup tables, headline stats, and shared definition texts.

Definition texts here are the single source used by the manifest, the static
charts, and (via manifest) the explorer captions.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from geo_bands import BAND_ORDER

VERSIONS = ["strict", "merged", "raw"]
PARTIAL_YEARS = {2008, 2026}

DEFINITIONS = {
    "person_strict": (
        "Strict person: rows sharing identical normalized last/first/middle "
        "name + site + street + city + state + ZIP + country (exact-duplicate "
        "rows collapsed first). Conservative: one human at two address "
        "spellings counts twice."
    ),
    "person_merged": (
        "Merged person: strict persons unioned within a (name, country) block "
        "when sharing a site or city+state. Catches multi-site investigators; "
        "cross-state movers stay split; blank/NG names never merged."
    ),
    "person_raw": (
        "Raw bound: person keyed by FDA Reviewer ID (INVN) on un-deduplicated "
        "rows (naive ID counting). INVN is one-per-site-record, so this "
        "overcounts humans and bounds the assumption effect from above."
    ),
    "trials_per_person": (
        "Trials per person: collapsed BMIS rows per person-cluster. One row = "
        "one IND submission reference, a proxy for trials, not confirmed "
        "distinct trials."
    ),
    "active": (
        "Active in year: person has >=1 BMIS receipt in that calendar year. "
        "New: first receipt ever falls in that year (2008-09 inflated: file "
        "starts Oct 2008). Returning: active and first seen earlier."
    ),
    "one_trial": (
        "One-trial (one-and-done): person-cluster linked to exactly one IND "
        "reference across the full 1980-2026 file span."
    ),
    "scope_unadjusted": (
        "Unadjusted benchmark: all TYPE=CI BMIS persons vs. all global "
        "industry-led interventional trial starts (clinicaltrials.gov)."
    ),
    "scope_adjusted": (
        "Adjusted benchmark: US-band BMIS persons vs. industry-led "
        "interventional trials with >=1 US site."
    ),
    "starts_running": (
        "Starts: trials by Study Start Date year. Running: start <= year-end "
        "AND (completion >= year-start OR still active with no completion "
        "date). CT.gov snapshot date recorded in manifest."
    ),
    "tightness": (
        "Tightness ratio: active investigators per running trial. Descriptive "
        "workload proxy only; supply and trial counts are not independent "
        "(a supply crunch can suppress starts), so this is not causal."
    ),
    "partial": (
        "2008 (file ramp-up from Oct 1) and 2026 (file through Aug 31) are "
        "partial: shown faded, excluded from growth statistics."
    ),
    "bmis_scope": (
        "BMIS covers CDER IND drug/biologic investigators whose 1572/1571 "
        "was forwarded to FDA since Oct 2008. FDA: not a comprehensive list "
        "(1572 goes to the sponsor; forwarding is voluntary-ish). No devices, "
        "no CBER, no non-IND research."
    ),
    "cro": (
        "CRO views group BMIS TYPE=CRO rows by normalized company name: "
        "evidence-based aliases for known giants (PPD, Medpace, IQVIA, PRA, "
        "Syneos, ICON, Parexel, Covance, Celerion, others), else first "
        "site segment with suffixes/punctuation stripped. Same-name "
        "companies materially spanning states are state-qualified; aliases "
        "stay global. Residual variants stay split; cro_index lists variants."
    ),
    "trials_per_year": (
        "Trials/year rate: lifetime IND references divided by the inclusive "
        "first-to-last receipt span in calendar years. Intensity measure, "
        "not a headcount; single-year bursts rank high by construction."
    ),
    "irb": (
        "IRB views group BMIS TYPE=IRB rows by normalized board name: "
        "evidence-based aliases for known boards (Advarra, WCG/Western, "
        "Copernicus, IntegReview, Schulman, Quorum, Sterling, Chesapeake), "
        "else first non-empty site segment with IRB stopwords, room "
        "markers, and numbers stripped. Same-name boards materially "
        "spanning states are state-qualified; aliases stay global. "
        "Residual variants stay split; irb_index lists variants."
    ),
    "retention": (
        "Investigator vintage attrition: of the clinical investigators "
        "(CIs) first seen in a given year (their vintage), the share "
        "active again k years later. Right-censored (recent vintages show "
        "fewer years); 2008 excluded (file ramp-up distorts the base)."
    ),
    "concentration": (
        "Annual concentration: share of each year's receipts going to the "
        "year's top 1%/10% investigators by receipts, plus the Gini of "
        "per-investigator yearly receipts. Higher means work concentrated "
        "in fewer hands."
    ),
    "site": (
        "A site is a PLACE (street address): Strict matches normalized "
        "street+city+state+country exactly (suite/floor markers dropped, "
        "ZIP excluded); Merged additionally unions same-house-number "
        "addresses with street-token Jaccard >= 0.6 within a city. Branches "
        "of one org at different addresses stay split. Site rollups use "
        "strict persons."
    ),
    "site_churn": (
        "Site roster churn: per investigator-site link, joined = first "
        "receipt year at the site, ended = last receipt year. Right edge "
        "is censored (2026 links look ended); gaps read as continuous."
    ),
    "site_xcheck": (
        "CT.gov cross-check (experimental, US only): industry-interventional "
        "studies whose facility fuzzy-matches the site's institution name in "
        "the same city, with start year overlapping the site's BMIS span. "
        "CT.gov facilities carry no street address, so counts are "
        "institution x city and shared across that institution's addresses; "
        "name variants split counts. Strong = token Jaccard >= 0.6."
    ),
    "data_quality": (
        "Junk names: ~7,300 CI rows (0.7%) lack a usable surname or given "
        "name (blank/NG/?), concentrated in 1980s-90s filings; 298 strict "
        "persons (0.1%) are excluded from the search index for the same "
        "reason. Headline counts include junk-name rows; the search index, "
        "leaderboard, rosters, and site-detail series exclude them."
    ),
}


def trial_bin(n: int) -> str:
    if n <= 1:
        return "1"
    if n >= 15:
        return "15+"
    return str(n)


BIN_ORDER = [str(i) for i in range(1, 15)] + ["15+"]


def person_years(persons: pd.DataFrame, row_pid: np.ndarray,
                 row_year: np.ndarray) -> pd.DataFrame:
    """Distinct (person, active year) with person attributes attached."""
    py = pd.DataFrame({"pid": row_pid, "year": row_year}).drop_duplicates()
    for col in ["band", "country", "state", "first_year", "n_trials"]:
        py[col] = persons[col].to_numpy()[py["pid"].to_numpy()]
    py["bin"] = py["n_trials"].map(trial_bin)
    return py


def investigators_year_geo(persons: pd.DataFrame, py: pd.DataFrame,
                            receipts: pd.DataFrame, version: str) -> pd.DataFrame:
    active = py.groupby(["year", "band"], observed=True).size().rename("n_active")
    new = persons.groupby(["first_year", "band"], observed=True).size().rename("n_new")
    new.index = new.index.set_names(["year", "band"])
    out = pd.concat([active, new], axis=1).fillna(0).astype(int)
    out["n_returning"] = out["n_active"] - out["n_new"]
    out = out.reset_index()
    out = out.merge(receipts, on=["year", "band"], how="left")
    out["n_receipts"] = out["n_receipts"].fillna(0).astype(int)
    out["version"] = version
    out["partial"] = out["year"].isin(PARTIAL_YEARS)
    return out[["version", "year", "band", "n_active", "n_new",
                "n_returning", "n_receipts", "partial"]]


def country_year(py: pd.DataFrame, version: str) -> pd.DataFrame:
    out = py.groupby(["year", "country"], observed=True).size().rename("n_active")
    out = out.reset_index()
    out["version"] = version
    return out[["version", "year", "country", "n_active"]]


def us_state_year(py: pd.DataFrame, version: str) -> pd.DataFrame:
    usa = py[py["country"] == "USA"]
    out = usa.groupby(["year", "state"], observed=True).size().rename("n_active")
    out = out.reset_index()
    out["version"] = version
    return out[["version", "year", "state", "n_active"]]


def cohort_summary(persons: pd.DataFrame, version: str) -> pd.DataFrame:
    g = persons.groupby("first_year")
    out = pd.DataFrame({
        "cohort": g.size().index,
        "n_persons": g.size().to_numpy(),
        "mean_trials": g["n_trials"].mean().to_numpy().round(2),
        "median_trials": g["n_trials"].median().to_numpy(),
        "one_trial_share": (g["n_trials"].apply(lambda s: (s == 1).mean())
                             .to_numpy().round(4)),
    })
    out["version"] = version
    return out[["version", "cohort", "n_persons", "mean_trials",
                "median_trials", "one_trial_share"]]


def active_bins(py: pd.DataFrame, version: str) -> pd.DataFrame:
    out = (py.groupby(["year", "bin"], observed=True).size()
           .rename("n_active").reset_index())
    out["version"] = version
    out["bin"] = pd.Categorical(out["bin"], categories=BIN_ORDER, ordered=True)
    return out.sort_values(["year", "bin"]).reset_index(drop=True)


def retention(persons: pd.DataFrame, py: pd.DataFrame,
              version: str) -> pd.DataFrame:
    """Cohort retention: share of first-seen cohort active k years later."""
    k = py["year"].to_numpy() - py["first_year"].to_numpy()
    df = pd.DataFrame({"cohort": py["first_year"].to_numpy(), "k": k})
    df = df[df["cohort"] >= 2008]
    n_cohort = (persons[persons["first_year"] >= 2008]
                .groupby("first_year").size())
    act = df.groupby(["cohort", "k"]).size().rename("n_active").reset_index()
    act["n_cohort"] = act["cohort"].map(n_cohort)
    act["retention"] = (act["n_active"] / act["n_cohort"]).round(4)
    act["version"] = version
    return act[["version", "cohort", "k", "n_cohort", "n_active", "retention"]]


def concentration(row_pid: np.ndarray, row_year: np.ndarray,
                  version: str) -> pd.DataFrame:
    """Annual concentration: top receipt shares + Gini per active year."""
    counts = (pd.DataFrame({"pid": row_pid, "year": row_year})
              .groupby(["year", "pid"]).size().rename("n").reset_index())
    recs = []
    for y, g in counts.groupby("year"):
        v = np.sort(g["n"].to_numpy().astype(float))
        n = len(v)
        tot = v.sum()
        k1 = max(1, int(np.ceil(n * 0.01)))
        k10 = max(1, int(np.ceil(n * 0.10)))
        i = np.arange(1, n + 1)
        gini = (2 * (i * v).sum() / (n * tot)) - (n + 1) / n
        recs.append({"version": version, "year": int(y), "n_active": n,
                     "top1_share": round(float(v[-k1:].sum() / tot), 4),
                     "top10_share": round(float(v[-k10:].sum() / tot), 4),
                     "gini": round(float(gini), 4)})
    out = pd.DataFrame(recs).sort_values("year").reset_index(drop=True)
    out["partial"] = out["year"].isin(PARTIAL_YEARS)
    return out


def leaderboard(persons: pd.DataFrame, rows: pd.DataFrame,
                row_pid: np.ndarray, version: str,
                top_global: int = 100, top_band: int = 50) -> pd.DataFrame:
    """Top investigators by lifetime IND references AND by trials/year rate.

    Two metric boards (display refined by mode in both): 'receipts' ranks by
    lifetime total, 'rate' by trials/year = n_trials / inclusive first-last
    span. Separate boards because top-by-total is not top-by-rate.
    """
    persons = persons.copy()
    persons["_pos"] = np.arange(len(persons))
    persons["tpy"] = (persons["n_trials"]
                      / (persons["last_year"] - persons["first_year"] + 1))
    ok = ~persons["display_name"].str.match(r"^(NG,|,$|\?\?|,?\s*$)", na=False)
    elig = persons[ok]

    frames = []
    for metric, keys in [("receipts", ["n_trials", "n_years"]),
                         ("rate", ["tpy", "n_trials"])]:
        picks: dict[int, list[tuple[str, str, int]]] = {}

        def take(df: pd.DataFrame, scope: str, scope_value: str, k: int,
                 _keys: list = keys,
                 _picks: dict = picks) -> None:
            top = df.nlargest(k, _keys)
            for rank, (_, r) in enumerate(top.iterrows(), 1):
                _picks.setdefault(int(r["_pos"]), []).append(
                    (scope, scope_value, rank))

        take(elig, "global", "ALL", top_global)
        for band, dfb in elig.groupby("band", observed=True):
            take(dfb, "band", str(band), top_band)

        # Refine display name/site by mode over each picked person's rows.
        cand = np.array(sorted(picks))
        rdf = pd.DataFrame({"pid": row_pid,
                            "name": rows["disp_name"].to_numpy(),
                            "site": rows["SITE"].to_numpy()})
        rdf = rdf[rdf["pid"].isin(cand)]
        mode_name = rdf.groupby("pid")["name"].agg(
            lambda s: s.value_counts().index[0])
        mode_site = rdf.groupby("pid")["site"].agg(
            lambda s: s.value_counts().index[0])

        recs = []
        for pos, scopes in picks.items():
            r = persons.iloc[pos]
            for scope, scope_value, rank in scopes:
                recs.append({
                    "version": version, "metric": metric, "scope": scope,
                    "scope_value": scope_value, "rank": rank,
                    "display_name": mode_name.get(pos, r["display_name"]),
                    "deg": r["deg"], "site": mode_site.get(pos, r["site"]),
                    "city": r["city"], "state": r["state"],
                    "country": r["country"], "band": r["band"],
                    "n_trials": int(r["n_trials"]),
                    "n_years": int(r["n_years"]),
                    "first_year": int(r["first_year"]),
                    "last_year": int(r["last_year"]),
                    "tpy": round(float(r["tpy"]), 4),
                })
        frames.append(pd.DataFrame(recs))
    out = pd.concat(frames)
    out = out.sort_values(["metric", "scope", "scope_value", "rank"])
    return out.reset_index(drop=True)


def reorder_bands(df: pd.DataFrame, col: str = "band") -> pd.DataFrame:
    df[col] = pd.Categorical(df[col], categories=BAND_ORDER, ordered=True)
    return df.sort_values([c for c in df.columns if c in ("version", "year")] + [col]) \
             .reset_index(drop=True)
