"""Static PNG charts with inlined definition captions."""

from __future__ import annotations

import textwrap
from pathlib import Path

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import FuncFormatter, MaxNLocator  # noqa: E402

from aggregate import BIN_ORDER, DEFINITIONS
from geo_bands import BAND_ORDER

BAND_COLORS = {
    "United States": "#1f77b4",
    "Europe (EU+UK)": "#ff7f0e",
    "South America": "#2ca02c",
    "Middle East": "#d62728",
    "South Asia": "#9467bd",
    "East Asia & Pacific": "#8c564b",
    "Rest of world": "#7f7f7f",
    "Unknown": "#bcbd22",
}

plt.rcParams.update({
    "figure.dpi": 150, "savefig.dpi": 150,
    "font.size": 9, "axes.titlesize": 12, "axes.titleweight": "bold",
    "axes.grid": True, "grid.alpha": 0.3,
})

_comma = FuncFormatter(lambda v, _: f"{v:,.0f}")


def _partial_shade(ax, years) -> None:
    for y in (2008, 2026):
        if years.min() <= y <= years.max():
            ax.axvspan(y - 0.5, y + 0.5, color="gray", alpha=0.15, zorder=0)
    ax.text(0.01, 0.02, "gray bands = partial years (2008 ramp-up, 2026 thru Aug)",
            transform=ax.transAxes, fontsize=7, color="dimgray", va="bottom")


def _caption(fig, text: str) -> None:
    wrapped = "\n".join(textwrap.wrap(text, 140))
    fig.text(0.5, 0.01, wrapped, ha="center", va="bottom", fontsize=7,
             color="dimgray", style="italic")


def chart_investigators_geo(iyg: pd.DataFrame, out: Path) -> None:
    d = iyg[(iyg["version"] == "strict") & (iyg["year"] >= 2008)].copy()
    piv = d.pivot_table(index="year", columns="band", values="n_active",
                        aggfunc="sum", observed=False).reindex(columns=BAND_ORDER)
    fig, ax = plt.subplots(figsize=(10, 5.2))
    for band in BAND_ORDER:
        if band in piv:
            ax.plot(piv.index, piv[band], label=band,
                    color=BAND_COLORS[band], lw=2 if band == "United States" else 1.4)
    ax.axvline(2018, color="black", ls="--", lw=1, alpha=0.6)
    ax.text(2018.1, ax.get_ylim()[1] * 0.92, "GDPR (May 2018)", fontsize=8)
    _partial_shade(ax, piv.index)
    ax.set_title("Active clinical investigators per year by geography (Strict)")
    ax.set_xlabel("Receipt year")
    ax.set_ylabel("Unique active persons")
    ax.yaxis.set_major_formatter(_comma)
    ax.legend(fontsize=8, loc="upper left")
    fig.tight_layout(rect=(0, 0.12, 1, 1))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["person_strict"] + " " +
             DEFINITIONS["active"] + " " + DEFINITIONS["bmis_scope"])
    fig.savefig(out / "investigators_geo_yoy.png", bbox_inches="tight")
    plt.close(fig)


def chart_new_returning(iyg: pd.DataFrame, out: Path) -> None:
    d = (iyg[(iyg["version"] == "strict") & (iyg["year"] >= 2008)]
         .groupby("year")[["n_new", "n_returning"]].sum())
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.bar(d.index, d["n_returning"], label="Returning", color="#1f77b4")
    ax.bar(d.index, d["n_new"], bottom=d["n_returning"], label="New",
           color="#ff7f0e")
    _partial_shade(ax, d.index)
    ax.set_title("New vs. returning investigators per year (Strict, global)")
    ax.set_xlabel("Receipt year")
    ax.set_ylabel("Unique active persons")
    ax.yaxis.set_major_formatter(_comma)
    ax.legend()
    fig.tight_layout(rect=(0, 0.14, 1, 1))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["person_strict"] + " " +
             DEFINITIONS["active"])
    fig.savefig(out / "new_returning.png", bbox_inches="tight")
    plt.close(fig)


