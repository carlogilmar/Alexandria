# macOS TODO App — Requirements & Design

> Working name: AlertMediaBigPicture 
> Status: draft for review
> Last updated: 2026-05-10

---

## 1. Overview

A native macOS desktop application for managing daily TODO lists. The user writes the things they need to do each day, the app stores every list it has ever seen, the lists can be exported to Markdown on demand, and the whole thing looks and feels polished enough to actually want to use every morning.

Built in **Rust** (core logic + persistence) with a **Tauri 2** shell wrapping a web frontend for the UI. Distributed as a local `.app` bundle for personal use.

---

## 2. Goals & non-goals

### Goals
- One place to capture today's TODOs, fast (open app → start typing).
- Keep history of every past list — nothing is ever lost.
- Export any list (or a date range) to Markdown.
- Look and feel native on macOS: respects light/dark mode, system font, keyboard-driven, fast.
- Self-contained: works fully offline, no accounts, no cloud.

### Non-goals (for v1)
- Sync across devices / cloud backup.
- Sharing or collaboration.
- Recurring tasks, reminders, notifications, due dates with alerts.
- Mobile or iPad version.
- App Store distribution.

These can come later — explicitly out of scope for the first cut.

---

## 3. Functional requirements

### 3.1 Lists
- A **list** is a named collection of todos, anchored to a date (default: today).
- New day = new list, created automatically on first open of the day. The user can also create extra lists manually (e.g. "Weekend errands").
- Lists have: `id`, `title`, `date`, `created_at`, `updated_at`, optional `archived` flag.
- A user can rename a list, delete a list (soft delete → archived), or restore an archived list.

### 3.2 Todos
- A **todo** belongs to exactly one list.
- Fields: `id`, `list_id`, `text`, `completed` (bool), `position` (int, for ordering), `created_at`, `updated_at`, optional `notes` (multi-line markdown), optional `tags` (string array).
- Create, edit, complete/uncomplete, delete, reorder (drag or keyboard).
- Quick-add: a single input at the top of the current list — type + Enter creates a todo.
- Inline edit: click (or press Enter on a focused todo) to edit text without modal.

### 3.3 Navigation & history
- **Sidebar** lists all past lists, grouped by month, newest first. Today is pinned at the top.
- Clicking a date opens that list (read/write — past lists are still editable).
- Search across all todos in all lists (text match, optionally filtered by completed/open).

### 3.4 Markdown export
- Export the **current list** to Markdown (copy to clipboard or save as `.md`).
- Export a **range of lists** (e.g. "this week", "this month", "everything") as a single Markdown file with date headings.
- Format defined in §7.

### 3.5 Visualization
The "UI friendly" requirement, broken into concrete pieces:
- Clean three-pane layout: sidebar (lists) · main (current list) · optional inspector (todo notes/details).
- Smooth transitions when switching lists or completing todos (subtle fade, no jank).
- Progress indicator per list (e.g. "5/8 done", optional ring/bar).
- Empty states with friendly copy ("Nothing yet. What's the first thing?").
- Light & dark mode following macOS system setting automatically.
- A small "stats" view: number of lists, total todos, completion streak by day.

---

## 4. UX / UI notes

