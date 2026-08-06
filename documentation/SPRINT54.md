# Sprint 54 — PR blocks II: file descriptions, `stats`/`spec`, copy-as-image

Follows Sprint 53. More PR/code-doc markdown, from the mockup menu.

## What shipped

### `files` — per-file description rows

The `— note` on a file line now renders as a **description row beneath**
the file (full width, wraps) instead of a truncated inline label. Row is
`.md-file` (column) → `.md-file-top` (chip · path · ±counts) + optional
`.md-file-desc` aligned under the path.

### `stats` — metric cards

`renderStats`: one `Label: value` per line → a row of cards (value big,
label small; `+N`/`-N` inside the value auto-colored green/red).
`.md-stats`/`.md-stat` CSS. Slash "Stat cards" + help row.

### `spec` — label→value sheet

`renderSpec`: one `Label: value` per line → a bordered two-column sheet
(risk / rollback / scope …). `.md-spec` CSS. Slash "Spec sheet" + help row.

### Copy block as image

`files` / `stats` / `spec` / `cards` blocks are wrapped in `.md-block`
(`withImgCopy`) with a hover **📷 "copy as image"** button. A delegated
listener (`installBlockImageCopy`, like `installCodeCopy`) rasterizes the
block via **html-to-image** `toBlob` (2×, solid `document.body` background,
12px padding, the button filtered out) and copies a PNG — preferring the
native **Tauri clipboard** (`copy_image_to_clipboard`, reliable in
WKWebView) with a `navigator.clipboard.write` fallback. html-to-image +
the ipc are dynamic-imported so they don't weigh on surfaces that never
copy. Button shows a check on success (1.4s).

## Notes

- All synchronous/CSS-only; render in note previews + blueprint cards.
- The image capture needs a real webview run to verify the clipboard write
  (WKWebView `getUserMedia`-style native path).
- Still deferred from the menu: `diff`, `annotate`, `badges`, `terminal`,
  extra callouts.

## Checks

`svelte-check` 0/0, `pnpm build` clean.
