---
name: BMIS 1572 Explorer
description: Utilitarian clinical-ops data intelligence and feasibility workbench for mapping global investigator supply and trial sites.
colors:
  clinical-teal: "#0f766e"
  clinical-teal-deep: "#0b5c56"
  mint-wash: "#e2f2ef"
  ochre-wash: "#fdf6e4"
  ochre-caution: "#d9b93c"
  ochre-ink: "#6d5200"
  crimson-alert: "#b3261e"
  mineral-paper: "#eef2f0"
  sheet-white: "#ffffff"
  mist-surface: "#f6f9f7"
  pine-ink: "#16221e"
  slate-sage: "#52605a"
  mineral-hairline: "#d6dfda"
  mineral-border: "#bac7c0"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  kpi:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "23px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\""
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  subtitle:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0em"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  data:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
    fontFeature: "\"tnum\""
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "13.2px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  xs: "3px"
  sm: "4px"
  control: "6px"
  button: "7px"
  md: "8px"
  card-inner: "9px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  panel-gap: "14px"
  lg: "16px"
  panel-pad: "18px 20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.clinical-teal}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.button}"
    padding: "6px 13px"
  button-primary-hover:
    backgroundColor: "{colors.clinical-teal-deep}"
    textColor: "{colors.sheet-white}"
  button-ghost:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.button}"
    padding: "6px 13px"
  button-ghost-hover:
    backgroundColor: "{colors.mist-surface}"
    textColor: "{colors.clinical-teal}"
  chip:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-sage}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  chip-active:
    backgroundColor: "{colors.mint-wash}"
    textColor: "{colors.clinical-teal}"
  segmented-item:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-sage}"
    padding: "6px 11px"
  segmented-item-active:
    backgroundColor: "{colors.mint-wash}"
    textColor: "{colors.clinical-teal}"
  input-control:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  kpi-card:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  panel-card:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.button}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.mint-wash}"
    textColor: "{colors.clinical-teal}"
  badge-status:
    backgroundColor: "{colors.mint-wash}"
    textColor: "{colors.clinical-teal}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  badge-demo:
    backgroundColor: "{colors.ochre-wash}"
    textColor: "{colors.ochre-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
---

# Design System: BMIS 1572 Explorer

## Overview

**Creative North Star: "The Field Atlas"**

BMIS 1572 Explorer is a utilitarian, clinical-ops-first analytical instrument built for speed, scanability, and transparent evidence verification. Like a field atlas designed for cartographic clarity across global clinical trial geography, every pixel serves orientation, filtering, or direct drill-down into investigator cohorts, research sites, sponsors, and regulatory records.

The visual system rests on cool mineral-tinted neutrals paired with a single authoritative Clinical Teal accent, hairline-anchored containers, and native tabular typography. It explicitly rejects decorative marketing fluff, oversized hero chrome, dark-mode neon dashboards, and opaque "black-box score" UI tropes. Density is calibrated for working feasibility analysts and medical affairs teams who compare numbers side by side and inspect underlying tables rather than admire ornamental whitespace.

**Key Characteristics:**
- **Cartographic clarity over ornament:** Quiet mineral paper surfaces recede so charts, heatmaps, and tabular figures lead from the first viewport.
- **Clinical-ops speed:** Compact filter bars, pill presets, segmented chart/table toggles, and a global `⌘K` search bar keep screening workflows one click away.
- **Hairline discipline:** 1px mineral borders carry structure across panels, tables, and controls; elevation is reserved for true overlays and active dossiers.
- **Honest visual signals:** Experimental caveats, demo-data banners, and right-censoring notes appear in unmistakable Ochre Caution framing rather than buried footnotes.

## Colors

A quiet, cool mineral-tinted neutral foundation anchored by a single Clinical Teal action color and muted clinical status tones.

