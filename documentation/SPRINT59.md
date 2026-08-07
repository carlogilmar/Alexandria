# Sprint 59 — Backend PR blocks: terminal · tree · flow · compare

Four more powered-markdown blocks for backend PR docs, each with a built-in
header from the fence info, a **PNG copy** button, and — where there's motion —
a **GIF export** button. All synchronous/CSS-only to render; the GIF is produced
by a general multi-frame capture (below). Explored + narrowed in an Artifact
mockup first (dropped diff/badges/endpoint/callouts/walkthrough per the author).

## Blocks (`$lib/markdownit.ts`)

- **```terminal [title] [animated]** (`renderTerminal`) — a console window; the
  fence info is the title-bar label (its header), lines starting with `$` are
  green commands. `animated` streams the lines in (GIF).
- **```tree [title]** (`renderTree`) — a file/dir tree; indent (2 spaces) = depth,
  a trailing ` - new` (green) / ` - edit` (amber) legend tags the file (no line
  counts). A line ending `pulse` makes its TEXT breathe (GIF).
- **```flow [title]** (`renderFlow`) — a linear pipeline, one node per line
  `Name: sublabel`. ≤4 nodes horizontal, 5+ auto-vertical. A plain marker glides
  the path and each node "hovers" (amber border + tint + lift) as the marker
  arrives — synced via a per-node `--fdelay` computed from its position (GIF).
- **```compare [title]** (`renderCompare`) — before / after split by a `---`
  line; each pane is an inset code panel, cross-fading in place (GIF).

Header bars use the shared `blockHeader()` → `.md-bhead`, driven by the **fence
info** (not a `heading:` body line like files/stats/spec). CSS lives under
`/* Backend PR blocks */` in `app.css`.

Also refined the existing **```files** block: it no longer shows `+N/-N` line
counts — the status is a colored word label (`new`/`edit`/`delete`/`rename`,
`--st` hue) and the per-file note is black. Counts in the source are ignored.

## GIF engine — general multi-frame capture (`installGifSave`, rewritten)

The old pulse-only overlay compositor was replaced by a **state-driven** capture
that handles every motion type. It freezes live CSS animation via a `.md-cap`
class, then for each frame drives the visual state from JS, rasterizes with
html-to-image `toCanvas`, and encodes a looping GIF with `gifenc`:

- **flow** — interpolate the marker along the path (24 frames) + `.on` the node
  under it each frame.
- **compare** — toggle the before/after layer opacities (hold + crossfade).
- **terminal** — reveal lines cumulatively.
- **pulse / tree** — drive a `--capop` opacity (floor 0.35 ring / 0.62 tree text).

Robustness (WKWebView): white padding (blends into a light PR), every opaque
background forced inline (foreignObject drops CSS bg), inner block margin zeroed
(equal padding), `content-box` + oversized canvas (no clip), `fonts.ready` + a
warm-up pass. Saved via the native dialog; browser fallback = a download.
Clipboards can't carry animation — hence a SAVE, not a copy. The PNG button
(`installBlockImageCopy`) is unchanged and on every block.

## Also

Slash commands (Terminal · File tree · Flow · Before/after) + FormattingHelp
rows. `pr-blocks-demo.md` rewritten as one backend PR ("Add per-IP rate limiting
+ audit log") exercising every block.

## Checks

`svelte-check` 0/0, `pnpm build` clean. The image **clipboard write** and **GIF
save** still need a live `pnpm tauri dev` run to verify (WKWebView native paths).
