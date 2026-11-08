"""Retention decomposition (Unit 2): partition each vintage cohort at lag k into
continuously-active, re-entered, gapped-with-future-return, and dormant.

Right-censoring-aware: 'gapped' vs 'dormant' is judged only on years observed
through 2025; `followup` = 2025 - (cohort + k) records how much future was
visible. Recent (cohort, k) cells have thin follow-up by construction.

Output `retention_decomp`: version, cohort, band, k, n_cohort, n_continuous,
n_reentered, n_gapped_future, n_dormant, followup.
Conservation: the four n_* partitions sum to n_cohort in every row.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

KMAX = 10
YEAR_MAX = 2025


def build(persons: pd.DataFrame, py: pd.DataFrame, version: str) -> pd.DataFrame:
    f = persons["first_year"].to_numpy()
    bands = persons["band"].astype(str).to_numpy()
    n_p = len(persons)
    y0 = int(min(py["year"].min(), f.min()))
    ny = YEAR_MAX - y0 + 1
    act = np.zeros((n_p, ny), dtype=bool)
    inwin = py["year"].to_numpy() <= YEAR_MAX
    act[py["pid"].to_numpy()[inwin],
        py["year"].to_numpy()[inwin] - y0] = True
    fidx = np.clip(f - y0, 0, ny - 1)
    ar = np.arange(ny)
    # inactive years strictly after first-seen, cumulatively (gap detector)
    gap_cum = ((~act) & (ar[None, :] > fidx[:, None])).cumsum(axis=1)
    # active years from t through end (future-return detector)
    suffix = act[:, ::-1].cumsum(axis=1)[:, ::-1]
    rows = []
    for k in range(KMAX + 1):
        yidx = fidx + k
        ok = (f >= 2009) & (f <= YEAR_MAX) & (yidx < ny)
        idx = np.nonzero(ok)[0]
        if not len(idx):
            continue
        yi = yidx[idx]
        now = act[idx, yi]
        cont = gap_cum[idx, yi] == 0
        fut = np.zeros(len(idx), dtype=bool)
        has_after = yi + 1 < ny
        fut[has_after] = suffix[idx[has_after], yi[has_after] + 1] > 0
        part = np.where(now, np.where(cont, "cont", "re"),
                        np.where(fut, "gap", "dor"))
        df = pd.DataFrame({"cohort": f[idx], "band": bands[idx], "part": part})
        g = df.groupby(["cohort", "band", "part"], observed=True).size()
        g = g.unstack(fill_value=0)
        for c in ["cont", "re", "gap", "dor"]:
            if c not in g.columns:
                g[c] = 0
        g = g.reset_index()
        g["k"] = k
        g["n_cohort"] = g[["cont", "re", "gap", "dor"]].sum(axis=1)
        g["followup"] = YEAR_MAX - (g["cohort"] + k)
        g["version"] = version
        rows.append(g.rename(columns={"cont": "n_continuous",
                                      "re": "n_reentered",
                                      "gap": "n_gapped_future",
                                      "dor": "n_dormant"}))
    out = pd.concat(rows, ignore_index=True)
    tot = (out["n_continuous"] + out["n_reentered"]
           + out["n_gapped_future"] + out["n_dormant"])
    assert (tot == out["n_cohort"]).all(), "decomposition must partition the cohort"
    return out[["version", "cohort", "band", "k", "n_cohort", "n_continuous",
                "n_reentered", "n_gapped_future", "n_dormant", "followup"]]
