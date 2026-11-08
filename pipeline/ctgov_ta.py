"""Therapeutic-area mix per site from matched CT.gov conditions (experimental).

For every institution x city match from ctgov_link, maps the matched studies'
conditionsModule entries to 16 therapeutic areas via ordered keyword rules
(first match wins; heuristic, documented below) and rolls counts up to member
sites. Studies with no conditions contribute nothing; healthy-volunteer and
drug-class conditions land in Other. Generic pain lands in Pain only after
specific pains claim their areas (neuropathic -> Neurology, back/neck -> MSK).

Usage (from repo root):
    uv run python pipeline/ctgov_ta.py

Writes data/curated/site_ta_mix.parquet (matched sites only).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ctgov_link
from sites import site_name_key

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CURATED = ROOT / "data" / "curated"
COND_CACHE = RAW / "ctgov_conditions.jsonl"

TA_RULES: list[tuple[str, list[str]]] = [
    ("Oncology", ["CANCER", "TUMOR", "TUMOUR", "CARCINOMA", "SARCOMA", "LYMPHOMA",
                  "LEUKEMIA", "LEUKAEMIA", "MELANOMA", "MYELOMA", "NEOPLASM",
                  "GLIOMA", "GLIOBLASTOMA", "MESOTHELIOMA", "NEUROBLASTOMA",
                  "MALIGNAN", "DYSPLASIA", "MYELODYSPLASTIC", "MYELOFIBROSIS",
                  "NSCLC", "SMALL CELL"]),
    ("Hematology", ["ANEMIA", "ANAEMIA", "HEMOPHILIA", "HAEMOPHILIA", "SICKLE",
                    "THALASSEMIA", "THROMBOCYTOPENIA", "NEUTROPENIA", "VON WILLEBRAND"]),
    ("Cardiology", ["HEART", "CARDIAC", "CARDIO", "CORONARY", "ATRIAL", "VENTRICULAR",
                    "MYOCARDIAL", "ARRHYTHMIA", "FIBRILLATION", "HYPERTENSION",
                    "HEMODYNAMIC", "PERIPHERAL ARTER",
                    "HYPERTENSIVE", "ANEURYSM", "ATHEROSCLEROSIS", "VALVULAR",
                    "ENDOCARDITIS", "PERICARDITIS"]),
    ("Neurology", ["ALZHEIMER", "PARKINSON", "EPILEPSY", "SEIZURE", "MULTIPLE SCLEROSIS",
                   "MIGRAINE", "DEMENTIA", "NEUROPATHY", "NEUROPATHIC", "STROKE",
                   "CEREBRAL", "AMYOTROPHIC", "HUNTINGTON", "DYSTONIA", "TREMOR",
                   "NARCOLEPSY", "RESTLESS LEG", "GUILLAIN", "MYASTHENIA",
                   "DUCHENNE", "MUSCULAR DYSTROPHY", "FRONTOTEMPORAL", "LEWY",
                   "SPINAL MUSCULAR", "DRAVET", "LENNOX", "EPILEP", "COGNITIVE",
                   " MS"]),
    ("Metabolic", ["DIABETES", "DIABETIC", "OBESITY", "OBESE", "OVERWEIGHT",
                   "THYROID", "DYSLIPIDEMIA",
                   "CHOLESTEROL", "HYPERLIPIDEMIA", "LIPIDEMIA", "METABOLIC SYNDROME",
                   "GOUT", "HYPERURICEMIA", "CUSHING", "ADDISON", "ACROMEGALY"]),
    ("Immunology", ["RHEUMATOID", "ANKYLOSING", "LUPUS", "SJOGREN", "SCLERODERMA",
                    "VASCULITIS", "MYOSITIS", "SARCOIDOSIS", "HYPERSENSITIVITY",
                    "ALLERGY", "ALLERGIC", "ANAPHYLAXIS", "URTICARIA", "ANGIOEDEMA",
                    "CONJUNCTIVITIS", "RHINITIS",
                    "IMMUNODEFICIENCY", "ARTHRITIS", "BEHCET"]),
    ("Infectious", ["HIV", "HEPATITIS", "INFLUENZA", "COVID", "SARS", "TUBERCULOSIS",
                    "SEPSIS", "SEPTIC", "MALARIA", "DENGUE", "LYME", "CLOSTRIDIUM",
                    "MRSA", "CANDIDA", "ASPERGILLUS", "FUNGAL", "ANTIFUNGAL",
                    "ANTIBACTERIAL", "ANTIVIRAL", "INFECTION", "PNEUMONIA", "ZIKA", "OTITIS"]),
    ("Respiratory", ["ASTHMA", "COPD", "PULMONARY", "LUNG", "BRONCH", "CYSTIC FIBROSIS",
                     "APNEA", "SLEEP", "EMPHYSEMA", "PLEURAL", "RESPIRATORY DISTRESS",
                     "INTERSTITIAL LUNG"]),
    ("GI/Liver", ["CROHN", "COLITIS", "ULCERATIVE", "IRRITABLE BOWEL", "GERD", "REFLUX",
                  "LIVER", "HEPATIC", "NASH", "NAFLD", "CIRRHOSIS", "PANCREATITIS",
                  "CELIAC", "DIVERTICULITIS", "GASTROPARESIS", "BARRETT", "HEMORRHOID",
                  "CONSTIPATION"]),
    ("Renal", ["KIDNEY", "RENAL", "DIALYSIS", "NEPHRO", "GLOMERULO", "UREMIA",
               "UROLITHIASIS"]),
    ("Musculoskeletal", ["OSTEOARTHRITIS", "OSTEOARTHROSIS", "OSTEOPOROSIS", "FRACTURE",
                         "BACK PAIN", "LOW BACK", "NECK PAIN", "DEGENERATIVE DISC",
                         "MUSCLE", "TENDON",
                         "LIGAMENT", "BURSITIS", "FIBROMYALGIA", "ROTATOR", "MENISCUS",
                         "SPINAL STENOSIS", "SCIATICA", "CARPAL TUNNEL", "ARTHROPLASTY",
                         "TMJ"]),
    ("Dermatology", ["PSORIASIS", "ECZEMA", "DERMATITIS", "ACNE", "SKIN", "ROSACEA",
                     "VITILIGO", "HIDRADENITIS", "ALOPECIA", "PEMPHIGUS",
                     "ACTINIC KERATOSIS", "WOUND", "WRINKLE"]),
    ("Ophthalmology", ["MACULAR", "GLAUCOMA", "CATARACT", "RETINAL", "RETINOPATHY",
                       "UVEITIS", "DRY EYE", "KERATOCONUS", "STRABISMUS", "BLEPHARITIS",
                       "EYE", "VISION", "OPTIC", "MYOPIA", "PRESBYOPIA",
                       "ASTIGMATISM", "GEOGRAPHIC ATROPHY", "VISUAL ACUITY"]),
    ("Psychiatry", ["DEPRESSION", "DEPRESSIVE", "ANXIETY", "SCHIZOPHRENIA", "BIPOLAR",
                    "ADHD", "ATTENTION DEFICIT", "PTSD", "POST-TRAUMATIC", "INSOMNIA",
                    "ADDICTION", "SUBSTANCE USE", "ALCOHOL USE", "OPIOID", "SMOKING",
                    "TOBACCO", "EATING DISORDER", "AUTISM", "OBSESSIVE COMPULSIVE"]),
    ("Uro/Gyn", ["PROSTATE", "BLADDER", "INCONTINENCE", "ERECTILE", "ENDOMETRIOSIS",
                 "UTERINE", "FIBROID", "MENOPAUSE", "CONTRACEPTION", "INFERTILITY",
                 "BPH", "PROSTATITIS", "CYSTITIS", "OVERACTIVE BLADDER", "PREGNANCY",
                 "PREECLAMPSIA", "ECTOPIC", "AMENORRHEA"]),
    # Last: generic pain not caught above (neuropathic -> Neurology, back/neck -> MSK).
    ("Pain", ["PAIN"]),
]


def classify(cond: str) -> str:
    text = (cond or "").upper()
    for ta, kws in TA_RULES:
        for kw in kws:
            if kw in text:
                return ta
    return "Other"


def load_cond_tas() -> dict[str, list[str]]:
    tas: dict[str, list[str]] = {}
    for line in COND_CACHE.read_text().splitlines():
        rec = json.loads(line)
        ps = rec.get("protocolSection", {})
        nct = ps.get("identificationModule", {}).get("nctId", "")
        conds = (ps.get("conditionsModule", {}) or {}).get("conditions", []) or []
        tas[nct] = sorted({classify(c) for c in conds})
    return tas


def run() -> pd.DataFrame | None:
    if not (ctgov_link.LOC_CACHE.exists() and COND_CACHE.exists()):
        print("ta: missing location/conditions cache; skipping")
        return None
    t0 = time.time()
    recs = [json.loads(line) for line in ctgov_link.LOC_CACHE.read_text().splitlines()]
    locs = ctgov_link.flatten(recs)
    tas = load_cond_tas()
    print(f"ta: {len(locs):,} location rows, {len(tas):,} studies with condition map "
          f"({time.time()-t0:.0f}s)")
    frames = []
    for ver in ["strict", "merged"]:
        si = pd.read_parquet(CURATED / "site_index.parquet",
                             columns=["site_n", "site_id", "display_name",
                                      "city", "country", "first_year",
                                      "last_year"])
        si = si[(si["site_id"].str.startswith(f"{ver}:")) & (si["country"] == "USA")]
        si = si.assign(key=si["display_name"].map(site_name_key),
                       ncity=si["city"].map(ctgov_link.norm_city))
        si = si[si["ncity"] != ""]
        insts = (si.groupby(["key", "ncity"], sort=False)
                 .agg(first_y=("first_year", "min"),
                      last_y=("last_year", "max"))
                 .reset_index().rename(columns={"ncity": "city"}))
        locs_i, ftok, post, big = ctgov_link._build_loc_index(locs)
        rows = []
        n_match = n_ta = 0
        for _, s in insts.iterrows():
            best = ctgov_link.match_one(s["key"], s["city"], s["first_y"], s["last_y"],
                                        locs_i, ftok, post, big)
            if not best:
                continue
            n_match += 1
            tac: dict[str, int] = {}
            for nct in best:
                for ta in tas.get(nct, []):
                    tac[ta] = tac.get(ta, 0) + 1
            if tac:
                n_ta += 1
                for ta, c in tac.items():
                    rows.append({"key": s["key"], "city": s["city"],
                                 "ta": ta, "n_trials": c})
        print(f"ta: {ver}: {n_match:,}/{len(insts):,} matched, {n_ta:,} with TA "
              f"({time.time()-t0:.0f}s)")
        if rows:
            ta_inst = pd.DataFrame(rows)
            members = si.merge(ta_inst, left_on=["key", "ncity"],
                               right_on=["key", "city"], how="inner")
            members["version"] = ver
            members["site_id"] = ver + ":" + members["site_n"].astype(str)
            frames.append(members[["version", "site_n", "site_id", "ta", "n_trials"]])
    if not frames:
        print("ta: no TA rows")
        return None
    out = pd.concat(frames, ignore_index=True)
    out.to_parquet(CURATED / "site_ta_mix.parquet", index=False)
    top = out[out["version"] == "strict"].groupby("ta")["n_trials"].sum().sort_values(
        ascending=False).head(8)
    print(f"ta: wrote site_ta_mix.parquet ({len(out):,} rows)")
    print("ta: top areas (strict site-trial pairs):")
    for ta, v in top.items():
        print(f"   {ta:16s} {v:>10,}")
    return out


def main() -> None:
    run()


if __name__ == "__main__":
    main()
