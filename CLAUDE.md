# Alexandria

A single-user desktop personal knowledge system: daily lists, notes,
articles, workflows, a curated canvas ("Alexandria"), a kanban for
feedback planning, and two visualizations of activity. All data lives
on-device.

> The product is named **Alexandria** (after its centerpiece canvas).
> The macOS bundle identifier is still `com.alertmedia.bigpicture` — it
> was deliberately *not* renamed because it resolves the on-disk SQLite
> path; changing it would orphan existing data. The "bigpicture" string
> survives only in that identifier / DB path, never in the UI.

> If you are a Claude session being onboarded to continue development:
> read this file end-to-end, then skim `documentation/SPRINT*.md`
> chronologically (1 → 13). The sprints are the *why* — this file is
> the *map*.

## Stack

- **Frontend**: SvelteKit + `adapter-static` (SPA, **no SSR**), Svelte 5
  with runes (`$state` / `$derived` / `$effect`), Tailwind CSS v4,
  TypeScript. CSR-only is enforced by `src/routes/+layout.ts`.
- **Backend**: Rust + Tauri 2, `sqlx` against SQLite. The DB file lives
  at `~/Library/Application Support/com.alertmedia.bigpicture/todos.db`
  on macOS. Migrations run automatically at startup via
  `sqlx::migrate!("./migrations")`.
- **Canvas / visualization libs**: `@xyflow/svelte` (Alexandria + the
  feedback connectors), `d3-force` + `d3-scale` (Visualization view).

Bundle ID: `com.alertmedia.bigpicture`. Window has transparent
`titleBarStyle` + macOS sidebar vibrancy (see `tauri.conf.json`).

## Dev commands

```bash
pnpm install                         # once
pnpm tauri dev                       # full app (Tauri window + frontend)
pnpm dev                             # frontend only (browser, no IPC)
pnpm build                           # frontend production build
npx svelte-check --tsconfig ./tsconfig.json   # frontend type check
cd src-tauri && cargo check          # backend type check
cd src-tauri && cargo test --lib     # backend tests (see "Known quirks")
```

Run `pnpm tauri dev` once before committing to ensure migrations apply
to your local DB.

## Repo layout

```
src/
  app.css                       # Tailwind + global rules; imports xyflow CSS
  app.html
  lib/
    components/
      Sidebar.svelte                 # left rail; ⌘1–6 destinations + pinned
      Welcome.svelte                 # home view; calendar grid + buckets
      HelpModal.svelte               # `?` shortcuts modal
      AddEntityModal.svelte          # "+ Add" picker from sidebar
      ListView/NoteView/ArticleView/WorkflowView.svelte
      SummaryView.svelte             # formerly IndexView — tabbed list
      GardenView.svelte              # "Visualization" — d3-force layouts
      MapView.svelte                 # SvelteFlowProvider wrapper
      MapEditor.svelte               # the Alexandria canvas
      MapNodeCard / MapTextNode / MapCommentNode / MapCustomNode / MapTitleNode
      AddToMapPalette.svelte         # entity drop palette on the canvas
      FeedbackBoardsView.svelte      # kanban index
      FeedbackBoardView.svelte       # kanban columns + DnD
      FeedbackCardPanel.svelte       # card detail slide-in
      ActivityView.svelte            # Kandinsky weekly grid
      MarkdownEditor.svelte          # click-to-edit / blur-to-save md editor
      IdChip.svelte
    stores/
      app.svelte.ts                  # SINGLE AppStore class — view + data + actions
      theme.svelte.ts                # light/dark/system
    ipc.ts                           # all types + Tauri `invoke` wrappers
    garden.ts                        # client-side graph builder for Garden
  routes/
    +layout.ts                       # exports `ssr = false`
    +layout.svelte
    +page.svelte                     # dispatches the view by app.view

src-tauri/
  src/
    commands/
      lists.rs todos.rs tags.rs notes.rs articles.rs workflows.rs
      map.rs feedback.rs search.rs export.rs images.rs mod.rs
    db/
      mod.rs                         # pool setup + sqlx::migrate!()
      models.rs                      # ALL serde structs (serde camelCase)
    error.rs markdown.rs lib.rs main.rs
  migrations/                        # 0001-… monotonic, auto-applied
  Cargo.toml tauri.conf.json

documentation/
  SPRINT1.md … SPRINT12.md           # decision log — read these to onboard
```

