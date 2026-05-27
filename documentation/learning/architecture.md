# Architecture overview

A plain-language walkthrough of how **Alexandria** is put together. The goal of this document is that a developer who has never touched Rust, Svelte or Tauri can read it once and know where to look for any piece of behavior in the codebase.

If you want to go deeper into either language afterwards:
- [rust.md](./rust.md) — Rust fundamentals + the Rust backend
- [svelte.md](./svelte.md) — Svelte 5 fundamentals + the frontend

---

## 1. What the app is

A native macOS desktop TODO app. The user opens the app, types things they need to do today, can revisit any previous day's list, search across history, build reusable workflows, and export anything to Markdown. Everything is stored locally in SQLite — there is no server, no account, no cloud sync.

It is shipped as a single `.app` bundle and lives in `/Applications` like any other Mac app.

## 2. The big picture (one diagram)

```
┌──────────────────────────────────────────────────────────┐
│  Alexandria.app                                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  WKWebView (the macOS system web view)             │  │
│  │                                                    │  │
│  │   Svelte 5 UI (TypeScript)                         │  │
│  │   • Sidebar, ListView, Inspector, WorkflowView…    │  │
│  │   • Reactive state in `app.svelte.ts`              │  │
│  │   • Calls `invoke("create_todo", …)` etc.          │  │
│  └────────────────────┬───────────────────────────────┘  │
│                       │  IPC (JSON over Tauri bridge)    │
│  ┌────────────────────▼───────────────────────────────┐  │
│  │  Rust core                                         │  │
│  │  • #[tauri::command] handlers                      │  │
│  │  • Business logic                                  │  │
│  │  • sqlx (async) ───────► SQLite file               │  │
│  │  • Markdown export                                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
        ~/Library/Application Support/com.alertmedia.bigpicture/todos.db
```

Two halves, one process, one bridge between them.

## 3. The two halves

### 3.1 Frontend — `src/`

A **SvelteKit** project compiled by **Vite**. It renders the entire UI you see in the window. It does *not* know how to read or write the SQLite database directly. Whenever it needs data, it asks the Rust side over the Tauri bridge.

Key files:

| File | What it is |
|---|---|
| `src/routes/+page.svelte` | The single page of the app — three-pane layout (sidebar, main, inspector) and global keyboard shortcuts |
| `src/lib/components/` | One file per UI component (`Sidebar`, `ListView`, `TodoRow`, `Inspector`, `WorkflowView`, `Welcome`, `HelpModal`) |
| `src/lib/stores/app.svelte.ts` | **The single source of truth** for everything the UI shows. A class with reactive fields (`$state`) and async methods (`addTodo`, `select`, `runSearch`, …) |
| `src/lib/ipc.ts` | Typed wrappers around `invoke("…")`. The only file that talks to Rust |
| `src/app.css` | Tailwind v4 + a handful of theme tokens |

Styling is **Tailwind CSS v4** (utility classes inline in the markup) plus a small amount of macOS-flavored tweaks (vibrancy, translucent sidebar, system font).

### 3.2 Backend — `src-tauri/`

A **Rust** library plus a thin `main.rs` binary. It owns the SQLite database, runs business logic, and exposes a fixed list of commands to the frontend.

Key files:

| File | What it is |
|---|---|
| `src-tauri/src/main.rs` | Two lines. Calls into `lib.rs::run()` |
| `src-tauri/src/lib.rs` | **The wiring file.** Opens the database pool on startup, registers every Tauri command, launches the window |
| `src-tauri/src/commands/` | One module per resource: `lists.rs`, `todos.rs`, `tags.rs`, `search.rs`, `export.rs`, `workflows.rs` |
| `src-tauri/src/db/mod.rs` | Opens the connection pool, runs migrations |
| `src-tauri/src/db/models.rs` | The Rust structs that mirror the SQLite tables (`List`, `Todo`, `Tag`, `Workflow`, …) |
| `src-tauri/src/error.rs` | `AppError` — a unified error type that can be serialized back to the frontend |
| `src-tauri/src/markdown.rs` | Renders a list (or a date range of lists) to Markdown |
| `src-tauri/migrations/` | `0001_initial.sql`, `0002_workflows.sql`. Versioned schema changes |
| `src-tauri/tauri.conf.json` | Window size, vibrancy effect, bundle identifier |

