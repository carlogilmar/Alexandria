# Sprint 55 — Collapsible toggle sections + image-copy fix

## Toggle sections

A heading whose text starts with `>` (e.g. `## > Roadmap`) becomes a
collapsible **`<details>` section, collapsed by default**, so a long
reference note reads as a summary you expand on demand.

- `addCollapsibleSections(md)` in `$lib/markdownit.ts` — a core rule (pushed
  after `line_numbers`, so headings keep their `data-line`) that walks the
  token stream and wraps each toggle heading: it emits `section_open`
  (`<details><summary>`), the heading tokens, `section_body_open`
  (`</summary><div>`), then `section_close` (`</div></details>`) at the next
  heading of the **same-or-higher level** (a level stack) or at EOF. The `>`
  marker is stripped from the heading's inline content + first text child.
- Render rules for the three marker token types emit the wrapper HTML.
- `installSectionToggle()` — a capture-phase delegated click listener (like
  `installCodeCopy`) that owns the toggle: on a `.md-section-sum` click it
  `preventDefault` + `stopPropagation` (so it never trips a surface's
  click-to-edit) and flips `details.open`. A link inside the heading is left
  alone so it still navigates.
- `.md-section` / `.md-section-sum` (disclosure triangle via `::before`,
  rotates when open) / `.md-section-body` CSS in `app.css`.
- Opt-in by the marker → plain headings and existing notes are untouched.
  Works on every markdown surface (notes especially). Nested toggles nest.
- Slash command "Toggle section" + FormattingHelp row.

## Image-copy fix (follow-up to Sprint 54)

The copy-as-image button produced a gray background + clipped bottom/right
borders in WKWebView. Root cause: WebKit's `foreignObject` rasterizer drops
an element's own `background` and under-measures height on first render.
Fix in `installBlockImageCopy`: force a solid `background` on the capture
root (masks the dropped inner bg), apply padding with `content-box` + an
oversized canvas (`w/h + 2·pad`) so nothing clips, `await document.fonts.ready`,
and do a throwaway warm-up `toBlob` before the real pass.

## Checks

`svelte-check` 0/0, `pnpm build` clean. Image capture still needs a live
`pnpm tauri dev` run to confirm the clipboard write.
