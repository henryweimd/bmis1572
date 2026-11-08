"""Cross-site movers (Unit 3, experimental): name-only linkage layered over
merged persons to find investigators split across sites/countries.

Heuristic verdicts per name cluster (same normalized name, >=2 persons):
  mover-likely     active-year ranges are sequential (no pairwise overlap)
  collision-likely overlapping years across >1 country, or >50 same-name
                   persons (common-name pile-up)
  ambiguous        overlapping years within one country
Blank/NG names are never clustered. Headline person counts are unchanged;
the summary reports the implied adjustment range as bounds, not a revision.

Outputs: mover_cluster, mover_person (clustered members only), mover_summary.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

PILEUP_N = 50


def name_key(s: pd.Series) -> pd.Series:
    return (s.str.normalize("NFKD")
             .str.encode("ascii", "ignore").str.decode("ascii").str.upper()
             .str.replace(r"[^A-Z ]", "", regex=True)
             .str.replace(r"\s+", " ", regex=True).str.strip())


def build(persons: pd.DataFrame, py: pd.DataFrame) -> dict[str, pd.DataFrame]:
    p = persons.reset_index(drop=True)
    key = name_key(p["display_name"].fillna(""))
    ok = ~key.isin(["", "NG", "NG NG"])
    years: dict[int, set] = {}
    for pid, grp in py.groupby("pid"):
        years[int(pid)] = set(grp["year"].tolist())
    clusters, members = [], []
    cid = 0
    for k, idx in p[ok].groupby(key[ok]).groups.items():
        members_idx = list(idx)
        if len(members_idx) < 2:
            continue
        sub = p.iloc[members_idx]
        countries = sorted(sub["country"].astype(str).unique().tolist())
        ysets = [years.get(i, set()) for i in members_idx]
        if len(members_idx) > PILEUP_N:
            verdict = "collision-likely"
        else:
            overlap = any(a & b for x, a in enumerate(ysets)
                          for b in ysets[x + 1:])
            if not overlap:
                verdict = "mover-likely"
            elif len(countries) > 1:
                verdict = "collision-likely"
            else:
                verdict = "ambiguous"
        clusters.append({
            "cluster_id": cid,
            "name_key": k,
            "display_name": sub["display_name"].iloc[0],
            "n_persons": len(members_idx),
            "verdict": verdict,
            "countries": ";".join(countries),
            "n_countries": len(countries),
            "first_year": int(sub["first_year"].min()),
            "last_year": int(sub["last_year"].max()),
            "n_trials": int(sub["n_trials"].sum()),
        })
        for i in members_idx:
            members.append({"person_id": p["person_id"].iloc[i],
                            "cluster_id": cid})
        cid += 1
    cl = pd.DataFrame(clusters)
    if len(cl):
        cl = cl.sort_values(["n_persons", "name_key"],
                            ascending=[False, True]).reset_index(drop=True)
        idmap = dict(zip(cl["cluster_id"], cl.index))
        cl["cluster_id"] = cl["cluster_id"].map(idmap)
        mem = pd.DataFrame(members)
        mem["cluster_id"] = mem["cluster_id"].map(idmap)
    else:
        mem = pd.DataFrame(columns=["person_id", "cluster_id"])
    n_merge_all = int((cl["n_persons"] - 1).sum()) if len(cl) else 0
    mv = cl[cl["verdict"] == "mover-likely"] if len(cl) else cl
    n_merge_mv = int((mv["n_persons"] - 1).sum()) if len(mv) else 0
    summ = pd.DataFrame([{
        "version": "merged",
        "n_persons_total": len(p),
        "n_clusters": len(cl),
        "n_mover_likely": int((cl["verdict"] == "mover-likely").sum()) if len(cl) else 0,
        "n_collision_likely": int((cl["verdict"] == "collision-likely").sum()) if len(cl) else 0,
        "n_ambiguous": int((cl["verdict"] == "ambiguous").sum()) if len(cl) else 0,
        "persons_in_clusters": int(cl["n_persons"].sum()) if len(cl) else 0,
        "adj_merge_all": n_merge_all,
        "adj_movers_only": n_merge_mv,
    }])
    return {"mover_cluster": cl, "mover_person": mem, "mover_summary": summ}
