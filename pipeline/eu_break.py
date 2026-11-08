"""EU break study (Unit 1): pre-trend extrapolation + placebo breaks.

Spec: docs/eu_break.md (pre-registered before estimation).
Input: investigators_year_geo (merged version). Outputs:
  eu_break_band:    run, year, band, n_active, share, exp_share, exp_n,
                    gap_share, gap_n  (expected/gap only on post years)
  eu_break_summary: run, band, post_gap_share, post_gap_n, pre_mean_n,
                    verdict ('causal-consistent' / 'descriptive-only',
                    main run EU row only; controls carry ''), dib_share,
                    dib_n (difference-in-breaks, main run EU row only)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

TREATED = "Europe (EU+UK)"
CONTROLS = ["United States", "East Asia & Pacific", "South America"]
RUNS = {
    "2021": (2009, 2020, 2021, 2025),
    "placebo_2016": (2009, 2015, 2016, 2020),
    "placebo_2017": (2009, 2016, 2017, 2020),
}


def _fit_gap(g: pd.DataFrame, pre0: int, pre1: int, post0: int, post1: int,
             run: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    pre = g[(g["year"] >= pre0) & (g["year"] <= pre1)]
    post = g[(g["year"] >= post0) & (g["year"] <= post1)].copy()
    rows, summ = [], []
    gb = g[g["band"].isin([TREATED, *CONTROLS])]
    for band, b in gb.groupby("band", observed=True):
        bp = pre[pre["band"] == band].sort_values("year")
        x = bp["year"].to_numpy(float)
        s_slope, s_int = np.polyfit(x, bp["share"].to_numpy(float), 1)
        n_slope, n_int = np.polyfit(x, bp["n_active"].to_numpy(float), 1)
        bpost = post[post["band"] == band].sort_values("year")
        for _, r in bpost.iterrows():
            es = s_slope * r["year"] + s_int
            en = n_slope * r["year"] + n_int
            rows.append({"run": run, "year": int(r["year"]), "band": band,
                         "n_active": int(r["n_active"]), "share": float(r["share"]),
                         "exp_share": float(es), "exp_n": float(en),
                         "gap_share": float(r["share"] - es),
                         "gap_n": float(r["n_active"] - en)})
        pp = bpost["share"].to_numpy(float) - (s_slope * bpost["year"].to_numpy(float) + s_int)
        pn = bpost["n_active"].to_numpy(float) - (n_slope * bpost["year"].to_numpy(float) + n_int)
        summ.append({"run": run, "band": band,
                     "post_gap_share": float(pp.mean()),
                     "post_gap_n": float(pn.mean()),
                     "pre_mean_n": float(bp["n_active"].mean())})
    return pd.DataFrame(rows), pd.DataFrame(summ)


def build(iyg: pd.DataFrame) -> dict[str, pd.DataFrame]:
    m = iyg[(iyg["version"] == "merged") & (iyg["year"] >= 2009)
            & (iyg["year"] <= 2025)].copy()
    tot = m.groupby("year")["n_active"].sum().rename("total")
    m = m.merge(tot, on="year")
    m["share"] = m["n_active"] / m["total"]
    bands, sums = [], []
    for run, (pre0, pre1, post0, post1) in RUNS.items():
        b, s = _fit_gap(m, pre0, pre1, post0, post1, run)
        bands.append(b)
        sums.append(s)
    band = pd.concat(bands, ignore_index=True)
    summ = pd.concat(sums, ignore_index=True)
    # Difference-in-breaks + verdict on main-run EU row (spec decision rule).
    main = summ[summ["run"] == "2021"].set_index("band")
    eu = main.loc[TREATED]
    cg = main.loc[CONTROLS]
    dib_s = float(eu["post_gap_share"] - cg["post_gap_share"].mean())
    dib_n = float(eu["post_gap_n"] - cg["post_gap_n"].mean())
    pl = summ[summ["run"].isin(["placebo_2016", "placebo_2017"])
              & (summ["band"] == TREATED)]["post_gap_share"].abs().max()
    verdict = ("causal-consistent"
               if (eu["post_gap_share"] <= -0.10
                   or eu["post_gap_n"] <= -0.50 * eu["pre_mean_n"])
               and cg["post_gap_share"].abs().max() < 0.03 and pl < 0.03
               else "descriptive-only")
    summ["dib_share"] = np.nan
    summ["dib_n"] = np.nan
    summ["verdict"] = ""
    ix = (summ["run"] == "2021") & (summ["band"] == TREATED)
    summ.loc[ix, "dib_share"] = dib_s
    summ.loc[ix, "dib_n"] = dib_n
    summ.loc[ix, "verdict"] = verdict
    return {"eu_break_band": band.reset_index(drop=True),
            "eu_break_summary": summ.reset_index(drop=True)}
