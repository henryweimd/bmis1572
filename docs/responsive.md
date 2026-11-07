# Responsive build guide (explorer)

Goal: every tab reads and operates cleanly at **390px** (phone) and **1280px**
(desktop). One breakpoint, desktop-first: `@media (max-width: 900px)`.

## The loop (run on every frontend change)

1. `npm run check:responsive` — static checks (seconds, must pass).
2. `npm run build` — tsc + vite must stay green.
3. Manual pass at 390×844 and 1280×800 (DevTools device toolbar):
   - [ ] Tab bar scrolls horizontally; active tab visible.
   - [ ] KPI cards stack (1 col; 2-col for four/five variants).
   - [ ] `.panels` grids collapse to one column.
   - [ ] Every table scrolls sideways inside its panel (no page-level sideways scroll).
   - [ ] Charts fill panel width; axes legible at 390px (dense `allTicks` series stay readable via zoom/rotate).
   - [ ] Heatmaps scroll sideways with sticky first column visible.
   - [ ] Filters wrap; search inputs usable; CSV buttons reachable.
   - [ ] No element forces page-level horizontal scrolling at either width.

## Component rules

- **Tabs** (`.tabs`): horizontal scroll row, buttons `nowrap` + `flex-shrink: 0`.
  Never wrap tabs into a grid — the active tab must stay findable by scrolling.
- **Grids** (`.panels`, `.kpis` + `.four`/`.five`): multi-column on desktop, collapse
  under 900px. New grid variants must add their own collapse rule.
- **Tables**: every `<table>` lives in `.table-scroll` (add `.short` for capped
  height). Cells stay `nowrap`; the container scrolls, never the page.
- **Charts**: SVG with `viewBox`, sized by `.panel svg { width: 100%; height: auto }`.
  Ticks already thin (`step 2` past 10 points); keep `allTicks` opt-in per chart.
  Tooltips flip near the right edge and cap at `min(260px, 70vw)`.
- **Filters**: labels and selects carry `min-width: 0; max-width: 100%` so a
  long dropdown option (e.g. CRO names) never stretches the page on phones.
- **Header**: wraps; `h1` drops to 20px under 900px.
- **Widths**: no fixed-pixel layout widths (icons ≤16px exempt; `min/max-width`
  allowed). Layout is grid/flex + `max-width: 1060px` on `.wrap`.
- **Touch**: hover tooltips are enhancement-only — every chart must read without
  hovering. Buttons keep padding-based hit areas.

## Adding a new panel (checklist)

1. Panel markup uses `.panel` (+ `.table-scroll` for tables, `TrendChart` /
   `CategoryBars` / `StackedMultiBars` / `VintageHeatmap` for visuals).
2. If it introduces a new grid or breakpoint-sensitive layout, add the 900px rule.
3. Run the loop above before opening the PR.