def chart_distribution(abins: pd.DataFrame, out: Path) -> None:
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.4))
    tot = (abins[abins["version"] == "strict"].groupby("bin", observed=True)
           ["n_active"].sum().reindex(BIN_ORDER))
    a1.bar(tot.index.astype(str), tot.values, color="#2ca02c")
    a1.set_title("Person-years by lifetime trial bin")
    a1.set_xlabel("Lifetime IND references per person")
    a1.set_ylabel("Active person-years (all years)")
    a1.yaxis.set_major_formatter(_comma)
    piv = (abins[(abins["version"] == "strict") & (abins["year"] >= 2008)]
           .pivot_table(index="year", columns="bin", values="n_active",
                        aggfunc="sum", observed=False))
    share = (piv["1"] / piv.sum(axis=1) * 100).dropna()
    a2.plot(share.index, share.values, marker="o", color="#d62728")
    _partial_shade(a2, share.index)
    a2.set_title("One-trial share of active investigators")
    a2.set_xlabel("Receipt year")
    a2.set_ylabel("% active with lifetime = 1")
    fig.suptitle("Trials-per-person distribution (Strict)", fontweight="bold")
    fig.tight_layout(rect=(0, 0.16, 1, 0.92))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["trials_per_person"] + " " +
             DEFINITIONS["one_trial"])
    fig.savefig(out / "trials_per_person.png", bbox_inches="tight")
    plt.close(fig)


def chart_retention(ret: pd.DataFrame, out: Path) -> None:
    d = ret[ret["version"] == "strict"]
    fig, ax = plt.subplots(figsize=(10, 4.8))
    for c, color in zip([2009, 2013, 2017, 2021],
                        ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]):
        s = d[d["cohort"] == c].sort_values("k")
        ax.plot(s["k"], s["retention"] * 100, marker="o", ms=3,
                label=f"{c} cohort (n={int(s['n_cohort'].iloc[0]):,})",
                color=color)
    ax.set_title("Cohort retention: % still active k years after first seen (Strict)")
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_xlabel("Years since first receipt (k)")
    ax.set_ylabel("% of cohort active")
    ax.legend(fontsize=8)
    fig.tight_layout(rect=(0, 0.14, 1, 1))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["retention"] + " " +
             DEFINITIONS["person_strict"])
    fig.savefig(out / "retention.png", bbox_inches="tight")
    plt.close(fig)


def chart_concentration(cc: pd.DataFrame, out: Path) -> None:
    d = cc[(cc["version"] == "strict") & (cc["year"] >= 2008)].set_index("year").sort_index()
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.4))
    a1.plot(d.index, d["top1_share"] * 100, marker="o", ms=3, label="Top 1%", color="#d62728")
    a1.plot(d.index, d["top10_share"] * 100, marker="s", ms=3, label="Top 10%", color="#1f77b4")
    _partial_shade(a1, d.index)
    a1.set_title("Top shares of yearly receipts")
    a1.set_xlabel("Receipt year")
    a1.set_ylabel("% of receipts")
    a1.legend(fontsize=8)
    a2.plot(d.index, d["gini"], marker="o", ms=3, color="#2ca02c")
    _partial_shade(a2, d.index)
    a2.set_title("Gini of per-investigator yearly receipts")
    a2.set_xlabel("Receipt year")
    a2.set_ylabel("Gini")
    fig.suptitle("Work concentration (Strict)", fontweight="bold")
    fig.tight_layout(rect=(0, 0.16, 1, 0.92))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["concentration"])
    fig.savefig(out / "concentration.png", bbox_inches="tight")
    plt.close(fig)


def chart_trials(trials: pd.DataFrame, out: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 4.6))
    adj = trials[trials["scope"] == "adjusted"].set_index("year").sort_index()
    unadj = trials[trials["scope"] == "unadjusted"].set_index("year").sort_index()
    ax.plot(unadj.index, unadj["n_starts"], label="Starts, global industry",
            color="#7f7f7f", lw=1.6)
    ax.plot(adj.index, adj["n_starts"], label="Starts, US-site industry",
            color="#1f77b4", lw=2)
    if "n_running" in adj and adj["n_running"].notna().any():
        ax.plot(adj.index, adj["n_running"], label="Running, US-site industry",
                color="#ff7f0e", lw=2)
    ax.axvspan(2025.5, 2026.5, color="gray", alpha=0.15, zorder=0)
    ax.text(0.01, 0.02, "gray band = 2026 starts partial (CT.gov snapshot; "
            "running is current-year)", transform=ax.transAxes, fontsize=7,
            color="dimgray", va="bottom")
    ax.set_title("Industry interventional trials per year (clinicaltrials.gov)")
    ax.set_xlabel("Year")
    ax.set_ylabel("Trials")
    ax.yaxis.set_major_formatter(_comma)
    ax.legend()
    fig.tight_layout(rect=(0, 0.14, 1, 1))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["scope_unadjusted"] + " " +
             DEFINITIONS["scope_adjusted"] + " " + DEFINITIONS["starts_running"])
    fig.savefig(out / "trials_yoy.png", bbox_inches="tight")
    plt.close(fig)


