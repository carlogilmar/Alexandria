# Sprint 54 — PR / code-doc markdown blocks (files · stats · spec · cards)

A family of powered-markdown blocks for writing PR descriptions and code
findings in Alexandria (then copying to the PR). All are **synchronous /
CSS-only** in `$lib/markdownit.ts` (they render in note previews + blueprint
cards, and are screenshot-friendly), and all can be **copied as an image**
straight into a PR.

> This doc consolidates what was iterated across several passes (the original
> files/cards, the stats/spec blocks, the shared header, surface themes, the
> per-item pulse, and the copy-as-image work). Collapsible toggle sections —
> shipped alongside — are their own feature; see `SPRINT55.md`.

## The blocks

### ```files — changed-files list
`renderFiles`. One file per line:
`<A|M|D|R> <path> [+adds] [-dels] [pulse] [— note]` (status case-insensitive,
default `M`; note also after ` -- ` / ` # `).

- **Status colors the row** — a left rail (`--st`) + the letter chip
  (A green · M amber · D red · R blue).
- **Path** = dimmed `dir/` + **bold** `filename`, plain mono text (GitHub-style,
  no pill — a fixed-width pill left a gap in the copied image when the mono font
  substituted during rasterization).
- **Header** sums `N files changed` + total `+adds −dels`.
- The **note** is a description row with inline markdown (`code`, **bold**, …).

### ```stats [theme] — metric cards
`renderStats`. One `Label: value` per line; value big, label small, `+N`/`−N`
colored green/red. An optional `heading:` line adds the header bar (title +
metric count) and wraps the grid in a panel. Cards are neutral (theme-driven).

### ```spec [theme] — label→value sheet
`renderSpec`. One `Label: value` per line; the **key column** is theme-tinted
neutral, **values take inline markdown** (`md.renderInline`). An optional
`heading:` line adds the header bar (title + field count).

### ```cards — link-card grid (pre-existing)
Gained an optional header: a first block declaring `heading:` (+ `desc:`)
renders the header bar (title/subtitle + card count) and wraps the grid in a
panel. Backward-compatible (no `heading:` → bare grid).

## Shared pieces

- **`blockHeader(title, sub, meta, md)` → `.md-bhead`** — the GitHub-style
  tinted header bar (title/subtitle left, count/metric right) used by
  files/stats/spec/cards. `.md-files-head` shares its container CSS.
- **Surface themes (stats/spec)** — a fence keyword picks a `.md-theme-*` class
  (`surfaceThemeClass`) that sets CSS vars (`--surf`/`--ink`/`--line`/
  `--head-bg`/`--card-base`/`--neutral`/`--pos`/`--neg`). Themes: **github**
  (default, the light-gray "files changed" look) · light · dark · midnight ·
  slate. No accent color — an accent hue was tried and removed (looked noisy);
  the blocks are theme-only.
- **Per-item `pulse`** — a trailing `pulse` on a single stat card / spec row /
  file row (`peelPulse`) adds `.md-pulse`: a gentle neutral breathing highlight
  (an inset overlay + ring in the theme's text color, so it isn't clipped by the
  panel's `overflow`; reduced-motion-safe).

## Copy as image

`files`/`stats`/`spec`/`cards` wrap in `.md-block` (`withImgCopy`) with a hover
📷 button. A delegated capture-phase listener (`installBlockImageCopy`, like
`installCodeCopy`) rasterizes the block via **html-to-image** `toBlob` (2×) and
copies a PNG — native Tauri `copy_image_to_clipboard` first, `navigator.clipboard
.write` fallback (both dynamic-imported). To make it robust in WKWebView:

- **White padding** around the widget (blends into a light PR page) so a
  dark-themed widget reads as a card on white, not a big dark rectangle.
- **Force every opaque background inline** before capture (restored after) —
  WebKit's `foreignObject` rasterizer otherwise drops CSS backgrounds.
- **Zero the inner block's margin** during capture so every block type gets the
  same top/bottom padding.
- `content-box` + an oversized canvas (`w/h + 2·pad`) so nothing clips; `await
  document.fonts.ready` + a throwaway warm-up pass (WebKit under-measures the
  first render).

## Discoverability

Slash commands (Changed files · Stat cards · Spec sheet; cards template shows the
`heading:`) + FormattingHelp rows. `pr-blocks-demo.md` (repo root) exercises all
of it.

## Checks

`svelte-check` 0/0, `pnpm build` clean throughout. The image **clipboard write**
still needs a live `pnpm tauri dev` run to verify (WKWebView native path).