## Architecture (request → response → render)

```
UI event in a *.svelte component
  → calls app.someAction(args)        (src/lib/stores/app.svelte.ts)
    → app.* awaits an IPC fn          (src/lib/ipc.ts)
      → Tauri invoke "snake_case_cmd" (camelCase args ↔ snake_case auto-converted)
        → commands/<domain>.rs        (returns Result<Model, AppError>)
          → sqlx against SQLite
  → store mutates its $state          (e.g. this.notes = [...this.notes, new])
  → Svelte components re-render reactively
```

`app.view` is a discriminated string. `routes/+page.svelte` is a giant
`{#if/:else if}` over the view names. To add a new top-level
destination, add a string to the union, add a `route` case, add a
sidebar button.

Current view values: `home · list · workflow · note · index · article ·
garden · map · feedback · feedback-board · activity · flashdeck`.

UI labels diverge from internal names where renames happened — the
internal name stays to avoid touching every callsite. The six primary
destinations live in `TopNav.svelte`, an icon cluster in a reserved top
toolbar row of the main column (Sprint 17/18), not the sidebar; shortcuts
unchanged:

| Internal | UI label             | Shortcut |
|----------|----------------------|----------|
| home     | Home (also logo)     | ⌘1       |
| map      | Alexandria           | ⌘2       |
| index    | Summary              | ⌘3       |
| garden   | Visualization        | ⌘4       |
| feedback | Feedback             | ⌘5       |
| activity | Activity             | ⌘6       |
| flashdeck| Flash Deck           | ⌘7       |

