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
      BlueprintsView.svelte          # blueprints index (Sprint 22)
      BlueprintView / BlueprintEditor / BlueprintCardNode
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
      map.rs feedback.rs search.rs export.rs images.rs blueprints.rs mod.rs
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
garden · map · feedback · feedback-board · activity · flashdeck ·
blueprints · blueprint`.

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
| blueprints| Blueprints          | ⌘8 — no toolbar icon; reached via ⌘8, the palette, or Summary's tab |

`TopNav.svelte` also hosts the **back** button (`app.back()`, ⌘[) —
backed by `app.navStack`, a history stack each `select*`/`open*`/`goHome`
pushes to — plus the theme toggle and the sidebar-tint picker. The
sidebar is now search + pinned items + footer only.

The toolbar row also shows the **current section label** and a **"Search ⌘K"**
pill. **⌘K opens `CommandPalette.svelte`** — the global finder: searches every
entity (client-side over loaded store state) + lists all destinations (with
descriptions) + quick actions. It's the primary way to navigate/search; the
sidebar box is todos-only. `FormattingHelp.svelte` (the in-app markdown
reference) opens from the editors' "Aa" button, Help, and the palette. First-run
shows a dismissible "Start here" card on Home (Sprint 21).

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

Files in `src-tauri/migrations/0001_…sql` … `0020_…sql`, monotonically
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

- `lists` + `todos` + `tags` + `todo_tags`: daily todo plumbing. A single
  **backlog** (Sprint 29) is a sentinel list flagged `is_backlog = 1`
  (migration `0020`, additive column; `date = ''`, get-or-created lazily by
  `lists::backlog`) holding unscheduled tasks; it reuses all todo plumbing and
  is excluded from the daily surfaces (`list_all` / `stats` / `daily_stats` all
  filter `is_backlog = 0`). Tasks move between a daily list and the backlog via
  `move_todo(id, targetListId)` — "Send to backlog" / "Pull to today" per-row
  actions in `TodoRow`/`ListView`; the sidebar shows a pending-count entry.
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
- `blueprints` + `blueprint_nodes` + `blueprint_edges`: the Blueprints
  section (Sprint 22) — multiple standalone design canvases. Node `kind` is
  `card · text · comment · title · frame`; cards carry `title`/`description`
  (markdown)/`color` and a nullable `image_url` (Sprint 24 — a pasted image
  card, `add_image_card`), decoratives + `frame` use `content` (frame = its
  label). A `frame` (Sprint 24, migration `0019` recreated the table to widen
  the `kind` CHECK) is a labeled resizable rectangle rendered behind cards
  (zIndex 0 vs 1) to group a diagram — visual only, doesn't own its contents.
  No entity references, no partial unique index. Edges persist `source_handle`/`target_handle`
  (`t|r|b|l` — cards have four connection points, loose connection mode)
  plus a `label`. Canvas mutations touch the parent's `updated_at`.
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

Last updated: end of Sprint 38 (Lettering — a ```lettering fence renders a big,
centered, uppercase display-type banner (bundled Oswald) for announcements,
distinct from headings. `renderLettering` in `$lib/markdownit.ts` joins non-empty
lines with `<br>`; optional color/gradient from the shared vocabulary tints the
text — a gradient becomes gradient text via `.md-lettering-grad`
(`background-clip:text`). `.md-lettering` = Oswald 700, centered, uppercase,
`clamp(2rem,6vw,3.4rem)`. CSS-only/synchronous. Slash command "Lettering (big
title)" + FormattingHelp row + showcase. See documentation/SPRINT38.md. — earlier:
Sprint 37) Per-cell treemap colors — each ```treemap
`Label: value` line can now carry, after the value: a color/gradient name
(recolors that square, per-cell gradients get their own `<defs>`), `highlight`/
`accent` (AUTO distinct color from `TM_AUTO_ORDER`, cycling + skipping the base
color), and/or `animated`. `renderTreemap` resolves each cell's fill via
`namedSvgFill`, collects all defs into `defs[]`, and `TMData` gained a resolved
`fill?`. Explicit name > highlight > base color. Slash snippet + FormattingHelp +
showcase updated. See documentation/SPRINT37.md. — earlier:
Sprint 36) Unified color + gradient vocabulary — one shared
palette across every customizable markdown element. `$lib/markdownit.ts` defines
`NAMED_COLORS` (red/orange/amber/green/teal/blue/violet/pink/gray/black, 600-level)
+ `NAMED_GRADIENTS` (sunset/ocean/forest/dusk/candy, matches ```cards) once, with
resolvers `isNamedFill`, `namedBackground` (CSS bg for HTML: marquee/progress) and
`namedSvgFill` (→ `{fill,def}` for SVG: chart/treemap — gradients need a
`<linearGradient>` def since SVG `fill` can't take `linear-gradient()`; unique ids
via `svgGradSeq`). Now charts (bar/line accent) and treemap and progress ALL accept
the full solid+gradient set (charts gained black+gradients); donut keeps its own
auto categorical `CHART_PALETTE`. Progress fill switched to the `background`
shorthand so its barber-pole stripes moved to a `::after` overlay. Removed
`CHART_NAMED`/`MARQUEE_COLORS`/`MARQUEE_GRADIENTS`. FormattingHelp gains a shared
"Colors & gradients" section. See documentation/SPRINT36.md. — earlier:
Sprint 35) Treemaps in markdown — a ```treemap fence
renders a single-color squarified treemap (area ∝ value), inspired by the xray
LOC treemap but simplified to one flat color. `renderTreemap` in
`$lib/markdownit.ts` uses `d3-hierarchy` (new dep: `hierarchy`/`treemap`/
`treemapSquarify`) over a fixed 1000×600 viewBox (SVG scales responsively);
Oswald labels (the bundled face) auto-fit per cell + optional value sub-label.
One `Label: value` per line; fence info options `treemap [color] [animated]`
(color reuses `MARQUEE_COLORS`, default blue; `animated` pulses all cells), and a
per-line `- animated` suffix pulses just that cell (`.md-treemap-pulse` /
`@keyframes md-tm-pulse`, reduced-motion safe). White cell text. CSS-only/
synchronous like the other fences. Slash command "Treemap" + FormattingHelp row.
See documentation/SPRINT35.md. — earlier:
Sprint 34) Interactive progress counter — a ```progress
fraction bar `n/d` renders −/+ steppers that rewrite the numerator in the
markdown source and save, exactly like task checkboxes (`toggleTaskInSource`).
New exports `stepProgressInSource(src,index,delta)` (finds the Nth integer-frac
line inside a ```progress fence, clamps 0..d, preserves label/den/trailing
color) + `countProgressStepsInSource`. Steppers render only when the fence is
rendered with `env.progressInteractive` — set by `MarkdownEditor` (notes) and
`ArticleEditor` (articles); read-only surfaces (blueprint cards, flash cards)
show a static bar. Per-render stepper index lives on `env.progressSteps`
(document-ordered); `ArticleEditor` offsets per-segment via
`countProgressStepsInSource` like it does task indices. Percent/bare bars stay
static. See documentation/SPRINT34.md. — earlier:
Sprint 33) Progress bars in markdown — a ```progress fence
renders one labeled bar per `Label: value` line; value as `4/10` (→ its %),
`60%`, or a bare `0–100`, with an optional trailing color word (reuses
`MARQUEE_COLORS`, default blue). CSS-only/synchronous like the other custom
fences: `renderProgress` in `$lib/markdownit.ts` emits a label+readout header and
a track/fill bar (fill width+color inline; track uses `color-mix(currentColor
12%)` so it's theme-safe). Chosen as the simple authored option over
auto-from-checkboxes / a stored per-note % field. Slash command "Progress bars" +
FormattingHelp row. See documentation/SPRINT33.md. — earlier:
Sprint 32) Marquee banner — a ```marquee fence renders a
right→left scrolling colored bar for flagging important notes or as a bold
divider. CSS-only (no hydration): `renderMarquee` in `$lib/markdownit.ts` emits
the text twice in a `.md-marquee-track` that animates `translateX(0→-50%)`
infinitely for a seamless loop; options (`marquee <color> <speed>`) ride in the
fence INFO STRING — not `key:value` lines — so the banner text can contain
colons. Background = solid `MARQUEE_COLORS` (600-level, white text) OR a
`MARQUEE_GRADIENTS` preset (sunset/ocean/forest/dusk/candy, shared with ```cards),
inline `style` to dodge Tailwind purge; default blue; speeds slow/normal/fast
(26/16/9s). `app.css` `.md-marquee*` has hover-pause + a reduced-motion fallback
(single centered static label). Options are documented in-app in FormattingHelp's
"Marquee banner" section; slash command "Marquee banner". See
documentation/SPRINT32.md. — earlier:
Sprint 31) Sidebar app-brand mark — retired the stale
Lists/Todos/Streak counters from the sidebar footer (the app outgrew daily-todo
metrics; `getStats` still powers Home) and replaced them with an editable
**app-brand label**: Oswald, uppercase, `0.14em` tracking, default "Alert Media
Engineering Toolbox". A hover pencil does inline edit (Enter/blur save, Esc
cancel, blank resets). Lives in the theme store (`brandLabel` / `setBrandLabel`
/ `DEFAULT_BRAND`, persisted to `localStorage` `brandLabel`), so it sits next to
`sidebarTint`; the label inherits the footer color so it adapts to every tint +
dark mode. Oswald is **bundled offline** (no CDN in the Tauri webview):
`static/fonts/oswald-{latin,latin-ext}.woff2` (variable woff2 subsets, one file
per subset covers all weights) + two `@font-face` blocks at the top of
`app.css`; `adapter-static` copies them to `build/fonts/`. Shortcuts + build
popover unchanged. See documentation/SPRINT31.md. — earlier:
Sprint 30) Charts in markdown — a ```chart fence renders an
inline bar / donut / line chart, rendered as SVG synchronously in
`$lib/markdownit.ts`'s fence rule (like ```cards, unlike async ```mermaid — so
it works in blueprint cards too, no dependency, CSP-safe). DSL mirrors ```cards:
`type: bar|donut|line` + `title:` + `color:` config lines, then `Label: number`
data lines (order preserved; negatives/non-numbers dropped). `renderChart` →
`renderBarChart`/`renderDonutChart`/`renderLineChart`. Series colors are a fixed
mid-tone palette baked into the SVG; structural ink (axis text, gridlines, donut
center total) uses `currentColor` so it follows the theme. Styles under
`.md-chart` in `app.css`. Slash menu gains "Bar chart"/"Donut chart"; a "Charts"
section added to `FormattingHelp`. See documentation/SPRINT30.md. — earlier:
Sprint 29) Backlog — a single durable list for unscheduled
tasks, separate from the day-to-day carry-over flow. Stored as a sentinel list
`is_backlog = 1` (migration `0020`, additive `ALTER`; `date = ''`, get-or-created
by `lists::backlog`) so it reuses all todo plumbing; excluded from the daily
surfaces (`list_all`/`stats`/`daily_stats` filter `is_backlog = 0`). New
`move_todo(id, targetListId)` re-parents a todo (append to target order),
powering manual "Send to backlog" (daily → backlog) and "Pull to today" (backlog
→ today's list, created if needed — explicit action, cf. Sprint 11) per-row
actions in `TodoRow`. Sidebar gets a "Backlog" entry with a pending-count badge
(`backlogPending`); `ListView` branches on `app.selected.isBacklog` (title
"Backlog", no date/pin/delete/export chrome); command palette adds "Backlog".
No auto-sweep, one global backlog, not pinnable/archivable. See
documentation/SPRINT29.md. — earlier: Sprint 28) Focus mode — a full-screen aurora "screensaver"
overlay showing today's list for distraction-free task focus. Entered via a
sparkles icon in `TopNav` or the command palette's "Enter Focus mode"; exited
with the ✕ or Esc. `FocusMode.svelte` renders the Sprint 23 aurora backdrop
(colors from `theme.sidebarAurora`, else a default palette), a live clock +
long date, and today's todos as big checkable rows (completed dim + strike);
empty state offers "Create today's list". It's an overlay driven by
`app.focusMode`, NOT a `view` — so it never disturbs the nav stack or the open
entity. Focus keeps its own todo state (`focusTodos`/`focusListId`/
`focusListTitle` + `enterFocus`/`exitFocus`/`toggleFocusTodo`/`createFocusToday`
in the store) loaded via `listTodos`; toggling syncs `this.todos` only when the
same list is open behind it, then `refreshLists()`. Today's-list only, no
auto-create (Sprint 11), no new global shortcut (webview reserves too many). See
documentation/SPRINT28.md. — earlier: Sprint 27) Blueprint diagram importer — an "Import" button
on the blueprint canvas opens a textarea for a mermaid-like DSL: `Name: desc`
lines become cards, `A -> B` lines become edges (undefined names auto-create).
`parseImport` + `layoutImport` (longest-path/Kahn's top-down layering) +
`doImport` in `BlueprintEditor.svelte` create real connected cards via the
existing store actions (no backend change); placed right of existing content,
bottom→top edge handles, viewport pans to the result. See
documentation/SPRINT27.md. — earlier: Sprint 26) Slash command menu — type `/` at line-start or
after a space in the note/article editors to open a Notion-style command popup
AT THE CARET (Heading/list/checklist/quote/callout/code/table/diagram/cards/
divider/link/image); filter by typing, ↑↓/Enter/Tab/Esc. `SlashMenu.svelte`
(shared) attaches capture-phase key handlers to the textarea and positions via
a mirror-div caret measurement; snippet commands replace the `/query`, Link/
Image call the editors' pickers. Editor toolbars slimmed to icon-only +
tooltips. See documentation/SPRINT26.md. Also (Sprint 25) added card `filled:
true` (bold darker fill) + `color: black`, and fixed the card hover picking up
the link-chip purple. — earlier: Sprint 25) Link cards — a ```cards markdown fence renders
a responsive grid of clickable tiles (title/desc/link/color/icon per card,
separated by `---`) for building dashboard notes/articles. `renderCards` in
`$lib/markdownit.ts` emits the grid HTML directly; card `<a>` links reuse the
editors' existing `onPreviewClick` anchor handling (entity nav + external open);
styled in `app.css` under `.md-cards` (solid hue tints via a `--h` var +
gradient presets sunset/ocean/forest/dusk/candy). "Insert cards" button in both
editors. See documentation/SPRINT25.md. Also markdown polish: bigger h1, rounded
tables + tinted header + row hover, better code blocks, aligned task checkboxes;
wider note/article columns (max-w-4xl); task detail is now a modal reusing the
notes MarkdownEditor. — earlier in this session, Sprint 24:) Blueprints as a presentation & documentation
surface — all four items scoped to the Blueprints section. **Presenter view**:
a toolbar toggle (Esc to exit) that hides authoring chrome, swaps the backdrop
to a theme-aware stage gradient, and spotlights whatever node the cursor is
over (all others dim) — pure CSS via `.bp-presenting` + `:has(...:hover)`, no
node rebuilds, `drop-shadow` not `transform:scale()` because xyflow owns the
node's inline translate. **Icon-only toolbar**: every cluster button is now an
icon with its name in a `title` tooltip. **Copy PNG to clipboard**:
`composeCropPng` returns the Blob; the crop bar offers Save PNG + Copy
(`navigator.clipboard.write`). **Paste images** (Approach A — image on a card,
not a new node kind): migration `0018` adds nullable `blueprint_nodes.image_url`
(additive ALTER, no CHECK rebuild); `add_image_card`/`add_blueprint_image_card`;
`BlueprintCardNode` renders the image with an optional caption; a window-level
`onpaste` in `BlueprintEditor` saves clipboard images via `save_image` and drops
a card at the cursor. IMPORTANT export subtlety: asset-protocol images can taint
html-to-image's capture — `inlineImagesForCapture` swaps each `<img>` src for a
`data:` URI during capture and restores after. Two things need a live test:
image clipboard copy, and PNG export/copy of a blueprint containing a pasted
image. Plus a UX pass: Home counters are now Articles/Notes/Blueprints (Lists &
Tasks dropped — they live in the calendar) with quick-nav cards to Summary &
Visualization; the **sidebar shows pinned Blueprints**; **Summary** swapped its 8
overflowing tabs for a left section rail + an "All" union view, collapsing the
seven duplicated row blocks into one normalized `Row` + `{#snippet entityRow}`;
and more sidebar background tints. See documentation/SPRINT24.md.)

