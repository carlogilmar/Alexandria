# Sprint 75 — The Hub

A new **Hub** destination: an editable, tabbed knowledge index that the user
curates — distinct from the activity-oriented Home (left untouched) and from the
auto-generated Library. Motivation (author's words): "I want a home-like page I
can edit with markdown, with special sections like tabs, to build a main index
and navigation and categorise my notes — development, trainings, sites,
learning…" Mocked up first; the design pivoted once during the sprint (see below).

## Final architecture — a structured entity, not a note

Hub tabs are their **own entity** (`hub_pages`), separate from notes — they never
appear in the Library, pins, or search.

- **Migration `0031_hub.sql`**: `hub_pages(id, title, body, position, created_at,
  updated_at)` — one row per tab, each a full markdown document; plus a single-row
  `hub_meta(title, subtitle)` for the hero (seeded with defaults).
- **Backend `commands/hub.rs`**: list / create / update (title+body patch) /
  delete / reorder for pages, and get / set for the meta. Models `HubPage`,
  `HubPagePatch`, `HubMeta`. +3 tests; registered in lib.rs.
- **Store** (`app.svelte.ts`): `view: "hub"`, `hubPages` / `hubMeta` /
  `hubActiveId`, `loadHub`, and `addHubPage` / `renameHubPage` /
  `saveHubPageBody` / `removeHubPage` / `reorderHubPages` / `saveHubMeta`.

## `HubView.svelte`

- **Hero** — an accent-gradient banner (reuses the `.md-hero` styles); the title
  and subtitle are **double-click-to-edit** inline (saved to `hub_meta`).
- **Tab bar** — pills from `hub_pages`: **click** opens, **double-click renames**
  inline (contentEditable — `window.prompt` is a no-op in the Tauri webview),
  **✕** on the active tab deletes it, **drag reorders** (pointer-based, persisted),
  **＋ Tab** creates a new page.
- **Active tab content** — a real `MarkdownEditor` (keyed per page, `floatingEdit`
  + **⌘E**, `noBlockEdit`) bound to that page's `body`. Because each tab is its own
  document, the **full markdown + every powered block works** (marquee, chart,
  mermaid, timeline, cards…).
- **Placement**: a prominent **"The Hub"** button in the sidebar directly under the
  Alexandria logo — centered like the Add button, with a complementary
  accent→violet gradient to signal importance; plus a command-palette entry. The
  Hub view also tints the **whole content column** gray (just for the Hub, via a
  conditional class in `+page.svelte`) so the hero + white tab cards pop — matching
  the mockup; this covers the top toolbar row too.
- New `noBlockEdit` prop on `MarkdownEditor` disables the per-block hover pencil
  (the Hub edits each page as one document).

## The pivot (why it's structured now)

v1 stored the Hub as a single markdown doc in the existing (unused) `index_doc`
table, with two NEW powered blocks — `` ```hero `` and `` ```tabs `` (`# Name` per
tab) — and in-place source edits for add/rename/remove (like task checkboxes).
Two problems killed the inline-content model: (1) **fence nesting** — putting any
`` ``` `` block (marquee, chart…) inside the `` ```tabs `` fence closes it early and
breaks the page; (2) `window.prompt`/`confirm` **don't work in the Tauri webview**,
so the add/rename affordances silently failed. The fix (author's call) was "one
note per tab", refined to **a unique entity per tab** — hence `hub_pages`. The
`` ```hero ``/`` ```tabs `` markdown blocks remain in `markdownit.ts` as
general-purpose blocks but the Hub no longer uses them; `index_doc` is untouched
(still legacy/unused).

## Files

`migrations/0031_hub.sql`, `commands/hub.rs` (+ mod/lib.rs reg), `db/models.rs`,
`ipc.ts`, `stores/app.svelte.ts`, `HubView.svelte` (new), `MarkdownEditor.svelte`
(`noBlockEdit`), `Sidebar.svelte` (Hub button), `+page.svelte` (dispatch + label +
Hub-only gray column), `CommandPalette`, `FormattingHelp` (hero/tabs rows).
102 cargo tests + svelte-check + build pass; the migration + DnD/inline-edit round
trip want a live `pnpm tauri dev` run. Deferred: inline "＋ add link" helper inside
a page, removing the now-unused `hero`/`tabs` markdown blocks.
