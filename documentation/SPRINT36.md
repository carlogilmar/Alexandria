# Sprint 36 — Unified color + gradient vocabulary

## Why

The customizable markdown elements had drifted apart: charts used one hex
set (no black, no gradients), marquee/progress/treemap used another, and
only marquee/cards accepted gradients. The user wanted **one uniform
palette** — the same solid colors *and* gradients available everywhere.

## The single source of truth

`$lib/markdownit.ts` now defines the vocabulary once:

- `NAMED_COLORS` — `red · orange · amber · green · teal · blue · violet ·
  pink · gray · black` (600-level, white text reads on them).
- `NAMED_GRADIENTS` — `sunset · ocean · forest · dusk · candy` (matches the
  ```cards gradient presets), stored as `[from, to]` stop pairs.

Three resolvers adapt that vocabulary to each rendering medium:

- `isNamedFill(token)` — is this any known color/gradient name?
- `namedBackground(token)` → a CSS `background` value (solid hex or
  `linear-gradient(...)`), for **HTML** elements (marquee, progress).
- `namedSvgFill(token)` → `{ fill, def }` — a solid hex, or a `url(#id)`
  plus a `<linearGradient>` `<defs>` to prepend, for **SVG** elements
  (chart bars/line, treemap). Gradients can't be an SVG `fill` value
  directly, so each gets a uniquely-numbered def (`svgGradSeq`).

## What changed per element

- **Charts** (bar/line): accent now resolves through `namedSvgFill`, so it
  accepts every solid **and** gradient (and `black`); the `<defs>` is
  threaded into the chart SVG. Donut keeps its own auto-assigned
  categorical `CHART_PALETTE` (that's not a user color *choice*).
- **Progress**: the trailing color word accepts gradients too; the fill
  uses the `background` shorthand, so the animated barber-pole stripes
  moved to a `::after` overlay (the shorthand would otherwise wipe
  `background-image`). Completed bars still force solid green.
- **Treemap**: the fence color accepts gradients (all cells share one
  gradient via a single def).
- **Marquee**: unchanged behavior, now sourced from the shared maps.
- **Cards**: already spoke this exact vocabulary (CSS-class based) — left
  as-is; the names line up.

Removed the old `CHART_NAMED` / `MARQUEE_COLORS` / `MARQUEE_GRADIENTS`
maps in favor of the shared ones.

## Docs

`FormattingHelp` gains a single **"Colors & gradients"** section listing
the shared names; the per-element rows point at it. Charts/progress/
treemap rows now say "color or gradient."

## Files

- `documentation/SPRINT36.md` — this doc.
- `src/lib/markdownit.ts` — shared maps + resolvers; chart/progress/
  treemap/marquee updated; `CHART_NAMED` removed.
- `src/app.css` — progress stripes moved to `::after`.
- `src/lib/components/FormattingHelp.svelte` — "Colors & gradients"
  section.

## Not doing

- Cards keep their tint/filled CSS model (not converted to hex fills) —
  only the *vocabulary* is unified, not the visual treatment.
- No custom hex input; the named palette stays the contract.