Sprint 23 (Markdown upgrades. **Task checkboxes**:
`- [ ] / - [x]` render as clickable checkboxes that persist by flipping the
marker in the source (`addTaskLists` + `toggleTaskInSource` in
`$lib/markdownit.ts` — renderer index and source-scan index must stay in
sync; ArticleEditor offsets per-segment indices via `countTasksInSource` +
`data-seg` wrappers); done tasks strike through. **Syntax highlighting**:
highlight.js core with hand-registered languages (Elixir first), GitHub-ish
`.hljs-*` palette in `app.css`; also fixed the per-line background strips on
fenced code — the inline-code pill CSS now scopes to `:not(pre) > code` in
MarkdownEditor/ArticleEditor/EmbedBlock. **Note outline**: MarkdownEditor's
`outline` prop (passed by NoteView) shows a floating right-side h1–h3
navigator on xl screens. **Link chips**: rendered markdown links display as
button-like chips in all markdown surfaces. **Aurora sidebar tints**: three
animated gradient surfaces (aurora/nebula/ember) — `Tint.aurora` colors +
`Tint.base`, blurred drifting blobs + feTurbulence noise rendered by
Sidebar.svelte behind an `isolate`/`z-index:-1` layer; reduced-motion safe.
See documentation/SPRINT23.md.)

