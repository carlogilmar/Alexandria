# Sprint 74 — The Week Planner

A new **Planner** view for planning tasks across the work week, not just today.
Motivation (the author's words): "I create my daily todo list, but sometimes I
need to add tasks for other days — I dump them in the backlog. I'd like to see
the current week, the lists created, and add tasks to any day for planning."
Mocked up first (vertical layout chosen over a horizontal board, so long task
text reads in full). Mostly frontend; one read-only backend command, no migration.

## Backend (`commands/search.rs`)

- **`get_week(from, to)`** → `WeekData { lists, todos, tags }`: the non-archived
  weekday lists whose `date` ∈ [from,to] **plus the backlog**, with all their
  todos and tag links (grouped client-side by `list_id`). New models
  `WeekData` / `WeekListInfo`; 1 test; registered. **No migration.**

## Store (`app.svelte.ts`)

- `view: "planner"` (+ NavLoc / snapshotLoc / back()), `openPlanner()`.
- `week` state + `loadWeek(from, to)` / `reloadWeek()`.
- Planning mutations reuse existing plumbing — no new backend for writes:
  - **`addWeekTask(date, text)`** — `createList(title, date)` (idempotent per
    date) then `createTodo`, so a day's list is created only when you actually
    add a task (we never auto-create empty lists just by viewing).
  - **`addWeekBacklogTask`**, **`moveWeekTask(todoId, target)`** (target = a date
    or `"backlog"`, via `move_todo`), **`toggleWeekTodo`** — each reloads the week
    + `refreshLists`.

## `PlannerView.svelte`

The approved **vertical** design, all **theme-accent** coloured:

- **Mon–Fri** full-width stacked sections (weekends excluded by request) + a
  visually distinct **Backlog** section (accent-tinted, dashed, inbox icon).
  Today is highlighted (ring + "Today" pill); past days dimmed.
- **Compact single-line task rows** (ellipsis; full text on hover + on click) so
  a busy week stays scannable, with an inline status/tag/`⋮⋮`-grip; `` `code` ``
  in a title renders as a badge (`taskTitleHtml`).
- A bold **accent count pill** per section (`done/total` per day, count for
  backlog).
- **Drag & drop** a task between days or to/from the backlog — pointer-based
  (like the kanban): a floating ghost + the drop-target section highlights.
- Inline **＋ add** per day / backlog; the checkbox completes; **clicking a task
  opens the real Inspector modal** (`app.selectTodo` → title, description, tags,
  ⌘E) — the week reloads when that modal closes so edits show. Week nav
  (‹ / This week / ›).

## Placement — sidebar, not the top nav

Per the author: the entry point lives in the **sidebar**, not the TopNav icon
cluster. The old full-width Today's-list + Backlog buttons became a **grouped row
of three icon-only buttons** — **Today · Backlog · Planner** — labels dropped,
each with a tooltip and the active one highlighted. Each carries an uncut **count
badge** (positioned inside the corner, not overflowing): today's task count,
backlog pending, and the **week total** (`weekTotal`, summed from the list
summaries). `⌘0`, a command-palette entry, and a HelpModal row also open it; the
TopNav Planner icon was removed.

Files: `commands/search.rs` (+`get_week`, lib.rs reg), `models.rs`, `ipc.ts`;
`stores/app.svelte.ts`; `PlannerView.svelte` (new), `app.css` (`.planner-ghost`
/ drop), `Sidebar.svelte` (grouped buttons + badges), `+page.svelte` (dispatch +
label + ⌘0), `CommandPalette`, `HelpModal`. cargo test (99) + svelte-check +
build pass; the DnD / add / modal round-trip need a live `pnpm tauri dev` run.
Deferred: collapsible day sections, per-day progress bar, drag-reorder within a
day.
