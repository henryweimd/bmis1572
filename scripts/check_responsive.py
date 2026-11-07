"""Static responsive-design checks for the explorer (docs/responsive.md).

Loop: run after every frontend change, before PR:
    npm run check:responsive   # this script (static, seconds)
    npm run build              # tsc + vite must stay green
    manual 390px + 1280px pass (checklist in docs/responsive.md)

Exit 0 = all checks pass; exit 1 = findings printed below.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPLORER = ROOT / "explorer"
SRC = EXPLORER / "src"
CSS = SRC / "App.css"

findings: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        findings.append(name)


def main() -> int:
    html = (EXPLORER / "index.html").read_text()
    check("viewport meta", 'name="viewport"' in html and "width=device-width" in html)

    css = CSS.read_text()
    check("@media breakpoint present", "@media" in css)
    for sel in (".panels", ".kpis", ".tabs", "header", "h1"):
        in_media = any(
            sel in block
            for block in re.findall(r"@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}", css)
        )
        # .tabs needs scroll-or-wrap handling somewhere (base rule counts).
        if sel == ".tabs":
            check(
                ".tabs scrolls on narrow screens",
                "overflow-x: auto" in css.split(".tabs")[1].split("}")[0],
            )
        else:
            check(f"{sel} adapts under @media", in_media)

    # Tables must live inside horizontal scroll containers.
    for tsx in sorted(SRC.glob("*.tsx")):
        text = tsx.read_text()
        n_table = len(re.findall(r"<table[\s>]", text))
        n_scroll = len(re.findall(r"table-scroll", text))
        if n_table:
            check(f"{tsx.name}: tables in .table-scroll", n_scroll >= n_table,
                  f"{n_table} <table>, {n_scroll} table-scroll")

    # Charts: every svg scales via viewBox + width:100%.
    charts = (SRC / "charts.tsx").read_text()
    n_svg = len(re.findall(r"<svg[\s>]", charts))
    n_vb = len(re.findall(r"viewBox", charts))
    check("chart <svg> count matches viewBox count", n_svg > 0 and n_svg == n_vb,
          f"{n_svg} svg, {n_vb} viewBox")
    m = re.search(r"\.panel svg \{(.*?)\}", css, re.S)
    check(".panel svg scales to container",
          bool(m) and "width: 100%" in m.group(1) and "height: auto" in m.group(1))

    # No fixed-pixel layout widths (icons <=16px and min/max-width allowed).
    bad = [
        line.strip()
        for line in css.splitlines()
        if re.search(r"(?<!min-|max-)width:\s*(\d+)px", line)
        and int(re.search(r"width:\s*(\d+)px", line).group(1)) > 16
    ]
    check("no fixed-pixel layout widths", not bad, "; ".join(bad[:3]))

    # Touch: buttons keep a usable hit area (padding-based, >= ~28px tall).
    m = re.search(r"\.btn \{(.*?)\}", css, re.S)
    check(".btn has padding hit area", bool(m) and "padding:" in m.group(1))
    m = re.search(r"\.tabs button \{(.*?)\}", css, re.S)
    check(".tabs button keeps padding + nowrap",
          bool(m) and "padding:" in m.group(1) and "white-space: nowrap" in m.group(1))

    print(f"\n{len(findings)} finding(s).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
