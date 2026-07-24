# Sprint 35 — Treemaps in markdown (```treemap fence)

## Why

A treemap is a compact way to show "relative size of parts" — time split,
budget, LOC, effort — right inside a note. Inspired by the LOC treemap in
the sibling **xray** project (D3 squarified treemap, Oswald labels), but
simplified for prose: **one flat color for every square** (differences
read from *area*, not hue), with an optional **animated** pulse to draw
the eye.

User sketch:

````
```treemap
this is one square: 10 - animated
this is other square: 20
this is other square: 33
this is other square: 5
```
````

## DSL

Same `Label: value` family as ```chart / ```progress. Area ∝ value.

- **Fence options** (info string): an optional **color** (named palette,
  shared with ```marquee, default `blue`) and/or **`animated`** to pulse
  **every** square. e.g. `` ```treemap violet animated ``.
- **Per-line** `- animated` (anywhere after the value) pulses just that
  one square — like xray emphasizing its biggest files.
- Non-positive / unparseable lines are dropped; empty → nothing.

## How it works

`renderTreemap` in `$lib/markdownit.ts` builds a `d3-hierarchy`
(`hierarchy().sum().sort(desc)`) and runs `d3.treemap()` with
`treemapSquarify` over a fixed **1000×600 viewBox** (the SVG scales
responsively; `preserveAspectRatio`). It emits, per leaf, a rounded
`<rect>` in the single chosen color, plus an Oswald label (the face we
already bundle, Sprint 31) auto-fit to the cell — value sub-label shown
only when the cell has room; labels hidden on tiny cells. Text is white
(the palette is 600-level, dark enough for contrast). Cells are separated
by `paddingInner` (the page background shows through), which is how
same-colored squares stay distinct.

CSS-only otherwise, synchronous, no hydration — like the other fences.
Animated squares get a pulsing white outline (`.md-treemap-pulse`,
`@keyframes md-tm-pulse`), reused conceptually from xray and
reduced-motion safe.

## Files

- `documentation/SPRINT35.md` — this doc.
- `package.json` — `d3-hierarchy` (+ `@types/d3-hierarchy`).
- `src/lib/markdownit.ts` — `renderTreemap`; `treemap` case in the
  `fence` rule (reuses `MARQUEE_COLORS`).
- `src/app.css` — `.md-treemap*` styles + pulse keyframes.
- `src/lib/components/SlashMenu.svelte` — "Treemap" slash command.
- `src/lib/components/FormattingHelp.svelte` — a treemap row.

## Not doing

- No nested/hierarchical treemaps (flat only), no per-square colors (single
  color by design), no tooltips/click actions. Kept read-only + simple.