### Primary
- **Clinical Teal** (#0f766e): Primary interactive accent for primary buttons, text links, active navigation items, active filter chips, single-series trend lines and bar fills, keyboard focus rings, brand mark, and active dossier borders.
- **Clinical Teal Deep** (#0b5c56): Hover and pressed state for Clinical Teal primary buttons, links, and the brand mark.
- **Mint Wash** (#e2f2ef): Soft tonal fill for active navigation items, active segmented toggles, active filter chips, selected table rows, saved shortlist stars, full-lake status badges, and text selection highlights.

### Secondary
- **Ochre Wash** (#fdf6e4): Background fill for caveat banners and demo-sample status badges.
- **Ochre Caution** (#d9b93c): 1px border framing caveat banners and demo-sample badges.
- **Ochre Ink** (#6d5200): High-contrast label text inside Ochre Wash demo badges.
- **Crimson Alert** (#b3261e): Error text for failed DuckDB-WASM initialization or query failures.
- **Categorical Chart Series (Data Visualization Only):** Multi-series regional, trial-phase, and cohort charts use a fixed high-distinction categorical palette (`#1f77b4`, `#ff7f0e`, `#2ca02c`, `#d62728`, `#9467bd`, `#8c564b`, `#7f7f7f`, `#bcbd22`, `#17becf`, with neutral slate `#94a3b8` / `#334155` for comparison baselines). Single-series charts and cohort vintage heatmaps stay strictly on the Clinical Teal ramp (`rgb(244, 249, 247)` to `rgb(11, 82, 77)`).

### Neutral
- **Mineral Paper** (#eef2f0): Page canvas background, inline code chips, horizontal bar tracks, and N/A heatmap cells.
- **Sheet White** (#ffffff): Primary elevated content plane for panels, KPI tiles, sticky navigation rail, inputs, tooltips, modals, and drawers.
- **Mist Surface** (#f6f9f7): Quiet secondary tint for table headers, nested pathway/takeaway/resource cards, empty states, command palette footer, search trigger resting state, and subtle row/item hover fills.
- **Pine Ink** (#16221e): Primary text across headings, body prose, KPI numbers, table cells, and active controls.
- **Slate Sage** (#52605a): Secondary muted text for subtitles, captions, axis ticks, table column headers, nav group labels, and filter labels.
- **Mineral Hairline** (#d6dfda): Structural 1px borders on panels, KPI tiles, sticky topbar, sidebar rail, table row dividers, and SVG chart gridlines.
- **Mineral Border** (#bac7c0): Stronger 1px interactive stroke for text inputs, selects, ghost buttons, filter chips, segmented control frames, tooltips, and dashed empty-state outlines.

### Named Rules
**The One-Accent Ledger Rule.** Clinical Teal is the sole interactive UI accent across navigation, controls, links, and single-series data; multi-hue categorical colors are confined exclusively inside data visualizations and never leak into chrome or buttons.

**The Mineral-Tinted Neutral Rule.** Every gray in the system carries a cool pine-sage undertone (anchored to Pine Ink `#16221e`) rather than sterile pure gray (`#808080`) or pure black (`#000000`), keeping white data sheets crisp and glare-free during long screening sessions.

## Typography

**Display & UI Font:** `system-ui` (with `-apple-system, 'Segoe UI', Roboto, sans-serif` fallback)
**Body Font:** `system-ui` (with `-apple-system, 'Segoe UI', Roboto, sans-serif` fallback)
**Label/Mono Font:** `ui-monospace` (with `SFMono-Regular, Menlo, Monaco, Consolas, monospace` fallback)

**Character:** Native, zero-latency system typography optimized for dense analytical scanning and crisp numeric alignment. Tight negative tracking on headings and KPI figures keeps view headers compact, while tabular numerals make columns and heatmaps effortlessly comparable.

### Hierarchy
- **Headline** (700, 24px desktop / 20px mobile, line-height 1.2, tracking -0.02em): Active view title (`h1`) paired with `text-wrap: balance` to avoid orphan words.
- **KPI Value** (650, 23px, line-height 1.2, tracking -0.02em, tabular-nums): Hero metric figures inside `.kpi` summary tiles.
- **Title** (700, 16px, line-height 1.3, tracking -0.01em): Panel and chart section headers (`h2`).
- **Subtitle** (700, 14px–13.5px, line-height 1.35): Nested subsection headers (`h3`/`h4`) and pathway/takeaway card titles.
- **Body** (400, 15px, line-height 1.5): Running narrative prose constrained to `70ch` max-width; italic chart captions sit at 12.5px with `78ch` max-width.
- **Data** (400–600, 13.5px, line-height 1.45, tabular-nums): Table cells, bar chart rows, form controls, navigation items, and command palette results.
- **Label** (700, 11px, line-height 1.2, tracking 0.05em–0.06em, uppercase): Sidebar group dividers, command palette section headers, and external resource category tags.
- **Mono** (400, 0.88em / 11px for keyboard shortcuts): Inline SQL/CLI code snippets and `⌘K` shortcut badges.

### Named Rules
**The Tabular Figures Rule.** Every numeric readout — KPI values, KPI sub-labels, horizontal bar values, tooltip values, vintage heatmap scales, and all `<table>` cells — must apply `font-variant-numeric: tabular-nums` and right-align numeric table columns so digits stack vertically without horizontal jitter.

**The Zero-Font-Latency Rule.** Keep UI typography on the native system font stack so the in-browser DuckDB-WASM workspace renders immediately with zero web-font flash or bundle overhead.

## Layout

Desktop-first workspace architecture governed by a single responsive breakpoint (`@media (max-width: 900px)`) and verified at **1280px** (desktop) and **390px** (phone).

- **Application Shell:** Full-height vertical frame crowned by a sticky frosted topbar (`max-width: 1380px`, `10px 20px` padding) containing the brand button, centered global `⌘K` search trigger (`max-width: 28rem`), and right-aligned utility actions (Shortlist drawer trigger, Share link button, lake/demo status badge).
- **Workspace Grid:** Centered `max-width: 1380px` container (`22px 20px 56px` desktop padding; `14px 14px 40px` mobile) arranged as a 2-column grid (`minmax(0, 14.5rem) minmax(0, 1fr)`, `24px` gap): a sticky left grouped navigation rail on desktop that hides under `900px` in favor of a single-row horizontally scrollable mobile tab strip (never wrapped into a multi-row grid).
- **Content Grids:**
  - KPI rows: 3, 4, or 5 equal columns (`12px` gap); under `900px`, 3-column rows stack to 1 column while 4- and 5-column rows collapse to a 2-column grid.
  - Asymmetric split panels (`.panels`, `.hero-grid`): `3fr 2fr` desktop split (`14px`–`20px` gap), collapsing to 1 column under `900px`.
  - Equal card grids (pathways, executive takeaways, regulatory resource cards): 3 columns (`12px`–`14px` gap), collapsing to 1 column under `900px`.
  - Glossary definitions: 2-column description grid (`12px 24px` gap), collapsing to 1 column under `900px`.
- **Overflow Containment:** No fixed-pixel layout widths above `16px` (icons exempt; `min-width` / `max-width` allowed). Every `<table>` sits inside a `.table-scroll` horizontal scroll wrapper (optional `.short` cap at `360px` with sticky headers), and filter labels/selects enforce `min-width: 0; max-width: 100%` so long organization names never force page-level horizontal scroll.

## Elevation & Depth

Hairline-anchored tonal layering: resting surfaces are functionally flat, separated primarily by contrast between Mineral Paper (`#eef2f0`) and Sheet White (`#ffffff`) plus crisp 1px Mineral Hairline (`#d6dfda`) borders and whisper-quiet shadows. Deeper structural elevation is reserved strictly for floating overlays and focused inspection states.

### Shadow Vocabulary
- **Resting Hairline Lift** (`box-shadow: 0 1px 2px rgb(22 34 30 / 0.05)`): Applied to primary panels, KPI cards, and the sticky sidebar rail to gently separate white sheets from the Mineral Paper canvas without visual heaviness.
- **Overlay & Focus Lift** (`box-shadow: 0 6px 18px rgb(22 34 30 / 0.12)`): Reserved exclusively for floating chart tooltips, the `⌘K` command palette modal, the slide-over shortlist drawer, and active entity dossier panels (paired with a 1px Clinical Teal border).
- **Frosted Utility Chrome** (`background: rgb(255 255 255 / 0.92); backdrop-filter: blur(10px)`): Used solely on the sticky top utility header (`z-index: 30`) so scrolled tables and charts softly pass beneath persistent search and shortlist controls.
- **Modal Scrim** (`background: rgb(22 34 30 / 0.45)`): Pine-tinted translucent backdrop (`z-index: 50`) behind the command palette and shortlist drawer.

### Named Rules
**The Hairline-First Elevation Rule.** Never rely on drop shadows alone to separate sibling cards; every resting surface uses a 1px Mineral Hairline border (`#d6dfda`) first, and Overlay Lift (`0 6px 18px rgb(22 34 30 / 0.12)`) appears only when an element floats over the workspace or locks into an active dossier.

## Shapes

A crisp, calibrated corner-radius ladder tightly coupled to element hierarchy — never soft consumer-app blobs, never raw unstyled rectangles:

- **Micro Data Geometry (3px–4px):** Horizontal bar tracks/fills, legend swatches, and heatmap ramps (`3px`); inline code tokens, `⌘K` keycaps, and table sort buttons (`4px`).
- **Interactive Controls (6px–8px):** Inputs, selects, segmented control frames, and icon buttons (`6px`); primary/ghost buttons, sidebar nav items, and command palette rows (`7px`); search trigger, caution banners, mobile tab buttons, hero callouts, and floating tooltips (`8px`).
- **Nested & Primary Containers (9px–12px):** Nested Mist Surface cards (`9px` for pathway/takeaway/resource cards); primary Sheet White panels, KPI tiles, and dashed empty states (`10px`); outer shell chrome (`12px` for the sticky sidebar rail and `⌘K` modal).
- **Status & Filter Pills (999px):** Full-pill radius reserved exclusively for filter chips, status badges, metadata pills, and numeric shortlist count badges.
- **Border Grammar:** 1px solid strokes throughout — Mineral Hairline (`#d6dfda`) on passive containers, Mineral Border (`#bac7c0`) on interactive controls, Clinical Teal (`#0f766e`) on hover/active controls and focus dossiers, and dashed Mineral Border on empty states.

## Components

Crisp, precise, and instrument-like: compact controls with firm 1px outlines, instant Mint Wash active states, fast 140ms–180ms ease transitions, and zero decorative motion.

### Buttons
- **Shape:** Crisp rounded rectangle (`7px` radius), compact `6px 13px` padding (`4px 10px` at 12px font for `.btn-sm`; `6px 10px` for icon+label utility triggers).
- **Primary:** Clinical Teal (`#0f766e`) fill and border with Sheet White (`#ffffff`) 13px weight-600 text; shifts to Clinical Teal Deep (`#0b5c56`) on hover (`140ms ease`).
- **Ghost / Secondary:** Sheet White (`#ffffff`) fill, Pine Ink (`#16221e`) text, 1px Mineral Border (`#bac7c0`); hover shifts to Mist Surface (`#f6f9f7`) fill with Clinical Teal text and border.
- **Icon & Link Actions:** Transparent `6px`-radius icon buttons (`5px` padding, Slate Sage icon shifting to Clinical Teal on Mist Surface hover; saved bookmark/star flips to Mint Wash fill). Inline link buttons use underlined Clinical Teal weight-600 text (`text-underline-offset: 3px`).
- **Focus:** Global `2px solid #0f766e` outline with `2px` offset on `:focus-visible`.

### Chips & Segmented Controls
- **Filter Chips:** Full pill (`999px`), `5px 12px` padding, 12.5px weight-550 Slate Sage text on Sheet White with 1px Mineral Border. Hover highlights border and text in Clinical Teal; active state fills with Mint Wash (`#e2f2ef`), Clinical Teal border and weight-650 text.
- **Segmented Controls:** Grouped inline toggle (`6px` radius, 1px Mineral Border frame, internal 1px Mineral Hairline dividers) used for `Chart | Table` and `Absolute | 100%` chart toolbars; active segment fills with Mint Wash and Clinical Teal weight-650 text.
- **Status Badges & Count Pills:** Full-pill (`999px`) non-interactive indicators (`4px 11px` for lake/demo badges; compact `1px 6px` solid Clinical Teal fill with white weight-700 numerals for shortlist counts).

### Cards / Containers
- **Primary Panel:** Sheet White (`#ffffff`), `10px` radius, 1px Mineral Hairline border, Resting Hairline Lift shadow, `18px 20px` padding (`14px` vertical spacing). Active Dossier panels switch border to Clinical Teal and elevation to Overlay Lift.
- **KPI Metric Card:** Sheet White (`#ffffff`), `10px` radius, `14px 16px` padding, vertical stack of 12.5px Slate Sage label, 23px weight-650 tabular KPI value, and 12px Slate Sage sub-label.
- **Nested Sub-Cards & Ruled Columns (Pathways, External Resources, Takeaways):** Interactive pathway and external resource tiles use Mist Surface (`#f6f9f7`), `9px` radius, 1px Mineral Hairline border, and `13px–15px` padding (shifting to Sheet White + Clinical Teal border on hover with a 2px arrow nudge). Informational callouts (Scope & Reading Guide) and executive takeaways sit directly on Sheet White separated by 1px hairline dividers rather than nested card-in-card boxes.

### Inputs / Fields
- **Style:** Sheet White (`#ffffff`), 13.5px Pine Ink text, 1px Mineral Border (`#bac7c0`), `6px` radius, `6px 10px` padding (`150ms ease` border-color transition). Search inputs enforce `min-width: min(210px, 100%)`.
- **Labels:** Stacked above controls in 12px weight-550 Slate Sage (`4px` gap).
- **Hover / Focus:** Hover turns border to Clinical Teal; `:focus-visible` adds the 2px Clinical Teal outer ring (`caret-color: #0f766e`).
- **Global Search Trigger:** Mist Surface (`#f6f9f7`), `8px` radius, 1px Mineral Border, leading 15px search icon, truncated prompt text, and right-aligned monospace `⌘K` keycap (`4px` radius).

### Navigation
- **Desktop Rail:** Sticky (`top: 4.4rem`, scrollable within `calc(100vh - 5.2rem)`) Sheet White container (`12px` radius, `12px 11px` padding) with uppercase 11px group labels (`Workspace`, `FDA Supply (BMIS 1572)`, `Demand & Global`, `Reference`), `7px`-radius nav buttons (`6px 10px` padding, 13.5px weight-550), and a hairline-separated quick exports/sources footer. Active view uses Mint Wash fill, Clinical Teal weight-650 text, and subtle `rgb(15 118 110 / 0.25)` border.
- **Mobile Strip (`<= 900px`):** Single-row horizontally scrollable tab list of `8px`-radius Sheet White buttons (`8px 16px` padding, `min-height: 36px`, `white-space: nowrap; flex-shrink: 0`) that auto-scrolls the active tab into view with full Left/Right/Home/End keyboard navigation. Sub-navigation and quick preset chip strips also scroll horizontally in a single row on mobile; inputs/selects step up to `16px` (`min-height: 40px`) to prevent iOS auto-zoom, and clickable data bars keep a `34px` minimum tap target height.

### Data Tables & Vintage Heatmaps
- **Tables:** Wrapped in `.table-scroll` (`6px` radius), `border-collapse: collapse`, 13.5px tabular-nums, `7px 10px` nowrap cells, 1px Mineral Hairline row dividers, Mist Surface 12px sticky headers. Pickable rows highlight in Mint Wash on hover and stay Mint Wash with weight-600 text when selected.
- **Vintage Heatmaps:** Sticky first column (`left: 0`, Sheet White / Mist Surface background with 1px right divider), sequential Clinical Teal cell ramp (`rgb(244, 249, 247)` → `rgb(11, 82, 77)`) with WCAG-computed dynamic `#ffffff` / `#0f1714` foreground ink, and `1px solid rgb(255 255 255 / 0.35)` vertical cell hairlines.

### Command Palette & Shortlist Drawer
- **Command Palette (`⌘K`):** Centered modal (`max-width: min(40rem, 96vw)`, `max-height: 78vh`, `12px` radius, Overlay Lift shadow, 160ms exponential entrance) over a subtly blurred `rgb(22 34 30 / 0.45)` scrim, with a borderless 15px combobox search row, full `↑↓`/`↵`/`Esc` keyboard navigation across grouped 11px uppercase entity results, and a Mist Surface shortcut footer.
- **Shortlist Drawer:** Right-aligned slide-over panel (`max-width: min(46rem, 100vw)`, full viewport height, Overlay Lift shadow, 200ms slide-in) for reviewing, copying or downloading `.md` feasibility briefs, exporting CSVs, safely clearing with two-step inline confirmation, and jumping back to saved sites and investigators.

## Do's and Don'ts

### Do:
- **Do** keep Clinical Teal (`#0f766e`) as the single UI action accent and use Mint Wash (`#e2f2ef`) for active/selected states across navigation, chips, segmented toggles, and picked table rows.
- **Do** enforce `font-variant-numeric: tabular-nums` on every KPI, table, bar value, tooltip, and scale legend, and right-align numeric columns.
- **Do** wrap every `<table>` inside `.table-scroll` (with sticky first columns on wide vintage heatmaps) and keep filter labels/selects constrained with `min-width: 0; max-width: 100%` so 390px viewports never scroll horizontally at the page level.
- **Do** provide a `Chart | Table` segmented toggle on data visualizations and keep hover tooltips strictly enhancement-only so every chart reads cleanly on touch devices.
- **Do** pair caveat banners, demo-data indicators, and methodological notices with Ochre Wash (`#fdf6e4`) and Ochre Caution (`#d9b93c`) framing.
- **Do** respect `prefers-reduced-motion: reduce` by disabling skeleton shimmer animations and keeping interactive state transitions fast (`140ms–180ms`).

### Don't:
- **Don't** introduce marketing-page hero chrome, decorative illustrations, glassmorphic cards, dark-mode neon themes, or opaque composite "score badges" that hide underlying clinical metrics.
- **Don't** leak multi-series categorical chart hues (`#1f77b4`, `#ff7f0e`, `#9467bd`, etc.) into buttons, navigation, or card borders.
- **Don't** set fixed-pixel layout widths larger than `16px` (icons exempt) or wrap the mobile tab bar into a multi-row grid.
- **Don't** apply Overlay Lift (`0 6px 18px rgb(22 34 30 / 0.12)`) to resting cards or KPI tiles; reserve deeper shadows for tooltips, modals, drawers, and active dossiers.
- **Don't** load external web fonts or heavy icon-font bundles that add startup latency ahead of DuckDB-WASM initialization; keep UI icons as 15px–16px inline `currentColor` SVGs.