Sprint 22 (Blueprints — a new ⌘8 section of standalone
design canvases for planning software. Migration `0017` (`blueprints` +
`blueprint_nodes` + `blueprint_edges`), `commands/blueprints.rs`, full
ipc/store wiring, views `blueprints` (index modeled on the feedback boards
list) + `blueprint` (editor). `BlueprintEditor.svelte` copies MapEditor's
architecture (single $effect syncing nodes+edges together, identity caches,
$state.raw) — same subtleties apply. `BlueprintCardNode.svelte` is an HTML
card (title-dominant, markdown description via the shared markdownit factory
— mermaid fences deliberately not hydrated inside cards, color from
`$lib/cardColors.ts`, NodeResizer, four handles `t|r|b|l` with
ConnectionMode.Loose; edges persist their handle ids). The Map* decorative
nodes (text/comment/title) are shared: they now accept optional
`onCommitContent`/`onResizeEnd` callbacks in node `data`, defaulting to the
map store actions. Edge labels are editable here (click an edge → floating
input). PNG export: "Export PNG" enters a crop-rectangle mode (pre-fit to
`getNodesBounds`, pointer-drag move/resize), rasterizes the region with
`html-to-image` (new dep) via `getViewportForBounds` at 2× on a flat
theme-aware background, saves through the native dialog +
`save_binary_file`. Follow-ups in the same sprint: no TopNav icon (list
lives in a Summary "Blueprints" tab, creation in AddEntityModal; ⌘8 + the
palette still open the index view); edges are animated dashed lines; cards
auto-size to their text (no default node height — a persisted NodeResizer
height still wins) with centered titles; inline code in descriptions
(`` `like this` ``) renders as an accent-tinted badge pill (CSS-only,
`:not(pre) > code`); the exported PNG is composed on a canvas — flat
theme-aware background + phase-aligned dot grid + 48px margin + rounded
hairline border ("card style") + the blueprint title in the bottom-left
corner. IMPORTANT export subtlety: xyflow edges are zero-sized
`overflow: visible` SVGs that WKWebView clips inside html-to-image's
foreignObject — so `BlueprintEditor` excludes `.svelte-flow__edges` from
the DOM capture and rebuilds the edge layer itself (`buildEdgeLayerSvg`
serializes the edge paths' `d` into one viewBox'd SVG with an arrow
marker, composited under the nodes). `blueprint:id` is a first-class entity
link (MarkdownEditor/ArticleEditor regex + navigate, EntityLinkPicker,
IdChip — shown in Summary, the blueprints index, and the editor's top-left
chip). TopNav renders Home + Summary as always-tinted icon "hub" buttons
ahead of a divider (PRIMARY array in `TopNav.svelte`). Deferred: sidebar
pinned section, an Alexandria `blueprint` map kind.)

Sprint 21 (UX hardening — no new features. Added a global
**command palette** (⌘K, `CommandPalette.svelte`) that searches every entity +
lists all destinations & quick actions (client-side, no backend); a visible
"Search ⌘K" pill + the current **section label** in the toolbar; sidebar search
relabeled "Search todos". Refreshed `HelpModal` (⌘K/⌘7/⌘[/⌘\ + Tab + per-section
descriptions) and added `FormattingHelp.svelte` (in-app markdown reference) via an
"Aa" button in the editors. A dismissible first-run "Start here" card on Home; a
Map/Alexandria empty-state hint. Esc now closes the feedback/flashcard panels.
Frontend-only; `svelte-check`/`build` clean.)

Sprint 20 (Flash Deck — a single global deck of flashcards
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
