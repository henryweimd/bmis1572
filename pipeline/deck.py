"""Slide-deck export: pre-generated PPTX + PDF from captioned charts.

One slide-content spec (live numbers from curated tables + manifest stats)
rendered twice: python-pptx for PowerPoint, reportlab canvas for PDF.
Every slide carries the preliminary-analysis caveat footer plus source
and repo citations.

Usage (from repo root):
    uv run python pipeline/deck.py
    # or via build.py (runs after charts unless --skip-charts)
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "data" / "curated"
CHARTS = ROOT / "charts"
EXPORTS = ROOT / "exports"
SLUG = "bmis-supply-deck"

CAVEAT = "PRELIMINARY ANALYSIS ONLY \u2014 NOT FOR DECISION-MAKING"
SOURCES_LINE = ("FDA BMIS (Form 1572, thru Aug 2026) \u00b7 clinicaltrials.gov API v2 \u00b7 "
                "github.com/henryweimd/bmis1572")
FDA_URL = ("https://www.fda.gov/drugs/drug-approvals-and-databases/"
           "bioresearch-monitoring-information-system-bmis")
CTGOV_URL = "https://clinicaltrials.gov/data-api/api"
REPO_URL = "https://github.com/henryweimd/bmis1572"
CFDI_URL = "https://beian.cfdi.org.cn/CTMDS/apps/pub/drugPublic1.jsp"


def load_numbers(stats: dict) -> dict:
    n: dict = {}
    n["g09"], n["g25"] = stats["active_2009_2025"]["strict"]
    n["gg"] = stats["active_growth_pct_09_25"]["strict"]
    n["u09"], n["u25"] = stats["us_active_2009_2025"]["strict"]
    n["ug"] = stats["us_active_growth_pct_09_25"]["strict"]
    n["one"] = stats["strict_one_trial_share"] * 100
    n["med"] = stats["strict_median_trials"]
    n["mean"] = stats["strict_mean_trials"]
    iyg = pd.read_parquet(CURATED / "investigators_year_geo.parquet")
    s25 = iyg[(iyg["version"] == "strict") & (iyg["year"] == 2025)]
    n["newshare"] = s25["n_new"].sum() / s25["n_active"].sum() * 100
    eu = iyg[(iyg["version"] == "strict") & (iyg["band"] == "Europe (EU+UK)") &
             (iyg["year"].isin([2019, 2021]))].set_index("year")["n_active"]
    tot = iyg[(iyg["version"] == "strict") & (iyg["year"].isin([2019, 2021]))].groupby(
        "year")["n_active"].sum()
    n["eu19"] = eu.loc[2019] / tot.loc[2019] * 100
    n["eu21"] = eu.loc[2021] / tot.loc[2021] * 100
    ret = pd.read_parquet(CURATED / "retention.parquet")
    r09 = ret[(ret["version"] == "strict") & (ret["cohort"] == 2009)].set_index("k")["retention"]
    n["r1"], n["r10"] = r09.loc[1] * 100, r09.loc[10] * 100
    cc = pd.read_parquet(CURATED / "concentration.parquet")
    c09 = cc[(cc["version"] == "strict") & (cc["year"] == 2009)].iloc[0]
    c25 = cc[(cc["version"] == "strict") & (cc["year"] == 2025)].iloc[0]
    n["t09"], n["t25"] = c09["top10_share"] * 100, c25["top10_share"] * 100
    n["gini09"], n["gini25"] = c09["gini"], c25["gini"]
    ti = pd.read_parquet(CURATED / "tightness.parquet")
    t = ti[(ti["version"] == "strict") & (ti["scope"] == "adjusted")].set_index("year")
    n["p09"], n["p25"] = t.loc[2009, "per_running"], t.loc[2025, "per_running"]
    tr = pd.read_parquet(CURATED / "trials_year.parquet")
    n["starts25"] = tr[(tr["scope"] == "unadjusted") & (tr["year"] == 2025)]["n_starts"].iloc[0]
    nr = tr[(tr["scope"] == "adjusted") & (tr["year"] == 2025)]["n_running"].iloc[0]
    n["run25"] = int(nr) if pd.notna(nr) else None
    cy = pd.read_parquet(CURATED / "cro_year.parquet")
    n["cro25"] = cy[cy["year"] == 2025]["cro"].nunique()
    n["cro_top"] = pd.read_parquet(
        CURATED / "cro_index.parquet").sort_values("n_receipts", ascending=False).iloc[0]["cro"]
    iy = pd.read_parquet(CURATED / "irb_year.parquet")
    n["irb25"] = iy[iy["year"] == 2025]["irb"].nunique()
    n["irb_top"] = pd.read_parquet(
        CURATED / "irb_index.parquet").sort_values("n_receipts", ascending=False).iloc[0]["irb"]
    syg = pd.read_parquet(CURATED / "sites_year_geo.parquet")
    n["sites25"] = syg[(syg["version"] == "strict") & (syg["year"] == 2025)]["n_sites"].sum()
    sx = pd.read_parquet(CURATED / "site_index.parquet")
    top = sx[sx["site_id"].str.startswith("strict:")].sort_values(
        "n_receipts", ascending=False).iloc[0]
    n["site_top"] = (top["display_name"], int(top["n_inv_ever"]), int(top["n_receipts"]))
    n["ct_trials"] = None
    if (CURATED / "ctgov_trials.parquet").exists():
        tr2 = pd.read_parquet(CURATED / "ctgov_trials.parquet")
        n["ct_trials"] = len(tr2)
        n["ct_sponsors"] = int(tr2["sponsor"].nunique())
        tsp = tr2.groupby("sponsor_disp").size().sort_values(ascending=False)
        n["ct_top_sp"] = (tsp.index[0], int(tsp.iloc[0]))
        tph = tr2.groupby("phase").size().sort_values(ascending=False)
        n["ct_top_ph"] = (tph.index[0], int(tph.iloc[0]))
        n["ct_with_off"] = int(pd.read_parquet(
            CURATED / "ctgov_officials.parquet", columns=["nct"])["nct"].nunique())
        lk = pd.read_parquet(CURATED / "person_ctgov_link.parquet")
        n["lk_persons"] = int(lk["person_id"].nunique())
        n["lk_strong"] = int((lk["tier"] == "strong").sum())
        n["lk_weak"] = int((lk["tier"] == "weak").sum())
        pi = pd.read_parquet(CURATED / "person_index.parquet",
                             columns=["person_id", "display_name"])
        tk = (lk.merge(pi, on="person_id").groupby("display_name")["nct"]
              .nunique().sort_values(ascending=False))
        n["lk_top"] = (tk.index[0], int(tk.iloc[0]))
    n["cn_pairs"] = None
    if (CURATED / "cn_filing_year.parquet").exists():
        fy = pd.read_parquet(CURATED / "cn_filing_year.parquet")
        lb = pd.read_parquet(CURATED / "cn_leaderboard.parquet")
        si = pd.read_parquet(CURATED / "cn_site_index.parquet")
        n["cn_pairs"] = int(fy["cum_pairs"].max())
        n["cn_v20"] = int(fy[fy["year"] == 2020]["n_pairs"].sum())
        n["cn_names"] = len(lb)
        n["cn_insts"] = len(si)
        py = pd.read_parquet(CURATED / "cn_province_year.parquet")
        tp = py.groupby("province_en")["n_pairs"].sum().sort_values(ascending=False)
        n["cn_top_prov"] = (tp.index[0], int(tp.iloc[0]))
        sy = pd.read_parquet(CURATED / "cn_specialty_year.parquet")
        ts = sy.groupby("group_en")["n_pairs"].sum().sort_values(ascending=False)
        n["cn_top_spec"] = (ts.index[0], int(ts.iloc[0]))
    return n


def build_slides(n: dict) -> list[dict]:
    f = lambda v: f"{int(v):,}"
    run = f(n["run25"]) if n["run25"] is not None else "n/a"
    has_cn = n["cn_pairs"] is not None
    has_ct = n["ct_trials"] is not None
    slides = [
        {"kind": "title", "title": "The U.S. Clinical-Trial Investigator Supply",
         "sub": ("A preliminary descriptive analysis of FDA BMIS Form 1572 filings, "
                 "benchmarked against industry trials"),
         "meta": f"Strict persons \u00b7 2009\u20132025 \u00b7 generated {date.today().isoformat()}"},
        {"kind": "bullets", "title": "What this is (and isn\u2019t)",
         "bullets": [
             "Supply = clinical investigators (CIs) named on Form 1572 filings in FDA\u2019s BMIS file.",
             "Persons are name+site clusters: Strict (headline), Merged, Raw bound the identity call.",
             "Active in year = \u22651 receipt; headline window 2009\u20132025.",
             "Demand = industry-led interventional trials (clinicaltrials.gov API), starts + running.",
             "Benchmarks are year-level ratios \u2014 no record-level CI\u2194trial linkage exists.",
         ],
         "footnotes": ["BMIS covers CDER IND drugs/biologics only; FDA states it is not comprehensive.",
                       "2008 is file ramp-up, 2026 partial (thru Aug); both excluded from growth stats."]},
        {"kind": "charts2", "title": "Headline: global flat-to-down, U.S. up",
         "images": ["investigators_geo_yoy.png", "investigators_geo_share.png"],
         "bullets": [f"Global active CIs: {f(n['g09'])} \u2192 {f(n['g25'])} ({n['gg']:+.1f}%).",
                     f"U.S. active CIs: {f(n['u09'])} \u2192 {f(n['u25'])} ({n['ug']:+.1f}%).",
                     "Ex-U.S. decline concentrates in 2020\u201321; no EU break at GDPR (May 2018).",
                     "2021* follows the 2019 EU Form 1572 restriction (EORTC + NCI RCR "
                     "replacements): the EU drop is administrative, not proven attrition."],
         "footnotes": [f"Strict persons; receipt-year activity. Right = yearly share: EU "
                       f"{n['eu19']:.1f}% (2019) \u2192 {n['eu21']:.1f}% (2021)."]},
        {"kind": "charts2", "title": "Fewer newcomers; a stable returning core",
         "images": ["new_returning.png", "new_returning_share.png"],
         "bullets": [f"{n['newshare']:.0f}% of 2025 actives are first-timers; the rest return.",
                     "Entry is dominated by one-and-done dynamics (next).",
                     "Right panel: new-investigator share of each year."],
         "footnotes": ["New = first receipt ever in that year."]},
        {"kind": "chart", "title": "Half of investigators are one-and-done",
         "images": ["trials_per_person.png"],
         "bullets": [f"{n['one']:.1f}% of persons have exactly one lifetime IND reference.",
                     f"Median {n['med']:.0f}, mean {n['mean']:.2f} trials per investigator.",
                     "A thin right tail of hyper-active CIs carries the top bins."],
         "footnotes": ["One row = one IND reference: a proxy, not confirmed distinct trials."]},
        {"kind": "chart", "title": "Vintage attrition: steep, then flat",
         "images": ["retention.png"],
         "bullets": [f"\u2248{n['r1']:.0f}% of the 2009 vintage is active a year later; "
                     f"\u2248{n['r10']:.0f}% a decade later.",
                     "Curves look alike across vintages: most attrition is immediate."],
         "footnotes": ["Vintage = CIs first seen in that year. Right-censored; 2008 excluded."]},
        {"kind": "chart", "title": "Work is concentrating",
         "images": ["concentration.png"],
         "bullets": [f"Top-10% receipt share: {n['t09']:.0f}% \u2192 {n['t25']:.0f}%.",
                     f"Gini of yearly receipts: {n['gini09']:.2f} \u2192 {n['gini25']:.2f}."],
         "footnotes": ["Annual within-year concentration among actives."]},
        {"kind": "chart", "title": "Demand: industry trial starts",
         "images": ["trials_yoy.png"],
         "bullets": [f"Global industry starts: {f(n['starts25'])} in 2025.",
                     f"U.S.-site running trials: {run} in 2025.",
                     "Starts and supply are not independent \u2014 ratios describe, not explain."],
         "footnotes": ["clinicaltrials.gov API v2, interventional + industry lead sponsor."]},
        {"kind": "chart", "title": "Tightness: investigators per running trial",
         "images": ["tightness.png"],
         "bullets": [f"U.S. CIs per running trial: {n['p09']:.1f} \u2192 {n['p25']:.1f}.",
                     "Adjusted scope: U.S. investigators vs. U.S.-site trials."],
         "footnotes": ["Ecological ratio; supply constraints can move trial counts."]},
        {"kind": "chart", "title": "Sites: where the work happens",
         "images": ["sites_trends.png"],
         "bullets": [f"{f(n['sites25'])} active sites in 2025 (Strict addresses).",
                     "Solo-investigator sites dominate; mega-centers are few.",
                     f"All-time leader: {n['site_top'][0]} "
                     f"({f(n['site_top'][1])} CIs, {f(n['site_top'][2])} refs)."],
         "footnotes": ["Site = street address; branches of one org stay split."]},
        {"kind": "charts2", "title": "CROs and IRBs in context",
         "images": ["cro_trends.png", "irb_trends.png"],
         "bullets": [f"{f(n['cro25'])} CROs and {f(n['irb25'])} IRBs active in 2025.",
                     f"All-time receipt leaders: {n['cro_top']} / {n['irb_top']}."],
         "footnotes": ["Normalized company/board groupings; residual variants audited."]},
        {"kind": "bullets", "title": "Limitations & what\u2019s next",
         "bullets": [
             "No therapeutic-area or phase fields in BMIS; rows carry date + site only.",
             "No person\u2194trial linkage; CT.gov cross-check is institution\u00d7city (experimental).",
             "Person/site counts are ranges across versions, not exact headcounts.",
             "Next: therapeutic-area mix via matched trials; global linkage; cross-site tracking.",
         ],
         "footnotes": []},
        {"kind": "sources", "title": "Sources & reproducibility",
         "bullets": [f"Supply: FDA BMIS quarterly file \u2014 {FDA_URL}",
                     f"Demand: clinicaltrials.gov Data API v2 \u2014 {CTGOV_URL}",
                     f"All code, methods, definitions: {REPO_URL}",
                     "Rebuild locally: uv run python pipeline/build.py"],
         "links": [FDA_URL, CTGOV_URL, REPO_URL],
         "footnotes": []},
    ]
    if has_ct:
        slides[-2:-2] = [
            {"kind": "bullets", "title": "Demand side: US industry trials",
             "bullets": [f"{f(n['ct_trials'])} US industry-led interventional trials "
                         f"from {f(n['ct_sponsors'])} sponsors.",
                         f"Top sponsor: {n['ct_top_sp'][0]} ({f(n['ct_top_sp'][1])} trials).",
                         f"Top phase: {n['ct_top_ph'][0]} ({f(n['ct_top_ph'][1])} trials).",
                         f"{f(n['ct_with_off'])} trials ({n['ct_with_off'] / n['ct_trials'] * 100:.0f}%) "
                         "name ≥1 study official."],
             "footnotes": ["clinicaltrials.gov API v2, all years in file."]},
            {"kind": "bullets", "title": "Person linkage: BMIS \u2194 CT.gov (experimental)",
             "bullets": [f"{f(n['lk_persons'])} BMIS persons match ≥1 study official "
                         f"({f(n['lk_strong'])} strong / {f(n['lk_weak'])} weak links).",
                         f"Most-linked: {n['lk_top'][0].title()} ({n['lk_top'][1]} trials).",
                         "Name + affiliation-overlap match; CT.gov names no site "
                         "investigators, so coverage is thin and KOL-skewed."],
             "footnotes": ["Weak links may be name collisions. See Definitions."]},
        ]
    if has_cn:
        slides[0]["sub"] += "; China CFDI registry supplement"
        slides[-2:-2] = [
            {"kind": "chart", "title": "China: registry stock by filing vintage",
             "images": ["china_filing_yoy.png"],
             "bullets": [f"{f(n['cn_pairs'])} investigator-institution pairs; "
                         f"{f(n['cn_names'])} names; {f(n['cn_insts'])} institutions.",
                         f"Bulk 2019\u201320 registration wave ({f(n['cn_v20'])} pairs in 2020); "
                         "graphs read 2021+.",
                         "Filing year is institution vintage, not investigator activity."],
             "footnotes": ["Pairs count affiliations, not humans; common names collide. "
                           "Partial extract, retrieved 2026-11-06."]},
            {"kind": "charts2", "title": "China: provinces & specialties",
             "images": ["china_province.png", "china_specialty.png"],
             "bullets": [f"Top province: {n['cn_top_prov'][0]} ({f(n['cn_top_prov'][1])} pairs).",
                         f"Top specialty group: {n['cn_top_spec'][0]} "
                         f"({f(n['cn_top_spec'][1])} pairs)."],
             "footnotes": ["ZH authoritative; EN labels curated or pattern-derived."]},
        ]
        slides[-1]["bullets"].insert(2, f"China: CFDI drug-institution filing extract \u2014 {CFDI_URL}")
        slides[-1]["links"].insert(2, CFDI_URL)
    return slides


def render_pptx(slides: list[dict], path: Path) -> None:
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    def textbox(slide, x, y, w, h):
        box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        box.text_frame.word_wrap = True
        return box.text_frame

    def para(tf, text, size, bold=False, italic=False, gray=False, first=False):
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        p.text = text
        p.font.size = Pt(size)
        p.font.bold = bold
        p.font.italic = italic
        p.font.name = "Calibri"
        if gray:
            p.font.color.rgb = __import__("pptx").dml.color.RGBColor(0x59, 0x59, 0x59)
        return p

    def footer(slide):
        tf = textbox(slide, 0.5, 6.85, 12.33, 0.55)
        para(tf, CAVEAT, 9, bold=True, first=True)
        para(tf, SOURCES_LINE, 8, gray=True)

    def titlebar(slide, title):
        para(textbox(slide, 0.5, 0.15, 12.33, 0.8), title, 28, bold=True, first=True)

    def bullets_box(slide, x, y, w, h, items, footnotes, size=18):
        tf = textbox(slide, x, y, w, h)
        for i, b in enumerate(items):
            para(tf, b, size, first=(i == 0))
        for fn in footnotes:
            para(tf, fn, 11, italic=True, gray=True)

    for s in slides:
        slide = prs.slides.add_slide(blank)
        if s["kind"] == "title":
            para(textbox(slide, 0.8, 1.6, 11.7, 1.4), s["title"], 40, bold=True, first=True)
            para(textbox(slide, 0.8, 3.2, 11.7, 1.2), s["sub"], 20, first=True)
            para(textbox(slide, 0.8, 4.6, 11.7, 0.6), s["meta"], 14, gray=True, first=True)
        elif s["kind"] in ("bullets", "sources"):
            titlebar(slide, s["title"])
            tf = textbox(slide, 0.8, 1.4, 11.7, 5.0)
            for i, b in enumerate(s["bullets"]):
                p = para(tf, b, 18, first=(i == 0))
                for url in s.get("links", []):
                    if url in b:
                        for run in p.runs:
                            if url in run.text:
                                run.hyperlink.address = url
                                break
            for fn in s.get("footnotes", []):
                para(tf, fn, 11, italic=True, gray=True)
        elif s["kind"] == "chart":
            titlebar(slide, s["title"])
            slide.shapes.add_picture(str(CHARTS / s["images"][0]),
                                     Inches(0.5), Inches(1.2), width=Inches(7.8))
            bullets_box(slide, 8.6, 1.3, 4.2, 5.2, s["bullets"], s.get("footnotes", []))
        elif s["kind"] == "charts2":
            titlebar(slide, s["title"])
            slide.shapes.add_picture(str(CHARTS / s["images"][0]),
                                     Inches(0.5), Inches(1.2), width=Inches(6.1))
            slide.shapes.add_picture(str(CHARTS / s["images"][1]),
                                     Inches(6.73), Inches(1.2), width=Inches(6.1))
            bullets_box(slide, 0.5, 4.35, 12.33, 2.3, s["bullets"], s.get("footnotes", []), size=16)
        footer(slide)
    prs.save(path)


def render_pdf(slides: list[dict], path: Path) -> None:
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.units import inch
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    W, H = landscape(letter)
    c = canvas.Canvas(str(path), pagesize=landscape(letter))
    c.setTitle("Investigator supply deck (preliminary)")
    c.setAuthor("bmis1572 pipeline")

    def wrap(text, font, size, maxw):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if stringWidth(t, font, size) <= maxw:
                cur = t
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def footer():
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColorRGB(0.45, 0.45, 0.45)
        c.drawCentredString(W / 2, 34, CAVEAT)
        c.setFont("Helvetica", 7)
        c.drawCentredString(W / 2, 24, SOURCES_LINE)

    def bullets(items, x, y, maxw, size=11, gap=17):
        for b in items:
            lines = wrap(b, "Helvetica", size, maxw - 14)
            c.drawString(x, y, "\u2022")
            for j, ln in enumerate(lines):
                c.drawString(x + 14, y - j * (size + 3), ln)
            y -= len(lines) * (size + 3) + gap - (size + 3)
        return y

    def footnotes(items, x, y, maxw, size=8):
        c.setFont("Helvetica-Oblique", size)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        for fn in items:
            for ln in wrap(fn, "Helvetica-Oblique", size, maxw):
                c.drawString(x, y, ln)
                y -= size + 3
        c.setFillColorRGB(0, 0, 0)
        return y

    for s in slides:
        if s["kind"] == "title":
            c.setFont("Helvetica-Bold", 34)
            c.drawCentredString(W / 2, H - 200, s["title"])
            c.setFont("Helvetica", 15)
            y = H - 250
            for ln in wrap(s["sub"], "Helvetica", 15, W - 200):
                c.drawCentredString(W / 2, y, ln)
                y -= 22
            c.setFont("Helvetica", 11)
            c.setFillColorRGB(0.4, 0.4, 0.4)
            c.drawCentredString(W / 2, y - 20, s["meta"])
            c.setFillColorRGB(0, 0, 0)
            footer()
            c.showPage()
            continue
        c.setFont("Helvetica-Bold", 20)
        c.drawString(36, H - 48, s["title"])
        if s["kind"] in ("bullets", "sources"):
            c.setFont("Helvetica", 11)
            y = bullets(s["bullets"], 48, H - 100, W - 96)
            y = footnotes(s.get("footnotes", []), 48, y - 8, W - 96)
            if s["kind"] == "sources":
                c.setFont("Helvetica", 11)
                yy = H - 100
                for b, url in zip(s["bullets"], s.get("links", []) + [None] * 4):
                    nln = len(wrap(b, "Helvetica", 11, W - 96 - 14))
                    if url:
                        c.linkURL(url, (48, yy - nln * 14 - 4, W - 48, yy + 4),
                                  relative=0)
                    yy -= nln * 14 + 3
        else:
            imgs = s["images"]
            if len(imgs) == 1:
                c.drawImage(str(CHARTS / imgs[0]), 36, 60, width=480, height=440,
                            preserveAspectRatio=True, anchor="n")
                c.setFont("Helvetica", 11)
                y = bullets(s["bullets"], 540, H - 110, W - 540 - 36)
                footnotes(s.get("footnotes", []), 540, y - 8, W - 540 - 36)
            else:
                c.drawImage(str(CHARTS / imgs[0]), 36, 220, width=350, height=240,
                            preserveAspectRatio=True, anchor="n")
                c.drawImage(str(CHARTS / imgs[1]), 406, 220, width=350, height=240,
                            preserveAspectRatio=True, anchor="n")
                c.setFont("Helvetica", 10)
                y = bullets(s["bullets"], 48, 190, W - 96, size=10)
                footnotes(s.get("footnotes", []), 48, y - 8, W - 96)
        footer()
        c.showPage()
    c.save()


def build_all(stats: dict | None = None) -> dict:
    if stats is None:
        stats = json.loads((ROOT / "data" / "manifest.json").read_text())["stats"]
    n = load_numbers(stats)
    slides = build_slides(n)
    EXPORTS.mkdir(parents=True, exist_ok=True)
    pptx = EXPORTS / f"{SLUG}.pptx"
    pdf = EXPORTS / f"{SLUG}.pdf"
    render_pptx(slides, pptx)
    render_pdf(slides, pdf)
    print(f"deck: {len(slides)} slides -> {pptx.name} ({pptx.stat().st_size/1e6:.1f} MB), "
          f"{pdf.name} ({pdf.stat().st_size/1e6:.1f} MB)")
    return {"pptx": pptx, "pdf": pdf, "slides": len(slides)}


if __name__ == "__main__":
    build_all()
