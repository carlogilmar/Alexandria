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
grid + margin + hairline border + title).

**Clipboard via native, not the web API.** `navigator.clipboard.write()` for
images throws `NotAllowedError` in WKWebView ("the request is not allowed by
the user agent") — text works, images don't. So `doCopy` PNG-encodes the blob
and hands the bytes to a Rust command `copy_image_to_clipboard`, which decodes
the PNG (tauri `image-png` feature → `Image::from_bytes`) and writes it with
the `tauri-plugin-clipboard-manager` plugin (`app.clipboard().write_image`).
Plugin registered in `lib.rs`; `clipboard-manager:allow-write-image` added to
capabilities. (The web-API version was the "not allowed" bug the user hit.)

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

## 6. Blueprint polish pass (same sprint)

Feedback from daily use:

- **Dark-mode tables** (`BlueprintCardNode`): card description tables were
  forced white with dark text (readable on any tint, but glaring in dark
  mode). Added dark overrides — a faint light panel (`rgba(255,255,255,0.06)`,
  works on any card tint) with light text.
- **Edges: left at xyflow's default grey** (`animated` dashed, inline
  `stroke-dasharray: 6 4`). Two attempts were reverted at the user's request: a
  slate `stroke`/`stroke-width:2` override read as heavy/static, and a sky-blue
  colour via `--xy-edge-stroke` was "weird". The user prefers the original grey
  animated dashes, so we set NOTHING on the edge stroke now. (If visibility is
  ever raised again, tune it without killing the marching-dash feel.)
- **Toolbar tooltips**: shortened to concise labels — "Add node", "Add
  header", "Add text", "Add comment", "Export", "Presenter view".
- **Presenter icon**: the old monitor-with-stand glyph rendered incompletely;
  replaced with a single-path monitor-with-play icon that fills the viewBox.
- **Presenter background now actually shows**: the stage gradient was being
  hidden because xyflow paints its own opaque pane background over the
  wrapper. Presenter mode now forces `.svelte-flow`/pane/renderer transparent
  so the gradient is visible.
- **Presenter is read-only / locked**: `nodesDraggable`, `nodesConnectable`,
  `elementsSelectable` all off while presenting; delete key disabled; edge
  clicks ignored; a capture-phase click handler on the wrapper swallows clicks
  before they reach node edit/remove handlers; in-node ACTION buttons hidden
  via CSS — scoped to `[class*="-remove"]` + the colour picker, NOT content
  buttons like `.title-display`/`.comment-display` (hiding those made section
  headers vanish in presenter view — fixed).
  Add-node buttons were already hidden. Panning/zoom (pointer/wheel) and the
  hover spotlight (pure CSS) still work.
- **Export + Presenter moved into the xyflow Controls** (bottom-left): added as
  `<ControlButton>` children of `<Controls>` (alongside zoom/fit/lock), and
  removed from the top-right cluster (which is now just the four Add buttons).
  The presenter click-lock is scoped to `.svelte-flow__node` clicks precisely
  so it does NOT swallow the Controls buttons — that's how you toggle presenter
  off from the same spot. (Earlier bug: the lock was scoped to the whole
  wrapper and killed the Exit button; now fixed.) The two custom buttons are
  colour-coded via `ControlButton`'s `color`/`colorHover` props (which set
  xyflow's `--xy-controls-button-color-props`): Export is amber with a
  **scissors** icon (stroke-based — a CSS override beats xyflow's
  `fill: currentColor` so the finger-holes stay open), Presenter is violet.
- **New-node reveal**: on a big board a freshly-added node was easy to lose.
  Adds now (a) place via a *bounded* cascade (index wraps mod 10, so nodes
  cluster near the viewport centre instead of spiralling off-screen), and
  (b) `revealNode()` pans the viewport to the new node (keeping current zoom,
  450ms) and flashes a one-shot sky-blue glow (`.bp-flash-new`, driven by
  `justAddedId` in the sync effect; `sameNode` now compares `class` so the
  flash class toggles cleanly through the identity cache). Applies to Add
  card/header/text/comment and the last pasted image.