`TopNav.svelte` also hosts the **back** button (`app.back()`, ⌘[) —
backed by `app.navStack`, a history stack each `select*`/`open*`/`goHome`
pushes to — plus the theme toggle and the sidebar-tint picker. The
sidebar is now search + pinned items + footer only.

## Svelte 5 patterns we follow

- **All state in the store class.** `app` is a singleton. Components
  read from it and call its actions; they don't hold their own data.
- **`$state` vs `$state.raw`.** Default to `$state`. Use `$state.raw`
  for arrays bound to xyflow (`bind:nodes={flowNodes}`,
  `bind:edges={flowEdges}`) — the deep proxy can swamp the main thread
  during xyflow's high-rate updates. We trigger reactivity by
  *reassigning* the variable, not by mutating it.
- **`$effect` only for side effects / sync.** Avoid using it for
  derivations — use `$derived` instead.
- **Modal pattern**: a child component takes an `onClose` prop and
  renders a full-screen overlay-button + a dialog (see
  `AddEntityModal.svelte`, `FeedbackCardPanel.svelte`).

## Subtle / non-obvious patterns (READ BEFORE EDITING THE CANVAS)

### `MapEditor.svelte` reactive sync is a SINGLE effect

There's exactly one `$effect` that reassigns BOTH `flowNodes` AND
`flowEdges`. Having two separate effects caused xyflow to drop edges on
node-only mutations (Sprint 12). The effect also maintains
`flowNodeCache` / `flowEdgeCache` Maps so unchanged items keep the same
JS object identity across rebuilds — xyflow's internal reconciler
short-circuits on identity, which keeps the canvas stable.

If you add a new field to map nodes/edges, update `sameNode` /
`sameEdge` to compare it, or refs will go stale.

### Feedback kanban uses pointer events, not HTML5 drag-and-drop

HTML5 DnD is unreliable in WKWebView (Tauri's macOS webview). The
kanban uses `pointerdown` / `pointermove` / `pointerup` +
`setPointerCapture`, a 5-pixel movement threshold to distinguish click
from drag, `document.elementFromPoint` to find the target column, and
a floating ghost card at the cursor. See `FeedbackBoardView.svelte`.

### `MapNodeCard` (entity cards) is SVG, not HTML

xyflow zooms via `transform: scale()` on the viewport, which makes
HTML inside look pixelated on WKWebView at non-1.0 zoom. `MapNodeCard`
renders its body as inline SVG so it stays crisp at any zoom.
`MapTextNode` / `MapCustomNode` / `MapTitleNode` are HTML because they
need editable text — we accept some pixelation there.

### Today's list is never auto-created

`app.init()` does NOT call `listToday()` (Sprint 11). The only path to
creation is the sidebar's "Create today's list" button. Reason:
opening the app on a weekend shouldn't silently make an empty list.

### `MapNode.width` / `height` persistence

`map_nodes` has nullable `width` / `height` REAL columns. NULL ⇒ use
the renderer's default. After `NodeResizer.onResizeEnd`, the new
dimensions are persisted via `app.resizeMapNode(id, w, h)` and
re-read on every flowNode rebuild (Sprint 12).

### `markerEnd` on every edge

`toFlowEdge` in MapEditor sets `markerEnd: { type:
MarkerType.ArrowClosed, width: 18, height: 18 }`. Missing this hides
the direction arrows.

### Connections reject decorative kinds

In `onConnect`, edges are rejected if either endpoint is `text`,
`comment`, or `title`. `custom` IS connectable. The check lives in
`MapEditor.svelte`'s `onConnect`.

### IndexView → SummaryView

The old free-text index doc is preserved in the `index_doc` table but
not surfaced anywhere. `app.view = "index"` now renders
`SummaryView.svelte` (tabbed list of all entities with
pin/archive/delete actions).

### Garden default layout is `radial`

Force / radial / timeline; radial is best for "how much of each kind
do I have?" and is the entry default (Sprint 11).

## Database

### Migrations

Files in `src-tauri/migrations/0001_…sql` … `0016_…sql`, monotonically
numbered, applied at startup. To add one:

1. Create `00NN_<short_name>.sql`.
2. Use plain `ALTER TABLE` when possible.
3. **CHECK constraint changes require recreating the table** (SQLite
   limitation). Pattern: `PRAGMA defer_foreign_keys = ON;` →
   `CREATE TABLE foo_new (...)` → `INSERT INTO foo_new SELECT …` →
   `DROP TABLE foo` → `ALTER TABLE foo_new RENAME TO foo`. If any other
   table FKs to it, rebuild that one too in the same migration (we do
   this in 0006, 0008, 0010 for `map_nodes` / `map_edges`).

### Tables (high-level)

- `lists` + `todos` + `tags` + `todo_tags`: daily todo plumbing.
- `workflows` + `workflow_steps`: step chains with optional sublists.
- `notes` / `articles`: markdown bodies, day-attached (notes) or
  free-form (articles), with `{{kind:id}}` embed tokens parsed
  client-side in articles.
- `index_doc`: legacy single-row markdown summary, preserved for data
  safety but unused in UI.
- `map_nodes` + `map_edges`: the Alexandria canvas. `kind` is one of
  `note · article · workflow · feedback_board · text · comment · custom ·
  title`. The first four reference an existing entity via `entity_id`;
  the last four are decorative (entity_id = 0, content holds text). A
  partial unique index `(kind, entity_id) WHERE kind NOT IN (text,
  comment, custom, title)` enforces one-position-per-entity.
- `feedback_boards` + `feedback_columns` + `feedback_cards` +
  `feedback_card_comments`: kanban. Columns are **per-board, user-editable
  rows** (Sprint 19 — no longer a hardcoded CHECK); a new board seeds four
  defaults in `create_board`. Cards reference `column_id` and carry a
  nullable `color`. Boards have `pinned` (sidebar) + `archived`.
  `#tag`s in board/card titles render as badges (`$lib/badges.ts`).
- `flashcards` + `flashcard_categories`: the Flash Deck (Sprint 20). One global
  deck; a card has a markdown `body`, optional `image_url` (else generative art),
  `emoji` + `color` accents, optional `category_id` (ON DELETE SET NULL), and a
  manual `position`. Categories ("suits") carry a color + icon. Generative card
  art is a seeded flat-geometric SVG (`$lib/cardArt.ts`); `FlashCard.svelte` is
  the front, `FlashCardPanel`/`FlashStudyView` add a front↔back flip.
  `{{flashcard:id}}` embeds + `flashcard:id` links like other entities.
- Mermaid: there is **no diagram entity/table** (the Sprint 14 `diagrams`
  table was removed in Sprint 16 — migration `0011` created it, `0012`
  drops it). Mermaid now lives **only** as inline ```` ```mermaid ````
  fences in note/article markdown bodies: `$lib/markdownit.ts` emits a
  `.mermaid-block` placeholder and `hydrateMermaidBlocks` renders it to
  SVG via `$lib/mermaid.ts` (`renderMermaid`, dynamic-imports mermaid).
- All entity tables have `pinned` (sidebar visibility) and `archived`
  (Summary's archive tab) booleans.

### Tauri command conventions

- Backend function name = command name (snake_case).
- Register in `src-tauri/src/lib.rs` `tauri::generate_handler![]`.
- Frontend `invoke("snake_case_cmd", { camelCaseArgs })`; Tauri does
  the case conversion. **Don't** send snake_case from JS or args go
  missing.
- All models use `#[serde(rename_all = "camelCase")]` so JS sees
  `createdAt`, `entityId`, etc.

## Known quirks

- **xyflow zoom pixelation** on HTML node bodies in WKWebView is
  unavoidable for HTML content; we mitigate by using SVG inside
  `MapNodeCard` and capping `fitViewOptions.maxZoom = 1`. Text /
  custom / title nodes accept some softness on zoom.
- **`cargo test`** can fail with `failed to read plugin permissions:
  …bigpicture_app/…` referencing a stale build cache path. `cargo
  clean` inside `src-tauri/` fixes it. The bug is in the cached Tauri
  build script, not in our code.
- **Migrations 0006 / 0008 / 0010** recreate `map_nodes` (and
  `map_edges` to refresh the FK). If you alter `map_nodes`'s CHECK
  again, follow the same pattern.

## When developing

- **Plan first for non-trivial changes.** Write a SPRINT doc in
  `documentation/` before coding the feature. Existing sprints are the
  template — keep them honest about tradeoffs.
- **Test the round trip.** After any DB or IPC change: cargo check +
  svelte-check + manually load the affected view.
- **Don't try to fix xyflow zoom pixelation with CSS** — we've tried
  every CSS hint over multiple sprints (Sprint 9-11 history). The only
  fix is SVG content. Take the tradeoff.
- **Treat the sprint docs as the deep context source.** Each sprint
  records why a feature is shaped the way it is. Read the relevant
  ones before changing related code.

## Quick wins for a fresh Claude session

1. Read this file (you're doing it).
2. Skim `documentation/SPRINT*.md` in order; bias toward 9–12 for
   anything canvas / kanban / activity-related.
3. Open `src/lib/stores/app.svelte.ts` and `MapEditor.svelte`. These
   two files encode most of the architectural choices.
4. Run `pnpm tauri dev` once to confirm migrations apply cleanly on
   your machine.

Last updated: end of Sprint 20 (Flash Deck — a single global deck of flashcards
as a first-class entity. Migration `0016` (`flashcards` + `flashcard_categories`),
`commands/flashcards.rs` (cards + category CRUD, reorder, nullable-field setters),
full ipc/store wiring. New view `flashdeck` (⌘7, `TopNav` icon). UI: a responsive
deck grid with pointer-DnD reorder, generative geometric card art
(`$lib/cardArt.ts`, seeded SVG — chosen over a fluid "Refik Anadol" variant the
user rejected), `FlashCard` front + `FlashCardPanel` (front↔back flip + edit:
title/body via `MarkdownEditor`, category/color/emoji pickers, image upload) +
`FlashStudyView` (shuffle/flip/next-prev study mode). Categories are color/icon
"suits". Surfaced in AddEntityModal, a Summary "Cards" tab, sidebar pinned
section, and `{{flashcard:id}}` embeds / `flashcard:id` links. Canvas node
deferred. `#tag` badges work in card titles.)

Sprint 19 (Feedback boards leveled up + markdown polish +
sidebar collapse. Boards: per-board custom columns (`feedback_columns` table,
migration 0013; `create_board` seeds 4 defaults; rename/add/delete in
`FeedbackBoardView`), card color (`color` col + `$lib/cardColors.ts` picker in
`FeedbackCardPanel`), `#tag` badges in board/card titles (`$lib/badges.ts` +
`TagBadges.svelte`), quick-add (Enter adds & keeps the input open),
`user-select:none` while dragging, board `pinned` → sidebar + Summary "Boards"
tab + Alexandria canvas node (`feedback_board` map kind, migration 0014).
Markdown (`$lib/markdownit.ts` + global CSS in `app.css`): `{color|text}`,
`==highlight==`, `> [!NOTE|TIP|WARNING|COMMENT]` callouts, distinct table
headers, nested-list bullets, Tab inserts spaces (no blur), `lheading` disabled
(no stray heading from `----`), word counter, broken entity links flash instead
of erroring. Sidebar: collapse toggle (⌘\) for full-width reading. Lists: one
active list per day — `create` is idempotent per date + partial unique index
(migration 0015), fixing the stale/duplicate today's-list bug.

Sprint 18 (UI follow-ups — the top nav menu moved from a
floating overlay into a reserved 44px toolbar **row** at the top of the main
column (`+page.svelte`: main column = toolbar row + scroll area), so it no
longer overlaps a view's own top-right controls; full-bleed views switched
`h-screen`→`h-full` and padded views `min-h-screen`→`min-h-full` to fit the
reduced scroll area. Added a "Last updated <timestamp>" footer to note/article/
workflow views (`$lib/format.ts` `formatTimestamp`, `mt-auto` pins it to the
bottom). Added dark sidebar tints (ink/graphite/navy/forest/wine) — when a
`dark` tint is active the sidebar adds a local `dark` class so its content flips
to light text regardless of app theme (`theme.isSidebarDark`)).

Sprint 17 (UI polish — moved the six nav destinations out
of the sidebar into a floating top-right icon bar (`TopNav.svelte`) to free
sidebar space; added a back button + `app.navStack` history (⌘[); made the
sidebar footer stick to the bottom and the app shell fixed-height
(`h-screen overflow-hidden`, only the main column scrolls) so the footer no
longer drifts on long notes; clickable build-hash → commit message/date popover
(vite injects `__APP_COMMIT_MESSAGE__`/`__APP_COMMIT_DATE__`); customizable
sidebar tint via CSS vars `--sidebar-bg`/`--sidebar-border` set by the theme
store (`SIDEBAR_TINTS`, persisted, light/dark-aware); fixed mermaid leaving
orphan "Syntax error in text" nodes stacked at the page bottom — `renderMermaid`
now removes them in a finally).

Sprint 16 (Remove the Diagram entity — Sprint 15's inline
```` ```mermaid ```` fences made the standalone Sprint 14 entity redundant, so
it's gone: deleted `commands/diagrams.rs`, `DiagramView`/`DiagramEditor`, the
`Diagram`/`DiagramSummary` models + ipc types + store actions, the `diagram`
view, the Summary tab, the AddEntityModal option, sidebar pinned section, the
`{{diagram:id}}` embed + `diagram:id` link plumbing, and the EntityLinkPicker
option. DB: kept `0011_diagrams.sql`, added `0012_drop_diagrams.sql`
(`DROP TABLE`) — additive so existing DBs don't fail sqlx's applied-migration
checksum. No data migration (the DB had zero diagrams/embeds). Inline mermaid
fences stay; the editors' "Insert diagram" button now inserts a fence).

Sprint 15 (Inline ```mermaid fences — write a fenced `mermaid` block anywhere
you write markdown (notes, articles) and it renders inline, GitHub-style.
Client-only: a shared `$lib/markdownit.ts` factory adds a markdown-it `fence`
rule that emits a `.mermaid-block` placeholder, then `hydrateMermaidBlocks`
swaps in the SVG via a MutationObserver — `{@html}` re-renders on edit/commit
wipe manual injection, so a one-shot effect isn't enough. Source+theme cache +
last-good-render on syntax errors).

Sprint 14 (Diagrams — Mermaid diagrams-as-code as a first-class entity.
REMOVED in Sprint 16; see above. Was: `diagrams` table + `commands/diagrams.rs`,
`DiagramView`/`DiagramEditor`, PNG export, `{{diagram:id}}` embeds.)

Sprint 13 (Alexandria rename — identifier kept; planning calendar with
clickable future days; markdown editor polish — explicit Edit button,
auto-growing textarea via `$lib/autosize`, table insert, entity links).