The Rust side is **async**: it uses Tokio under the hood and `sqlx` for non-blocking database access. From the frontend's perspective every command returns a `Promise`.

## 4. How a single user action travels through the system

Walk through the path of "the user types a new TODO and presses Enter":

1. The user types in the input at the top of `ListView.svelte`. On Enter, the component calls `app.addTodo(text)` on the store.
2. `app.addTodo` (in `app.svelte.ts`) calls `createTodo(this.selected.id, text)` — a typed wrapper in `ipc.ts`.
3. `createTodo` calls `invoke("create_todo", { listId, text })`. Tauri serializes the arguments as JSON and crosses the bridge into Rust.
4. Rust's command registry (set up in `lib.rs`) dispatches to `commands::todos::create_todo`.
5. That handler calls the pure `todos::create(pool, list_id, text)` function which runs the `INSERT … RETURNING *` SQL.
6. SQLite writes a row. The new `Todo` struct is serialized back to JSON.
7. The `Promise` in TypeScript resolves with the new todo. `app.addTodo` appends it to `this.todos`.
8. Because `this.todos` is reactive (`$state`), Svelte re-renders the list. The new todo appears.

That round trip is the whole pattern — every feature in the app is a variation of it.

## 5. Where state lives

There are **three** places state can live, and it's important to know which is which:

1. **SQLite** (`todos.db`) — the only durable store. Nothing else survives an app restart.
2. **Rust** — holds nothing in memory except the connection pool. Each command reads from / writes to SQLite and returns the result. No caches, no in-memory mirror.
3. **Svelte (`AppStore`)** — holds the *currently-displayed* slice of the database in memory: the visible lists, the currently-selected list's todos, search results, stats. It gets refreshed by re-asking Rust whenever something mutates.

This is deliberate: SQLite is fast enough that we never need to cache. After every mutation, the store calls `refreshLists()` (or similar) to re-read from Rust, which keeps the UI honest.

## 6. The data model

Five tables, defined in `src-tauri/migrations/`. From `0001_initial.sql` and `0002_workflows.sql`:

```
lists           one row per TODO list (anchored to a date)
todos           one row per todo, FK → lists (ON DELETE CASCADE)
tags            tag dictionary (unique names)
todo_tags       join table todos ↔ tags
workflows       reusable templates (no date)
workflow_steps  steps inside a workflow, FK → workflows
```

`Todo` and `WorkflowStep` both have a `position` integer used for drag-to-reorder. The Rust `reorder_todos` / `reorder_workflow_steps` commands receive an array of IDs in the desired order and rewrite the `position` column inside a transaction.

The Rust structs that mirror these tables are in `src-tauri/src/db/models.rs`. They use `#[derive(Serialize, Deserialize, FromRow)]` so the same type can be (a) read from a `SELECT` and (b) serialized to JSON for the frontend. The `#[serde(rename_all = "camelCase")]` attribute converts `snake_case` Rust fields to `camelCase` JSON so the TypeScript side looks idiomatic.

## 7. The IPC bridge in detail

Tauri's bridge is the only seam between the two halves. Two rules govern it:

**Rule 1 — every command must be registered.** In `src-tauri/src/lib.rs` you'll find:

```rust
.invoke_handler(tauri::generate_handler![
    commands::lists::list_today,
    commands::lists::list_by_id,
    commands::todos::create_todo,
    // …
])
```

If a function isn't in that array, the frontend cannot call it, even if it is marked `#[tauri::command]`. Forgetting to register a new command is the #1 source of "command X not found" errors.

**Rule 2 — every argument and return value must be `Serialize` / `Deserialize`.** Tauri turns the function signature into a JSON contract. Anything passed in or returned must be JSON-friendly. That's why our `AppError` has a manual `Serialize` impl — so errors round-trip as plain strings instead of opaque enum variants.

The TypeScript side never imports anything from Rust directly. Instead, `src/lib/ipc.ts` redeclares the types (`type Todo = { … }`) and the wrappers (`createTodo = (…) => invoke<Todo>("create_todo", …)`). Keeping those two files in sync is something humans have to do — if you add a field on the Rust `Todo`, add it to the TS `Todo` too.

