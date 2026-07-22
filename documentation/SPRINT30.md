# Sprint 30 — Charts in markdown (```chart fences)

## Why

The markdown surfaces already render rich content (mermaid, link cards,
callouts, task lists). The one obvious gap for a knowledge app is
**quantitative** content: "how much of each?" A `` ```chart `` fence lets
you drop a bar / donut / line chart into any note, article, or blueprint
card with a tiny, memorable DSL — no dependency, no external service.

User ask: "add charts like bar charts and donut charts by just using
markdown."

## Approach — inline SVG, rendered synchronously

Unlike mermaid (async `render`, hydrated after the HTML lands), charts
are **pure data → SVG** and can be emitted directly in the markdown-it
`fence` rule, exactly like `renderCards`. Benefits:

- **No dependency, CSP-safe** — hand-rolled SVG, nothing loaded.
- **Crisp at any xyflow zoom** (SVG), and it renders inside blueprint
  cards too (which deliberately skip mermaid hydration but do run the
  shared markdown-it factory).
- **No hydration race** — synchronous, so no MutationObserver / `{@html}`
  re-render dance.

## DSL

Consistent with the `` ```cards `` fence: `key: value` lines. Reserved
keys configure the chart; every other `Label: number` line is a data
point (order preserved).

````
```chart
type: bar          # bar | donut (alias pie) | line ; default bar
title: Weekly commits
color: blue        # bar/line accent (named palette); donut is multi-color
Mon: 5
Tue: 8
Wed: 3
Thu: 6
```
````

- **bar / line** — single accent (`color:` from the named palette, default
  blue); y-axis with a "nice" ceiling + gridlines, value labels, x labels.
- **donut** (`type: donut` or `pie`) — categorical palette per slice, a
  center total, and an HTML legend (swatch · label · value · percent).
  A single-slice donut degrades to a stroked ring.

Non-numeric / negative / zero rows are dropped; an empty chart renders
nothing.

## Theming

Chart **series colors** are a fixed mid-tone palette that reads on both
light and dark backgrounds. **Structural** ink (axis text, gridlines,
center total) uses `currentColor` / low-opacity `currentColor`, so it
inherits the surface's text color and adapts to the theme automatically.

## Files

- `documentation/SPRINT30.md` — this doc.
- `src/lib/markdownit.ts` — `renderChart` + `renderBarChart` /
  `renderDonutChart` / `renderLineChart` helpers; `chart` case in the
  `fence` rule.
- `src/app.css` — `.md-chart` container / legend styles.
- `src/lib/components/SlashMenu.svelte` — "Bar chart" + "Donut chart"
  slash commands (snippets).
- `src/lib/components/FormattingHelp.svelte` — a charts row in the
  reference.

## Not doing (deferred)

- Stacked / grouped / horizontal bars, multi-series line charts.
- Axis titles, custom tick counts, legends for bar/line.
- Per-datum colors in bar/line (donut already colors per slice).
