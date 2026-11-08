"""Focused checks for the TA keyword classifier (pipeline/ctgov_ta.py).

Stdlib only; run from repo root:  uv run python tests/test_ta_rules.py
Covers the Unit 6 residual pass: new mappings + ordering guarantees.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

from ctgov_ta import TA_RULES, classify  # noqa: E402

CASES = {
    # New mappings (Unit 6 residual pass)
    "Glioblastoma": "Oncology",
    "Glioblastoma Multiforme": "Oncology",
    "NSCLC": "Oncology",
    "Myelodysplastic Syndromes": "Oncology",
    "Myelofibrosis": "Oncology",
    "Myopia": "Ophthalmology",
    "Presbyopia": "Ophthalmology",
    "Astigmatism": "Ophthalmology",
    "Geographic Atrophy": "Ophthalmology",
    "Visual Acuity": "Ophthalmology",
    "Overweight": "Metabolic",
    "Peripheral Arterial Disease": "Cardiology",
    "Degenerative Disc Disease": "Musculoskeletal",
    "Constipation": "GI/Liver",
    "Wrinkle": "Dermatology",
    # Pain ordering: specific pains keep their homes, generic falls to Pain
    "Pain": "Pain",
    "Chronic Pain": "Pain",
    "Postoperative Pain": "Pain",
    "Pain, Postoperative": "Pain",
    "Neuropathic Pain": "Neurology",
    "Back Pain": "Musculoskeletal",
    "Neck Pain": "Musculoskeletal",
    # Pre-existing behavior guards
    "Breast Cancer": "Oncology",
    "Type 2 Diabetes": "Metabolic",
    "Healthy Volunteers": "Other",
    "Pharmacokinetics": "Other",
    "Hearing Loss": "Other",
    "Inflammation": "Other",
    "Atrial Fibrillation": "Cardiology",
    "Rheumatoid Arthritis": "Immunology",
}

# Pain must be last so specific areas win first-match.
assert TA_RULES[-1][0] == "Pain", "Pain area must stay last in TA_RULES"


def main() -> None:
    bad = 0
    for cond, want in CASES.items():
        got = classify(cond)
        if got != want:
            bad += 1
            print(f"FAIL {cond!r}: want {want}, got {got}")
    print(f"{len(CASES) - bad}/{len(CASES)} cases pass")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