- **Labeled Add buttons**: with Export/Presenter gone from the top-right
  cluster, the Add buttons show text labels again (Card / Frame / Header /
  Text / Comment), icon + label.

## 7. Frames (same sprint)

A `frame` node kind — a labeled, resizable rectangle drawn behind cards to
group/section a diagram on big boards. **Visual only**: moving the frame does
NOT move the cards inside (chosen over Miro-style grouping to keep it simple;
grouping is a possible follow-up).

- **Migration `0019`**: recreated `blueprint_nodes` to widen the `kind` CHECK
  to include `frame` (SQLite can't ALTER a CHECK), preserving `image_url`, and
  rebuilt `blueprint_edges` so its FK re-binds (the 0006/0008/0010 pattern).
- **Backend**: `add_frame` / `add_blueprint_frame` (label in `content`, a
  starting width/height); label edits reuse `update_blueprint_node_content`,
  size reuses `resize_blueprint_node`. Round-trip test added.
- **Frontend**: `BlueprintFrameNode.svelte` (dashed tinted rectangle +
  editable top-left label + NodeResizer + remove ×). In `toFlowNode`, frames
  are `type: bpFrame` with `zIndex: 0` while every other node is `zIndex: 1`,
  so frames always sit behind cards regardless of creation order. A "Frame"
  toolbar button creates one centred on the viewport and reveal-flashes it.
- **onConnect guard**: connections are now restricted to card↔card, so loose
  connection mode can't drop a stray edge onto a frame (or a decorative).
- **Frame is pointer-transparent** (`.svelte-flow__node-bpFrame` →
  `pointer-events: none`, re-enabled on label/remove/resize handles): the large
  frame wrapper was intercepting hover/clicks meant for the cards on top (seen
  as "can't hover nodes inside a frame" in presenter view). Now interior
  clicks fall through to the cards (and the pane, so you can pan through a
  frame); the frame is still renamable/removable/resizable and draggable by its
  label.

Follow-ups: drag-to-move-contents (grouping); per-frame color.

## 8. Copy-code buttons (same sprint)

GitHub-style "copy" button on every fenced code block, across all markdown
surfaces (notes, articles, embeds, blueprint cards). Frontend-only, in the
shared `$lib/markdownit.ts` factory.

- The `fence` renderer wraps each non-mermaid block in
  `<div class="md-code">` + a static copy button (clipboard + check icons).
- A single delegated document listener (`installCodeCopy`, installed once) does
  the copy — delegation survives the `{@html}` re-renders every surface does,
  where a per-button Svelte handler couldn't. It reads the code from the
  sibling `<code>`'s `textContent` (so syntax-highlight spans are stripped) and
  `navigator.clipboard.writeText`s it. Capture phase + `stopPropagation` so the
  click doesn't also trip a surface's click-to-edit. On success it toggles
  `.md-copied` (clipboard→check, green) for 1.4s.
- CSS in `app.css` (`.md-code` / `.md-copy-btn`): button top-right, revealed on
  block hover/focus, light + dark.

## 9. Quick-action shortcuts (Stream Deck) (same sprint)

A cohesive **⌘⇧** cluster of global shortcuts so the user can bind Stream Deck
buttons (which just send keystrokes). All in `+page.svelte`'s `handleKeydown`,
alongside the existing ⌘-digit nav:

- **⌘⇧T** — open today's list *if it exists* (`app.openTodayList`: mirrors the
  sidebar's detection — today's date, not archived, lowest id; flashes "No list
  for today yet" otherwise, never auto-creates per Sprint 11). ⌘N still creates.
- **⌘⇧N** — new note (`newNote()`, defaults to today). ⌘N (no shift) is still
  new list.
- **⌘⇧B** — new blueprint (`newBlueprint("Untitled blueprint")`, creates+opens).
- **⌘⇧S** — Summary (`openIndex`).
- **⌘⇧A** — open the designated **quick article** (a references doc). (Was
  ⌘⇧R, but that's the webview's native force-reload accelerator — it fires
  before JS and can't be `preventDefault`ed, so the app just reloaded. Moved to
  ⌘⇧A.) A single
  `app.quickArticleId` (persisted in localStorage) is set/cleared with a **★**
  toggle in `ArticleView`'s header; `openQuickArticle` opens it, or flashes a
  hint if none is set / it no longer exists.

Added to `HelpModal` under "Quick actions (Stream Deck friendly)".

## 10. Add-modal + blueprint-title fixes (same sprint)

- **Add-entity modal rendered under the view** — `AddEntityModal` was mounted
  *inside* `Sidebar`, whose `isolate` creates a stacking context, so the
  modal's `fixed inset-0 z-50` was trapped and the main column painted over it
  ("weird mode"). Lifted to the page root: new `app.addModalOpen` flag (like
  `paletteOpen`/`helpOpen`), rendered in `+page.svelte`; the sidebar "+ Add"
  button just flips the flag.
- **Enter creates** — the modal submitted only on ⌘Enter; now plain **Enter**
  (from the title field or anywhere in the dialog) creates. Esc still cancels.
- **Blueprint title is editable** — the top-left title chip in
  `BlueprintEditor` is now a click-to-rename control (input on click → Enter/
  blur commits via `app.renameBlueprint`, Esc cancels), matching how note /
  article titles work.

## 11. Task detail → modal + notes-style editor (same sprint)

The task **Inspector** was a cramped right sidebar with a raw markdown textarea
*and* a separate rendered preview stacked below it — hard to use. Reworked:

- **Now a centered modal** (`Inspector.svelte` root is a `fixed inset-0`
  dialog + backdrop) instead of an `<aside>`. Rendered at the page root in
  `+page.svelte` (moved out of the flex row) so it overlays cleanly; backdrop
  click or Esc (global handler) closes it.
- **Description reuses `MarkdownEditor`** — the same click-to-edit component
  notes/articles use (rendered view + Edit button → textarea → click-out
  commits). Task descriptions now get everything that comes with it for free:
  entity links, `{{embeds}}`-style links, ```mermaid diagrams, `- [ ]`
  sub-checklists, syntax highlighting, the copy-code button. Wired via
  `onCommit → app.updateSelectedNotes`.
- Title is a prominent inline input (Enter/blur commits, Esc reverts —
  `stopPropagation` so Esc doesn't also close the modal); tags section kept.

## 12. Markdown style polish (same sprint)

Applied across every markdown surface (notes, articles, task descriptions).
The base typography is duplicated in `MarkdownEditor` + `ArticleEditor` scoped
styles (with a few global rules in `app.css`), so edits touch both plus
app.css:

- **Task checkboxes** (`app.css`): were vertically misaligned / wrapped text
  slid under the box. Now the `input.md-task` is absolutely positioned in a
  fixed left gutter with `padding-left` on the item → clean alignment + a
  proper hanging indent.
- **Tables** (both editors): rounded outer corners (`border-collapse:
  separate` + `overflow:hidden` — `collapse` ignores `border-radius`; cells
  carry only bottom/right borders, the table supplies the top/left edge),
  accent-tinted header (`app.css` `thead th`, blue), and a **row hover** tint.
- **h1** (both editors): bumped 1.5rem → 1.95rem, weight 700.
- **Code blocks** (both editors): softer bg + 1px border + 8px radius + more
  padding. Also *added* the `pre` rule to `ArticleEditor`, which was missing it
  (article code blocks had no panel styling before).

## Deferred

- Adding a title/description to an image card has no click affordance beyond
  the caption line (description placeholder is suppressed for image cards).
- Resizing an image card letterboxes via `object-fit: contain`; no crop UI.
- Images are not yet embeddable elsewhere (no `{{…}}` token for a blueprint
  image; they live only on the canvas).
