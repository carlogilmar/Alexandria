# Sprint 37 — Per-cell treemap colors (+ automatic highlight)

## Why

The treemap is single-color by design, but the user wants to **mark
individual squares** in a different color — "and this other color can be
automatic." So: per-line color control, plus a zero-effort `highlight`
flag that picks a distinct accent for you.

## What you can put after a line's value

Building on the existing per-line `- animated`, each `Label: value` line
now also accepts:

- **A color/gradient name** (the shared vocabulary) → recolors *just that
  square*. e.g. `Tests: 18 amber`, `Hotpath: 30 candy`.
- **`highlight`** (or `accent`) → gives that square an **automatic**
  distinct color, cycling through a fixed rotation
  (`amber → red → violet → teal → …`) and **skipping the treemap's base
  color** so highlights always stand out. Multiple highlights get
  different colors automatically.
- **`animated`** → pulse (unchanged).

These combine freely: `Frontend: 42 - highlight animated`. A cosmetic
`-` separator is optional and ignored.

Precedence: an explicit name wins over `highlight`; otherwise the base
fence color applies.

## Implementation

In `renderTreemap` (`$lib/markdownit.ts`):

- Each parsed cell resolves its own fill via `namedSvgFill`, so per-cell
  **gradients** work too — their `<defs>` are collected alongside the base
  and prepended once to the SVG (`defs[]`).
- `highlight` cells draw from `TM_AUTO_ORDER` via a small cursor
  (`nextAuto()`) that skips the base color name.
- `TMData` gained a resolved `fill?` used by each `<rect>`.

## Files

- `documentation/SPRINT37.md` — this doc.
- `src/lib/markdownit.ts` — per-cell color/highlight parsing + fill;
  `TM_AUTO_ORDER`; `defs[]` accumulation.
- `src/lib/components/SlashMenu.svelte` — snippet shows `highlight`.
- `src/lib/components/FormattingHelp.svelte` — treemap row updated.
- `MARKDOWN_SHOWCASE.md` — demonstrates per-cell marking.

## Not doing

- No auto-highlight of the largest N cells (that's xray's job); highlights
  are explicit per line. No per-cell text-color control.
