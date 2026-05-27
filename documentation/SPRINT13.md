# Sprint 13 — Alexandria rename + planning calendar + markdown editor polish

> The app earns its real name, the activity calendar grows a future, and
> the markdown editor stops fighting the writer. Four threads, one sprint.

## Why

The canvas has become the heart of the product, and "Alexandria" is the
name that stuck. The product should carry it. Alongside the rename, three
papercuts in daily use:

1. The calendar only shows the past — but planning is a forward act. You
   want to drop a todo list onto *next* Tuesday before it arrives.
2. The markdown editor's edit affordance is implicit (click the text),
   the textarea stays cramped on long notes, and tables/entity-links are
   either hidden or undocumented.
3. Referring to another note today means a full `{{note:5}}` embed. You
   want a lightweight *link* — a sentence that points at a note without
   inlining the whole thing.

## Decisions (locked with the user before coding)

- **Keep the bundle identifier `com.alertmedia.bigpicture`.** It's what
  resolves the SQLite DB path (`db/mod.rs::BUNDLE_ID` +
  `tauri.conf.json.identifier`). Changing it would orphan existing data.
  The identifier is invisible in the UI, so the rename is purely
  cosmetic + crate-level. **No data migration, zero risk to existing
  notes/lists/canvas.**
- **The canvas keeps the label "Alexandria."** App and centerpiece share
  the name; the canvas *is* the app's identity. No sidebar/label change
  for ⌘2.
- **Entity links use markdown link syntax + a picker button.** Support
  `[label](note:5)` everywhere (notes too, not just articles), and add an
  "Insert link" button that opens an entity picker and writes the link.

## Thread A — Rename to Alexandria

Cosmetic + crate identity only. The identifier and DB path stay.

| File | Change |
|------|--------|
| `package.json` | `name: alertmediabigpicture` → `alexandria` |
| `src-tauri/Cargo.toml` | package `name`, `[lib] name` (`alexandria_lib`), `description` |
| `src-tauri/src/main.rs` | `alertmediabigpicture_lib::run()` → `alexandria_lib::run()` |
| `src-tauri/tauri.conf.json` | `productName` + window `title` → `Alexandria` (KEEP `identifier`) |
| `src/app.html` | `<title>` → `Alexandria` |
| `src/lib/components/Sidebar.svelte` | logo `alt` + wordmark text → `Alexandria` |
| `README.md`, `CLAUDE.md`, `documentation/learning/*` | name references → Alexandria (DB-path lines stay, identifier unchanged) |

**Left intentionally untouched:**
- `BUNDLE_ID = "com.alertmedia.bigpicture"` and the
  `~/Library/Application Support/com.alertmedia.bigpicture/todos.db` path.
- The internal drag MIME `application/x-bigpicture-map-item` (purely
  internal string-match between `AddToMapPalette` and `MapEditor`; not
  worth the churn).

**Note:** renaming the Cargo package recompiles the Rust crate from
scratch on the next `cargo`/`pnpm tauri dev`. Expected, one-time.

## Thread B — Calendar shows the future (planning)

`Welcome.svelte`, the contribution-style grid.

**Today:** 53-week window ending at the upcoming Sunday; future cells are
`bg-transparent` and `disabled` (unclickable).

**Change:**
- Extend the window `FUTURE_WEEKS = 4` weeks past the upcoming Sunday
  (≈ a month of planning runway). Keep 53 weeks of history, so
  `TOTAL_WEEKS = 57`. Parametrize the two hardcoded `repeat(53, 14px)`
  grid templates off the constant.
- The mount auto-scroll stays "all the way right," which now reveals the
  future weeks; today sits 4 columns from the edge — still in view.
- Two new cell states:
  - `future-empty` — a *light* fill (lighter than the past "empty" grey)
    so it reads as "not yet, but plannable." Clickable.
  - `future-planned` — a future day that already has a list/todos. Gets a
    distinct soft accent (indigo), **never** the rose/emerald completion
    colors — per your "shouldn't have a color yet." Clickable.
- `classifyForDate` reorders: compute `isFuture`, then read stats; future
  days with `total > 0` → `future-planned`, else `future-empty`.
- `pickCell` no longer early-returns on future; the cell `<button>` drops
  `disabled` for future states. Selecting a future day opens the existing
  day-detail panel, whose "+ New list" / "+ New note" already create for
  `selectedDate`. **No new IPC needed** — `app.newList(undefined, date)`
  already accepts an arbitrary date.
- Add a "planned" swatch to the legend.

**Check during impl:** confirm `app.dailyStats` includes future-dated
lists (the grouping is by list `date`, so it should — verify the query
doesn't filter `date <= today`).

## Thread C — Markdown editor polish (notes + articles)

Two near-duplicate editors today: `MarkdownEditor.svelte` (notes) and
`ArticleEditor.svelte` (articles). Rather than a big merge (out of scope),
apply the same four changes to both and share two small new pieces.

1. **Explicit Edit button.** In preview mode, a small always-visible
   "Edit" button (top-right of the preview box). Click-to-edit on the body
   stays as a bonus, but the button is the discoverable affordance.
   Click-outside-to-preview (blur → commit) already works — no change.

2. **Auto-growing textarea.** New shared `autosize` action
   (`src/lib/autosize.ts`): on mount + on input, `height = 'auto'` then
   `height = scrollHeight`. `minHeight` stays the floor. Drop the cramped
   fixed box; long notes expand naturally.

3. **Tables.** markdown-it already renders GFM tables. `MarkdownEditor`
   already styles them; `ArticleEditor` is missing the table CSS — add it.
   Add an "Insert table" toolbar button (next to "Insert image") that
   drops a GFM skeleton at the cursor, for discoverability.

4. **Entity links + picker.**
   - Navigation: `ArticleEditor` already routes `[x](note:5)` clicks via
     `app.selectNote/select/selectWorkflow/selectArticle`. Add the same
     href handling to `MarkdownEditor.onPreviewClick` (it currently only
     opens `http(s)`).
   - New shared `EntityLinkPicker.svelte`: an "Insert link" toolbar button
     opens a popover with a search box over `app.notes / lists / workflows
     / articles`; choosing one inserts `[title](kind:id)` at the cursor.
   - Update placeholder/hint copy to mention linking.
   - Scope: link kinds = note · list · workflow · article (todos are
     sub-items; skip for now).

Embeds (`{{note:5}}`, articles only) stay exactly as they are — links are
the lighter-weight complement, not a replacement.

## Round-trip checks

- `cargo check` (crate rename compiles), `npx svelte-check`.
- `pnpm tauri dev` once: migrations still apply, **existing data still
  loads** (identifier unchanged), window title reads "Alexandria."
- Manual: plan a list on a future calendar day; edit a long note and watch
  it grow; insert a table; insert an entity link from the picker and click
  it to navigate.

## Out of scope / deferred

- Merging the two markdown editors into one component.
- `[[ ]]` autocomplete (chose the simpler picker).
- Linking to individual todos.
- Any change to the bundle identifier or a data-dir migration.
