# Sprint 38 — Lettering (big centered announcements)

## Why

The user wanted a way to display a **big, centered display-type title** —
distinct from a heading — to call out memorable/important things at the
top of a note. Reuses the bundled **Oswald** face (as in the sidebar
brand mark and treemap labels).

## DSL

````
```lettering violet
Remember the deadline
```
````

- Fence body = the text; each non-empty line renders as its own centered
  line.
- Optional **color/gradient** in the info string (the shared vocabulary):
  a solid tints the text; a **gradient** becomes *gradient text* (via
  `background-clip: text`). No color → the theme's normal text color.

## Look

`.md-lettering` (in `app.css`): Oswald 700, centered, **uppercase**,
`font-size: clamp(2rem, 6vw, 3.4rem)`, `text-wrap: balance`. That
combination (centered + oversized + uppercase display face) is what
separates it visually from `#`/`##` headings, which stay left-aligned and
in the body font.

`renderLettering` in `$lib/markdownit.ts` is CSS-only/synchronous like the
other fences; gradient text adds `.md-lettering-grad`
(`background-clip: text; color: transparent`) with the gradient as an
inline `background`.

## Files

- `documentation/SPRINT38.md` — this doc.
- `src/lib/markdownit.ts` — `renderLettering`; `lettering` case in the
  `fence` rule.
- `src/app.css` — `.md-lettering` / `.md-lettering-grad`.
- `src/lib/components/SlashMenu.svelte` — "Lettering (big title)" command.
- `src/lib/components/FormattingHelp.svelte` — a lettering row.
- `MARKDOWN_SHOWCASE.md` — a lettering example.

## Not doing

- No size/weight/alignment options yet (one bold centered look), no
  per-line color. Uppercasing is intrinsic to the style (type lowercase in
  the source if you ever need a specific case; CSS will still uppercase).