def chart_tightness(tight: pd.DataFrame, out: Path) -> None:
    d = tight[(tight["version"] == "strict") &
              (tight["scope"] == "adjusted")].set_index("year").sort_index()
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.plot(d.index, d["per_running"], marker="o", label="Active per running trial",
            color="#d62728")
    ax.plot(d.index, d["per_start"], marker="s", label="Active per started trial",
            color="#1f77b4")
    _partial_shade(ax, d.index)
    ax.set_title("Investigator tightness ratio, US (Strict persons / adjusted trials)")
    ax.set_xlabel("Year")
    ax.set_ylabel("Investigators per trial")
    ax.legend()
    fig.tight_layout(rect=(0, 0.14, 1, 1))
    _caption(fig, "DEFINITIONS: " + DEFINITIONS["tightness"] + " " +
             DEFINITIONS["active"] + " " + DEFINITIONS["scope_adjusted"])
    fig.savefig(out / "tightness.png", bbox_inches="tight")
    plt.close(fig)


def chart_org_trends(oy: pd.DataFrame, key: str, noun: str, plural: str,
                     defn: str, filename: str, out: Path) -> None:
    d = oy[oy["year"] >= 2008].copy()
    top8 = (d.groupby(key)["n_receipts"].sum().sort_values(ascending=False)
            .head(8).index.tolist())
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
              "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.4))
    piv = (d[d[key].isin(top8)]
           .pivot_table(index="year", columns=key, values="n_receipts",
                        aggfunc="sum", observed=False).fillna(0))
    for org, color in zip(top8, colors):
        if org in piv:
            a1.plot(piv.index, piv[org], label=str(org)[:24], color=color, lw=1.6)
    _partial_shade(a1, piv.index)
    a1.set_title(f"Top 8 {plural} by receipts")
    a1.set_xlabel("Receipt year")
    a1.set_ylabel("Receipts")
    a1.yaxis.set_major_formatter(_comma)
    a1.legend(fontsize=7, loc="upper left")
    agg = d.groupby("year").agg(n_orgs=(key, "nunique"),
                                n_entities=("n_entities", "sum"))
    a2.plot(agg.index, agg["n_orgs"], marker="o", ms=3, label=f"Active {plural}",
            color="#1f77b4")
    a2.plot(agg.index, agg["n_entities"], marker="s", ms=3,
            label="Active entities", color="#2ca02c")
    _partial_shade(a2, agg.index)
    a2.set_title(f"Active {plural} and entities")
    a2.set_xlabel("Receipt year")
    a2.yaxis.set_major_formatter(_comma)
    a2.legend(fontsize=8)
    fig.suptitle(f"{noun} trends", fontweight="bold")
    fig.tight_layout(rect=(0, 0.16, 1, 0.92))
    _caption(fig, "DEFINITIONS: " + defn + " " + DEFINITIONS["partial"])
    fig.savefig(out / filename, bbox_inches="tight")
    plt.close(fig)


def build_all(tables: dict[str, pd.DataFrame], out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    chart_investigators_geo(tables["investigators_year_geo"], out)
    chart_new_returning(tables["investigators_year_geo"], out)
    chart_distribution(tables["active_bins"], out)
    chart_retention(tables["retention"], out)
    chart_concentration(tables["concentration"], out)
    chart_org_trends(tables["cro_year"], "cro", "CRO", "CROs",
                     DEFINITIONS["cro"], "cro_trends.png", out)
    chart_org_trends(tables["irb_year"], "irb", "IRB", "IRBs",
                     DEFINITIONS["irb"], "irb_trends.png", out)
    chart_trials(tables["trials_year"], out)
    chart_tightness(tables["tightness"], out)
    return sorted(p.name for p in out.glob("*.png"))
