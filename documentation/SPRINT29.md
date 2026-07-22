# Sprint 29 — Backlog (a durable holding pen for unscheduled tasks)

## Why

Daily lists are ephemeral: "what I'm doing today," carried forward day to
day. That carry-over is correct and stays untouched. But some tasks are
"should do, not scheduled for any particular day" — parking those in a
dated list makes them read as overdue clutter. The **backlog** is the
durable place for them, separate from the daily flow.

User framing: "daily lists should work as [carry-over] … but then maybe I
need a backlog where I can add pending tasks not related to any list."

## Model — the backlog is a single special list

`todos.list_id` is `NOT NULL` with a hard FK to `lists`, so "a task in no
list" isn't how we store it. Instead the backlog is **one sentinel list**
flagged `is_backlog = 1`:

- **Reuses all todo plumbing** — add / toggle / reorder / delete / tags /
  search all work unchanged. To everything downstream the backlog is
  "just a list."
- **One small additive migration** (`0020_backlog.sql`: `ALTER TABLE
  lists ADD COLUMN is_backlog INTEGER NOT NULL DEFAULT 0`) instead of
  making `list_id` nullable and touching every todo query.
- Lazily **get-or-created** like today's list (`lists::backlog`), with a
  sentinel `date = ''` and title `"Backlog"`. There is only ever one.
- **Excluded from the daily surfaces** so it never pollutes the calendar
  or streak: `list_all`, `stats`, and `daily_stats` all gained
  `AND l.is_backlog = 0`. (Search still finds backlog todos — that's
  useful.)

## Movement — manual, both ways

The one genuinely new operation is **moving a todo between lists**
(`todos::move_to_list` → `move_todo(id, targetListId)`): it re-parents the
todo and appends it to the end of the target's order.

- **Send to backlog** — a per-row action on any daily task.
- **Pull to today** — a per-row action on any backlog task; targets
  today's list, **creating it if needed** (this is an explicit user
  action, so unlike `init()` it's allowed to create today — cf. Sprint 11).

No auto-sweep, no automatic carry into the backlog — the user chose full
manual control.

## UI

- **Sidebar entry** "Backlog" (below the today's-list affordance) with a
  pending-count badge (`backlogPending`, refreshed in `refreshLists`).
  Opens the backlog in the normal `ListView`.
- `ListView` branches on `app.selected.isBacklog`: title "Backlog", no
  date line / pin / delete / export chrome, quick-add placeholder "Add to
  backlog". `TodoRow` gained an optional `onMove` action rendered per-row
  ("Send to backlog" on daily lists, "Pull to today" in the backlog).
- Command palette: "Open Backlog" quick action.

## Files

- `documentation/SPRINT29.md` — this doc.
- `src-tauri/migrations/0020_backlog.sql` — the additive column.
- `src-tauri/src/db/models.rs` — `List.is_backlog`.
- `src-tauri/src/commands/lists.rs` — `backlog` (get-or-create) +
  `backlog_pending` count; `all` excludes backlog; `list_backlog` /
  `list_backlog_pending` commands.
- `src-tauri/src/commands/todos.rs` — `move_to_list` + `move_todo` command.
- `src-tauri/src/commands/search.rs` — `stats` / `daily_stats` exclude
  backlog.
- `src-tauri/src/lib.rs` — register the three new commands.
- `src/lib/ipc.ts` — `List.isBacklog`; `listBacklog`,
  `listBacklogPending`, `moveTodo` wrappers.
- `src/lib/stores/app.svelte.ts` — `backlogId` / `backlogPending`,
  `ensureBacklog` / `openBacklog` / `sendTodoToBacklog` /
  `pullTodoToToday`; `refreshLists` loads the pending count.
- `src/lib/components/Sidebar.svelte` — the Backlog entry + badge.
- `src/lib/components/ListView.svelte` — backlog branch + per-row move.
- `src/lib/components/TodoRow.svelte` — optional `onMove` action.
- `src/lib/components/CommandPalette.svelte` — "Open Backlog" action.

## Not doing

- No auto-sweep of yesterday's leftovers (manual only, by choice).
- No multiple backlogs / per-project backlogs — one global backlog.
- Backlog is not pinnable/archivable/deletable (it's a fixture).
