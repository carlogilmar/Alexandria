# Sprint 14 — Diagrams (Mermaid, as a first-class entity)

> Diagrams-as-code come to Alexandria. Write Mermaid, see it render live,
> export a PNG to share, and weave diagrams into articles. A new entity
> that behaves like notes/articles — not a bolt-on.

## Why

You want to sketch ideas, share them as images, and keep that knowledge
in a durable, reproducible form. Two references were on the table —
tldraw (freeform drawing) and Mermaid (diagrams-as-code). For *this*
stack the choice is lopsided:

- **tldraw / Excalidraw are React libraries.** Embedding either means
  mounting a React root inside Svelte 5 and shipping React+ReactDOM —
  real, ongoing friction. tldraw also ships under a non-MIT license.
- **Mermaid is framework-agnostic vanilla JS** that returns an **SVG
  string**. It composes with the existing markdown-it pipeline, stores
  as **plain text** (searchable, diffable, reproducible), and renders
  crisp in WKWebView — the same "SVG stays sharp" lesson behind
  `MapNodeCard`. MIT licensed.

Mermaid hits all three goals — sketch / share / keep — for a fraction of
the effort. Freeform drawing is deferred (see "Deferred").

## Decisions (locked with the user before coding)

- **Mermaid, not freeform.** Diagrams-as-code this sprint. If the
  hand-drawn feel is missed later, build a lightweight Svelte surface on
  `perfect-freehand` (NOT React tldraw) as its own sprint.
- **First-class `Diagram` entity**, modeled on notes/articles: own table,
  editor, Summary tab, pinning, embeds, links. Not inline-only fences.
  Concretely, a diagram is **a full entity exactly like a note, article,
  list, or workflow** — you can create **as many as you want**, and each
  one can be **shown, edited, pinned, archived, and deleted** through the
  same surfaces those entities use ("+ Add", Summary tabs, the sidebar
  pinned section). Nothing about diagrams is capped or special-cased.
- **Canvas integration is DEFERRED.** No diagram node on the Alexandria
  canvas this sprint. Consequence: **`map_nodes` is not touched** — no
  CHECK-constraint table-recreate migration, no risk to the canvas.
- **Export is PNG only.** SVG → `<canvas>` → `toBlob` → Tauri save
  dialog. SVG export can come later if wanted.

## Thread A — Data + backend

- **Migration `0011_diagrams.sql`** — plain `CREATE TABLE`, no CHECK
  gymnastics:
  ```sql
  CREATE TABLE diagrams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL DEFAULT 'Untitled diagram',
    source     TEXT    NOT NULL DEFAULT '',
    pinned     INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  ```
- **`db/models.rs`** — `Diagram` (full) + `DiagramSummary` (id, title,
  pinned, archived, updatedAt), both `#[serde(rename_all = "camelCase")]`,
  mirroring `Article` / `ArticleSummary`.
- **`commands/diagrams.rs`** — `create`, `list` (non-archived summaries),
  `get`, `update_source`, `rename`, `set_pinned`, `set_archived`,
  `delete`. Register all in `lib.rs`'s `generate_handler!`.
- No backend work for export — it's client-side.

## Thread B — Frontend entity wiring

Mirror the article surface end-to-end:

- **`ipc.ts`** — `Diagram` / `DiagramSummary` types + invoke wrappers.
- **`stores/app.svelte.ts`** — `diagrams` state, `selectedDiagram`,
  and actions: `newDiagram`, `selectDiagram`, `updateSelectedDiagramSource`,
  `renameSelectedDiagram`, `toggleSelectedDiagramPin`,
  `deleteSelectedDiagram`. Extend `newEntity` kind union to include
  `"diagram"`. Refresh list on mutations (like `refreshArticles`).
- **View + routing** — add `"diagram"` to the view union and a
  `{:else if app.view === "diagram"}` branch in `routes/+page.svelte`.
  No new top-level sidebar ⌘ slot — diagrams are reached via "+ Add",
  Summary, pinning, and (later) the canvas, exactly like articles.
- **`AddEntityModal.svelte`** — add a "Diagram" option (hue + hint).
- **`SummaryView.svelte`** — add a Diagrams tab with the standard
  pin/archive/delete row actions.
- **Sidebar** — pinned diagrams render in the pinned section (reuse the
  generic pinned-entity rendering).

## Thread C — The editor

`DiagramView.svelte` (header: editable title, pin, delete — copy
`ArticleView`) wrapping `DiagramEditor.svelte`:

- **Split layout**: Mermaid source (mono textarea, reuse the `autosize`
  action) on the left, **live SVG preview** on the right.
- **Render**: `mermaid` is **dynamic-imported** on first use (it's a
  chunky dep — keep it out of the initial bundle). Debounce
  `await mermaid.render(uid, source)` on source change.
- **Errors**: Mermaid throws on bad syntax — catch, show the message in
  an error strip, and **keep the last good SVG** rendered so the canvas
  doesn't flash empty while typing.
- **Theme**: initialize Mermaid with `theme: 'dark' | 'default'` from
  `theme.resolved`; re-render on theme change. `securityLevel: 'strict'`.
- Commit source on blur via `app.updateSelectedDiagramSource` (same
  edit/commit rhythm as the markdown editors).

## Thread D — Export (PNG)

A "Export PNG" button on the diagram view:
1. Take the rendered `<svg>`, serialize with `XMLSerializer`.
2. Draw it into an offscreen `<canvas>` at a 2× scale for crispness
   (`new Image()` from a `data:image/svg+xml` URL → `drawImage`).
3. `canvas.toBlob('image/png')` → bytes.
4. Save via `tauri-plugin-dialog` save dialog (reuse the file-save
   pattern from `export.rs`/the markdown export flow) to a user-chosen
   path.

## Thread E — Embeds + links

- **`{{diagram:id}}`** — extend `EmbedBlock.svelte` (add `diagram` kind +
  `diagramById` fetch, render the SVG), the `ArticleEditor` segment
  `EmbedKind` union, and the `EMBED_LINE` regex.
- **`diagram:id` links** — add `diagram` to `EntityLinkPicker` and to the
  entity-link navigation in both markdown editors (`app.selectDiagram`).
- Update the article editor hint copy to mention diagrams.

## Round-trip checks

- `cargo check` + `cargo test --lib` (new diagrams commands).
- `npx svelte-check`.
- `pnpm tauri dev`: migration `0011` applies on existing DB without
  touching other tables; create a diagram, watch it render live; break
  the syntax and confirm the last good render persists + error shows;
  toggle dark mode and confirm the diagram re-themes; embed
  `{{diagram:id}}` in an article; export a PNG and open it.

## Deferred (explicitly out of scope)

- **Canvas node** — diagram as a resizable SVG node on the Alexandria
  canvas. This is the follow-up; it's where the `map_nodes` CHECK +
  table-recreate migration (0006/0008/0010 pattern) will live.
- **SVG export** (PNG only for now).
- **Freeform sketching** (`perfect-freehand`-based Svelte surface).
- **Inline ```mermaid fences** in arbitrary notes (diagrams are their own
  entity; articles reach them via `{{diagram:id}}`).