## 8. Migrations and the database file

`sqlx::migrate!("./migrations")` runs at startup. It reads every `*.sql` file in `src-tauri/migrations/` in name order, tracks which ones have been applied in an internal `_sqlx_migrations` table, and only runs the new ones.

**Adding a schema change:** drop a new file in `src-tauri/migrations/` with the next number prefix (`0003_…sql`). Don't edit existing migration files — sqlx remembers the hashes, and changing an applied migration causes a startup error.

The database file lives at `~/Library/Application Support/com.alertmedia.bigpicture/todos.db`. That path comes from the bundle identifier in `tauri.conf.json` and is resolved at runtime by `dirs::data_dir()` in `src-tauri/src/db/mod.rs`.

## 9. Build & run

| Action | Command |
|---|---|
| Install JS deps | `pnpm install` |
| Run dev (HMR frontend + recompile backend on save) | `pnpm tauri dev` |
| Build a release `.app` | `pnpm tauri build --bundles app` |
| Run Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Type-check the frontend | `pnpm check` |

`pnpm tauri dev` starts Vite at `localhost:1420` and launches a Tauri window pointing at it. The window is real (it's a `.app`); only the HTML/CSS/JS is served from Vite for HMR. Saving a `.rs` file triggers a Rust recompile and reload.

## 10. How to add a new feature (recipe)

Say you want to add "favorites" — a way to star a todo so it shows at the top of the list.

1. **Migration.** Create `src-tauri/migrations/0003_favorites.sql` adding a `starred INTEGER NOT NULL DEFAULT 0` column to `todos`.
2. **Model.** Add `pub starred: bool` to `Todo` in `src-tauri/src/db/models.rs`.
3. **Command.** Add `pub async fn toggle_star(…)` in `src-tauri/src/commands/todos.rs`, both the pure function and the `#[tauri::command]` wrapper.
4. **Register.** Add `commands::todos::toggle_star,` to the `invoke_handler!` array in `src-tauri/src/lib.rs`.
5. **TS types.** Mirror the `starred` field on the TS `Todo` in `src/lib/ipc.ts`. Add a `toggleStar` wrapper around `invoke("toggle_star", { id })`.
6. **Store.** Add an `async toggleStar(todo)` method on `AppStore`. Call `toggleStar(todo.id)` and patch `this.todos` with the result.
7. **UI.** Wire a star button in `TodoRow.svelte` to `app.toggleStar(todo)`. Sort `this.todos` by `(starred desc, position asc)` wherever the list is rendered.
8. **Test.** Add a `#[tokio::test]` to `commands/todos.rs` using `test_pool()` (an in-memory SQLite). Run `cargo test`.

Every feature in the app was added that way. If you can follow these eight steps, you can extend any part of the app.

## 11. Testing strategy

- **Rust unit tests** live next to the code (`#[cfg(test)] mod tests { … }`) and use an in-memory SQLite pool from `db::test_pool()`. They run in milliseconds and cover all CRUD, cascade deletes, search, markdown rendering, and streak math.
- **Frontend** has no automated tests yet beyond `svelte-check` (type checking via `pnpm check`).
- **Manual smoke tests** are described in the README and the per-sprint docs in `documentation/`.

## 12. Where to look first when…

- …a button does nothing → check the component (`src/lib/components/*.svelte`), then the method on `AppStore`, then the IPC wrapper in `ipc.ts`, then the Rust command.
- …a value looks stale → check whether the store calls `refreshLists()` / `refreshWorkflows()` after the mutation. Forgetting to refresh is the most common UI bug.
- …data isn't persisting → check the migration ran (look in `_sqlx_migrations` in the db file), then check the SQL in the command.
- …the app won't compile after pulling → run `pnpm install` (new JS deps) and let Cargo refetch (new Rust deps). If Tauri itself was upgraded, also check `tauri.conf.json` for new schema fields.
- …the database is broken locally → quit the app and `rm ~/Library/Application\ Support/com.alertmedia.bigpicture/todos.db`. The next launch creates a fresh one.
