# Sprint 24 — Blueprints as a presentation & documentation surface

Blueprints graduated from "a nice planning canvas" to the user's daily
diagramming tool — used live in screen-shares, exported to share with
colleagues, and kept as documentation. This sprint hardens it for exactly
those uses. All four items are scoped to the Blueprints section; nothing
else in the app is touched.

## 1. Presenter view

A read-only-feeling "stage" mode for screen-sharing, toggled from the
toolbar (or exited with **Esc**). It is pure presentation — no data changes,
no new state beyond a single `presenting` boolean in `BlueprintEditor`.

- While on, the authoring cluster (Card/Title/Text/Comment/Export/Presenter)
  hides; a centered hint + **Exit** button appear.
- The backdrop swaps to a theme-aware **stage gradient** (`stageBg`, applied
  as an inline `background` so it overrides the Tailwind canvas bg).
- Hovering **any** node spotlights it: the moment the cursor is over a node,
  every node dims (`opacity: 0.22; saturate(0.8)`); the hovered one is
  exempted by a more-specific `:hover` rule and lifts with a `drop-shadow`.

### Why it's pure CSS (`:has()`), not state

The dim/spotlight is driven entirely by a `.bp-presenting` class on the
wrapper plus `:global(.bp-presenting:has(.svelte-flow__node:hover) …)`. This
means hovering costs nothing in JS and — critically — does **not** rebuild
node objects, so the identity caches in the sync `$effect` (Sprint 22) stay
intact. WKWebView on current macOS supports `:has()`.

### Why `drop-shadow`, not `transform: scale()`

xyflow positions each node with an inline `transform: translate(...)`. A CSS
`transform: scale()` on the node wrapper would either be overridden by the
inline translate or fight it and break positioning. `filter: drop-shadow()`
gives the "lift" instead, and it follows the card's rounded alpha shape.

## 2. Icon-only toolbar + tooltips

The toolbar cluster grew past comfortable width. All buttons are now
icon-only with the name in a native `title` tooltip (square `p-2` padding, no
label text). The presenter-mode **Exit** button keeps its label since it sits
beside a hint, outside the cluster.

## 3. Copy PNG to clipboard

The PNG pipeline was refactored so the compose step (`composeCropPng`)
returns the encoded `Blob`, and two callers consume it:

- `doExport()` → native save dialog → `save_binary_file` (unchanged behavior).
- `doCopy()` → `navigator.clipboard.write([new ClipboardItem(...)])`.

The crop bar now offers **Save PNG** and **Copy** side by side; both reuse
the same crop rectangle and the same "card style" composition (flat bg + dot
grid + margin + hairline border + title). Clipboard image writes work in
WKWebView on current macOS; the button click is the required user gesture. On
failure it flashes an error rather than failing silently. **Needs a live
test** — image clipboard support is the one thing not verifiable headless.

## 4. Paste images onto the canvas (Approach A)

Blueprint nodes had no image capability (kinds: `card·text·comment·title`).
We chose **Approach A — image lives on a card** over a new `image` node kind,
because a new kind means the `kind` CHECK-constraint table-recreation dance
(the 0006/0008/0010 pattern) for no real gain.

- **Migration `0018_blueprint_node_image.sql`**: `ALTER TABLE blueprint_nodes
  ADD COLUMN image_url TEXT` — nullable, additive, no CHECK change, no table
  rebuild.
- **Backend**: `BlueprintNode.image_url: Option<String>`; `NODE_COLS` gains
  `image_url`; new `add_image_card` / `add_blueprint_image_card` command
  (registered in `lib.rs`) inserts a card with an image and empty
  title/description. A round-trip test guards it.
- **Frontend**: `BlueprintNode.imageUrl`, `addBlueprintImageCard` ipc +
  store action. `BlueprintCardNode` renders the image at the top; when an
  image is present the title becomes a small optional caption ("Add a
  caption…" placeholder) and the empty-description placeholder is suppressed.
- **Paste**: a window-level `onpaste` in `BlueprintEditor` reads image items
  from the clipboard, saves each via the existing `save_image` backend
  (`saveImageFile`), sizes the card from the image's natural width (clamped
  140–360px, height auto), and drops it at the last cursor position. It bails
  out when the paste target is an input/textarea so editing a card isn't
  hijacked.

### Export tainting — the gotcha we planned around

Pasted images render via the Tauri asset protocol (`convertFileSrc`). When
`html-to-image` re-fetches them inside its clone, a tainted/cross-origin
response would make the export canvas throw on `toBlob`, silently breaking
the killer export feature on any blueprint containing an image. Mitigation:
`inlineImagesForCapture` fetches each `<img>` src, converts it to a `data:`
URI, swaps it in for the duration of the capture, and restores afterward (in
a `finally`). Best-effort — a failed fetch just leaves the original src for
html-to-image's own attempt. **Needs a live test**: export/copy a blueprint
that contains a pasted image and confirm the image appears in the PNG. If it
doesn't, the fallback is a backend command that returns the image bytes as
base64 (goes through Rust, bypassing any webview CORS entirely).

## 5. Home / Sidebar / Summary / theme follow-ups (same sprint)

A usability pass once Blueprints became a daily driver:

- **Home counters** (`Welcome.svelte`): dropped the Lists & Tasks counters
  (those live in the calendar below) in favor of **Articles / Notes /
  Blueprints**, each still click-to-expand. Added two quick-nav action cards —
  **Summary** (`app.openIndex()`) and **Visualization** (`app.openGarden()`) —
  in the same grid. The removed buckets' panels/derivations were deleted.
- **Sidebar** (`Sidebar.svelte`): pinned **Blueprints** now show in their own
  section (mirrors boards/notes) — resolves the Sprint 22 deferral. Selection
  highlight via `app.selectedBlueprint`.
- **Summary** (`SummaryView.svelte`): replaced the 8 horizontal tabs (which
  overflowed) with a compact **left section rail** (counts per section) plus an
  **All** view that unions every active entity most-recent-first. The seven
  near-identical per-kind row blocks collapsed into ONE normalized `Row` model
  + a single `{#snippet entityRow}` — big de-duplication. `Row.chipKind` is
  nullable because `IdChip` doesn't render `board`/`flashcard`. Archived keeps
  its own rendering (kind label + unarchive). Workflows have no timestamp, so
  they carry an empty `sortKey` and fall to the bottom of All.
- **Theme** (`theme.svelte.ts`): more sidebar backgrounds — flat `teal`,
  `indigo`, dark `espresso`, `plum`; animated `cosmos`, `lagoon`, `magma`, and
  a light `citrus`.

All frontend-only; `svelte-check` clean.

## Deferred

- Adding a title/description to an image card has no click affordance beyond
  the caption line (description placeholder is suppressed for image cards).
- Resizing an image card letterboxes via `object-fit: contain`; no crop UI.
- Images are not yet embeddable elsewhere (no `{{…}}` token for a blueprint
  image; they live only on the canvas).