- Use **SF Pro** (system font) — no custom font.
- Native-feeling vibrancy / translucent sidebar (Tauri supports `transparent` + `vibrancy`).
- Rounded macOS-style controls; avoid generic web-looking buttons.
- Consider [shadcn-svelte](https://www.shadcn-svelte.com/) (if Svelte) or [shadcn/ui](https://ui.shadcn.com/) (if React) as a baseline component library, restyled to feel macOS-native.
- Animations via [motion-one](https://motion.dev/) or framework-native transitions — short (~150ms), purposeful, never decorative.

---

## 5. Data model

SQLite schema (managed by `sqlx` migrations):

```sql
CREATE TABLE lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  date        TEXT    NOT NULL,            -- ISO 8601 YYYY-MM-DD
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_lists_date ON lists(date);

CREATE TABLE todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  notes       TEXT,
  completed   INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_todos_list_id ON todos(list_id);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL UNIQUE
);

CREATE TABLE todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);
```

Database file lives at:
```
~/Library/Application Support/com.<you>.todo/todos.db
```

---

## 6. Technical architecture

### 6.1 Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2.x |
| Core / commands | Rust (edition 2021) |
| Database | SQLite via `sqlx` (compile-time checked queries) |
| Frontend | **Svelte 5 + Vite** *(recommended — small, fast, simple)*. Alternative: React + Vite if you'd rather stay on React. |
| Styling | Tailwind CSS + a small set of macOS-flavored custom components |
| State (frontend) | Svelte stores (or Zustand if we go React) |
| Markdown rendering (in-app preview) | `markdown-it` (frontend) |
| Markdown generation (export) | Rust side, hand-rolled or `pulldown-cmark` for safety |

### 6.2 Process model

```
┌──────────────────────────────┐
│         WKWebView            │
│  Svelte UI (TypeScript)      │
│  - renders lists/todos       │
│  - dispatches commands       │
└──────────┬───────────────────┘
           │ Tauri IPC (invoke)
┌──────────▼───────────────────┐
│       Rust core              │
│  - command handlers          │
│  - business logic            │
│  - sqlx (async) → SQLite     │
│  - markdown export           │
└──────────────────────────────┘
```

### 6.3 Tauri commands (initial surface)

```rust
// Lists
list_today() -> List
list_by_id(id) -> List
list_all(range: DateRange) -> Vec<ListSummary>
create_list(title, date) -> List
rename_list(id, title) -> List
archive_list(id) -> ()
restore_list(id) -> ()

// Todos
create_todo(list_id, text) -> Todo
update_todo(id, patch) -> Todo
toggle_todo(id) -> Todo
delete_todo(id) -> ()
reorder_todos(list_id, ordered_ids: Vec<i64>) -> ()

// Search
search(query, filter) -> Vec<TodoHit>

// Export
export_list_md(id) -> String
export_range_md(from, to) -> String
save_md_to_file(content, suggested_name) -> PathBuf
```

### 6.4 Project structure

```
todo/
├── .tool-versions
├── REQUIREMENTS.md
├── README.md
├── src-tauri/                  # Rust side
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── migrations/             # sqlx migrations
│   └── src/
│       ├── main.rs
│       ├── commands/
│       │   ├── lists.rs
│       │   ├── todos.rs
│       │   └── export.rs
│       ├── db/
│       │   ├── mod.rs
│       │   └── models.rs
│       └── markdown.rs
├── src/                        # Frontend (Svelte)
│   ├── app.html
│   ├── routes/
│   ├── lib/
│   │   ├── components/
│   │   ├── stores/
│   │   └── ipc.ts              # thin wrapper around invoke()
│   └── styles/
├── package.json
├── pnpm-lock.yaml
├── svelte.config.js
├── vite.config.ts
└── tailwind.config.ts
```

---

## 7. Markdown export format

**Single list:**

```markdown
# 2026-05-10 — Monday plan

> 5 of 8 done · created 09:12 · updated 18:44

- [x] Review Q2 OKRs
- [x] Reply to design review thread
- [ ] Draft proposal for caching layer
  Notes: focus on read-heavy paths first.
- [ ] Walk the dog
- [ ] Groceries
  Tags: #home

---
Exported by todo · 2026-05-10
```

**Range export** concatenates lists with `---` separators and a top-level table of contents:

```markdown
# Todos · 2026-05-04 → 2026-05-10

- [2026-05-10 — Monday plan](#2026-05-10--monday-plan)
- [2026-05-09 — Sunday](#2026-05-09--sunday)
- ...

---

# 2026-05-10 — Monday plan
...
```

---

## 8. Build & distribution

- `pnpm tauri dev` for the iteration loop.
- `pnpm tauri build` produces an unsigned `.app` in `src-tauri/target/release/bundle/macos/`.
- Drag to `/Applications` — done. macOS will warn on first open (right-click → Open to bypass Gatekeeper), which is fine for personal use.
- We are explicitly **not** notarizing or signing in v1.

---

## 9. Milestones

A rough phasing — happy to compress or reshuffle.

**M0 — Skeleton (½ day)**
- Tauri 2 scaffold, Svelte + Tailwind wired, app opens, shows "hello".

**M1 — Storage (1 day)**
- SQLite via sqlx, migrations, basic CRUD commands, no UI yet — verified via tests.

**M2 — Today view (1–2 days)**
- Quick-add, list of todos, toggle complete, inline edit, delete, reorder. Looks decent in light mode.

**M3 — Sidebar & history (1 day)**
- Sidebar lists past dates, switching between lists, new-day auto-creation.

**M4 — Polish pass (1 day)**
- Dark mode, animations, vibrancy, empty states, keyboard shortcuts.

**M5 — Markdown export (½ day)**
- Per-list and range export, copy + save-to-file.

**M6 — Search & stats (½ day)**
- Search across all todos, small stats view.

**M7 — Build & install (½ day)**
- `pnpm tauri build`, drag to Applications, smoke-test.

Total: ~5–6 focused days of work.

---

## 10. Open questions / things to decide together

These are the choices I'd want your call on before we start building:

1. **App name & bundle identifier.** Picks the `tauri.conf.json` identifier (`com.<you>.<app>`) and the SQLite directory name.
2. **Svelte vs React for the frontend.** I'd default to Svelte 5 for this — smaller, less boilerplate, faster to get a polished feel. React is fine if you'd rather stay on familiar ground.
3. **Tags in v1 or later?** They're in the schema, but the UI for them adds complexity. Could ship without and add in v1.1.
4. **Notes field on todos in v1 or later?** Same question.
5. **Streak / stats view in v1 or later?** Easy to defer.
6. **Markdown export — copy to clipboard, save-as dialog, or both?** I'd default to both, `⌘ E` for save-as and `⌘ ⇧ C` for copy.
7. **Database location — strict Application Support, or a user-configurable path?** Strict is simpler.
