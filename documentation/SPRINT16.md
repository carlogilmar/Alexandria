# Sprint 16 — Remove the Diagram entity

> Sprint 14 made Mermaid a first-class entity. Sprint 15 added inline
> ```` ```mermaid ```` fences in any markdown body. With fences covering the
> "sketch a diagram here" need, the standalone entity is redundant
> surface area — two ways to do one thing. This sprint removes it.

## Why

The Diagram entity (its own table, view, editor, Summary tab, sidebar
section, `{{diagram:id}}` embeds, `diagram:id` links, PNG export) was the
right call when it shipped — it was the *only* way to render Mermaid. But
Sprint 15's inline fences render Mermaid wherever you write markdown, which
is where the diagrams actually want to live. Keeping both means two mental
models, two code paths, and a Summary tab / sidebar section for something
that's better expressed inline. The user asked to collapse it down to just
the inline fences.

**Data check before deleting:** the live DB had **0 diagrams, 0
`{{diagram:id}}` embeds, 0 `diagram:` links, and 0 `diagram` canvas nodes**.
So there was nothing to migrate or orphan — a clean removal. (If diagrams had
existed, the considerate path would have been to inline their `source` into
```` ```mermaid ```` fences in the bodies that embedded them before dropping
the table. Not needed here.)

## What stays

- **Inline ```mermaid fences** (Sprint 15) — the whole point of the cleanup.
- **`$lib/mermaid.ts`** (`renderMermaid`) and **`$lib/markdownit.ts`**
  (`createMarkdownIt` + `hydrateMermaidBlocks`) — the fence rendering path.
- The **"Insert diagram"** toolbar button in both editors — it inserts a
  ```` ```mermaid ```` fence skeleton (not an entity), so it keeps its name
  and behavior.

## The database — additive drop, don't delete 0011

The instinct is to delete `0011_diagrams.sql`. **Don't** — `sqlx::migrate!`
records a checksum of every applied migration and fails at startup if a
previously-applied file goes missing ("migration was previously applied but
is missing in the resolved migrations"). Existing DBs have 0011 applied.

So: **keep `0011_diagrams.sql` as-is, add `0012_drop_diagrams.sql`** with a
single `DROP TABLE IF EXISTS diagrams;`. On existing DBs, 0011 is skipped
(already applied) and 0012 drops the table. On a fresh DB, 0011 creates and
0012 immediately drops — harmless, and it keeps migration history honest and
monotonic. Verified: booting the app dropped the table with no checksum error.

## Removal checklist (what was deleted)

**Rust backend:**
- Deleted `src-tauri/src/commands/diagrams.rs` (all 8 commands + tests).
- `commands/mod.rs`: dropped `pub mod diagrams;`.
- `db/models.rs`: dropped `Diagram` + `DiagramSummary` structs.
- `lib.rs`: dropped the 8 `commands::diagrams::*` handler registrations.
- Added migration `0012_drop_diagrams.sql`.

**Frontend IPC + store:**
- `ipc.ts`: dropped `Diagram`/`DiagramSummary` types + 8 invoke wrappers.
- `stores/app.svelte.ts`: dropped the diagram imports, `diagrams` /
  `selectedDiagram` state, the `"diagram"` view-union member, the
  `init()`/`goHome()` `listDiagrams()` calls, the entire `// ---- Diagrams ----`
  action block, `setDiagramPinnedById` / `setDiagramArchived` /
  `deleteDiagramById`, and `"diagram"` from `newEntity`'s kind union.

**Views/routing:**
- Deleted `DiagramView.svelte` and `DiagramEditor.svelte`.
- `routes/+page.svelte`: dropped the import and the `diagram` view branch.

**UI surfaces:**
- `Sidebar.svelte`: dropped `isDiagramSelected`, `pinnedDiagrams`, and the
  pinned-diagrams section (and the empty-state condition term).
- `SummaryView.svelte`: dropped the Diagrams tab, `activeDiagrams`, the
  `ArchivedRow` diagram variant, count, the per-kind action branches, and the
  `KIND_HUE.diagram` entry.
- `AddEntityModal.svelte`: dropped the Diagram option + kind-union member.
- `EntityLinkPicker.svelte`: dropped the diagram link option + hue.
- `IdChip.svelte`: dropped `diagram` from its kind union.

**Embeds + links:**
- `EmbedBlock.svelte`: dropped the `diagram` kind end-to-end (import, state,
  load branch, link nav, render block, style) — and the now-unused
  `renderMermaid` / `theme` imports.
- `ArticleEditor.svelte` / `MarkdownEditor.svelte`: dropped `diagram` from the
  `EmbedKind` / `EMBED_LINE` regex and the entity-link nav regex + branch.
  **Kept** `insertDiagram` (inline fence inserter).
- `ArticleView.svelte`: updated the editor placeholder (drop `{{diagram:7}}`,
  mention the ```` ```mermaid ```` fence instead).
- `mermaid.ts`: updated the header comment (used by fences now, not the editor).

## Round-trip checks

- `npx svelte-check` — 0 errors (file count 626 → 624, the two deleted views).
- `cargo check` — clean.
- `pnpm tauri dev` — boots; migration `0012` drops the `diagrams` table on the
  existing DB with no sqlx checksum error; Summary has no Diagrams tab; sidebar
  has no Diagrams section; "+ Add" has no Diagram option; a ```` ```mermaid ````
  fence in a note/article still renders inline.

## Notes for future sessions

- The Sprint 14 doc still describes the entity as it shipped — that's a
  historical record; this doc is the correction. The "canvas node for diagrams"
  follow-up that Sprint 14 deferred is moot: there's no diagram entity to put on
  the canvas. If a canvas mermaid node is ever wanted, it'd be a decorative
  node holding fence source, not an entity reference.
