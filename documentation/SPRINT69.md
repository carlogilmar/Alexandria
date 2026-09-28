# Sprint 69 — Task workflow states, work-time tracking & colored tags

The todo system grew from a binary open/closed flag into a small **workflow**
that also **tracks how long you spend on a task** and shows its **flow time** —
plus tags finally became visible (and colored) in the list itself.

Motivation (the author's words): "every task can be open or close … now I'd
like to have another state: Work In Progress … when I move that task to WIP the
time starts, when I close it I get the amount of time spent … a new WIP section
in the list view … every task will have a flow time ('created 28 days ago') and
a duration ('took 3 days' / '2 hours') … add tags visually in the main view
using different colors." All three build toward a lightweight, automatic
performance-tracking system (see Sprint 70's dashboard, which consumes this).

## Decisions (all confirmed up front)

- **Durations shown:** BOTH the calendar age/lifespan (`created 28d ago` / when
  done, `lived 3d`) AND the tracked work time (sum of WIP sessions, `2h 15m`).
- **Timer model:** *pause & accumulate* — leaving WIP folds the elapsed session
  into an accumulator, so stop/resume across multiple sittings sums correctly.
- **Concurrency:** *multiple tasks may be WIP at once* (the WIP section lists all).
- **Tags:** *auto-assigned color* from a palette on creation; managed in the
  task detail modal (which already had a tag editor — it just wasn't colored,
  and tags weren't shown on the rows).

## Data model — migration `0030_todo_status_timing.sql` (additive)

`todos` had no CHECK constraint, so plain `ALTER`s are safe (no table rebuild):

- `status TEXT NOT NULL DEFAULT 'open'` — one of `open | wip | done`.
- `work_seconds INTEGER NOT NULL DEFAULT 0` — accumulated WIP time.
- `wip_started_at TEXT` — start of the current WIP session (NULL unless `wip`).
- `completed_at TEXT` — close time (NULL unless `done`).
- Backfill: `completed = 1 ⇒ status='done', completed_at = updated_at`.
- `tags` gains `color TEXT` (nullable; auto-set on new tags, NULL for pre-existing
  ones — the frontend colors those deterministically by id).

**`completed` is kept as a live mirror of `status='done'`** — this is the key
low-risk choice. Every existing surface that reads `todo.completed` (Activity,
Focus, Welcome, Mirror, `stats`/`daily_stats`/`activity_stats`) keeps working
unchanged; new UI reads `status`.

## Backend (`commands/todos.rs`, `tags.rs`)

- **`set_status(id, status)`** does the accounting in one place: entering `wip`
  stamps `wip_started_at`; leaving `wip` (to open or done) folds
  `now − wip_started_at` into `work_seconds` (computed in SQL via `strftime('%s',…)`
  for clock consistency); `done` sets `completed_at`; reopening a done task clears
  `completed_at` and **keeps** `work_seconds`. Command `set_todo_status`.
- **`toggle`** now reads the current status and routes through `set_status`
  (open⇄done), so the checkbox still does a direct close/reopen with correct
  timing.
- **Tag auto-color** (`add_to_todo`): a new tag is inserted with the next color
  from a 10-hue `TAG_PALETTE` (by current tag count); re-adding an existing tag
  keeps its color.
- **`for_list(list_id)` / `list_todo_tags`** returns every `(todo, tag)` link for
  a list in one query (reusing the `TodoTag` model) so the list view renders
  badges without an N+1 fan-out.
- Tests: work-time accounting + `completed` mirror + reopen-keeps-time, invalid
  status rejected, distinct auto-colors, `for_list` across todos.

## Frontend

- **`$lib/tasktime.ts`** (new) — shared helpers: `parseSqlUtc` (SQLite
  `datetime('now')` is UTC-without-zone), `fmtAge`/`fmtSpan` (coarse `3d`/`2h`),
  `liveWorkSeconds` (accumulator + live session while WIP), `fmtWork`
  (`2h 15m`), and `tagColor` (color or deterministic fallback by id).
- **`TodoRow.svelte`** — restructured into a two-line row: a ▶ **Start** button
  (open) / ⏸ **Pause** + a live ticking time badge (wip); a **meta line** with
  age + tracked work; **colored tag pills**. The checkbox flips done.
- **`ListView.svelte`** — the flat list became three sections via a `{#snippet}`:
  **Work in progress · To do · Done** (each with a count header). A 1s `now`
  tick runs only while ≥1 task is WIP, driving the live badges. Drag-reorder is
  scoped to same-status rows (the one UX change: you change status with the
  buttons, not by dragging between sections).
- **`Inspector.svelte`** (task detail modal) — status badge + Start/Pause/
  Mark-done/Reopen controls, an age + tracked-time readout, and the tag pills
  are now colored.
- Store: `setTodoStatus(todo, status)`, `todoTags` map loaded in `select()` via
  `loadTodoTags`, and tag add/remove reloads it so rows stay in sync.

Frontend + one additive migration; **`completed` mirror means no other backend
surface changed**. `cargo test` + `svelte-check` + `build` all pass. The canvas-
free bits are plain DOM, but the DB migration + interactions want a live
`pnpm tauri dev` run to confirm on the real database.
