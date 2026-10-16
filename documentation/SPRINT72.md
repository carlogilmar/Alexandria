# Sprint 72 — The Dashboard, evolved (into a magnitude view of my workflow)

Sprint 70 shipped a first Dashboard. This sprint reshaped it, over many iterations
with the author, from a "classic charts" readout into a **custom, interactive
performance view** — culminating in a bespoke **Task field** bubble visualization.
All built on Sprint 69's task timing/status/tags; mostly frontend (one tiny
read-only backend command, no migration).

## Opening a task's detail from anywhere (backend + store)

To let the Dashboard (and search) open the **real task modal** without a list
loaded:

- Backend `get_todo(id)` (`commands/todos.rs`) — fetch one full `Todo` by id.
- Store: a shared **`detailTodo`** state. `selectTodo(id)` now resolves the full
  Todo from the open list **or fetches it by id**, so the Inspector renders on
  ANY view (`+page.svelte` renders it from `app.detailTodo`, not just `list`).
  Mutations (`setTodoStatus`/`setTodoWorkSeconds`/text/notes) `patchDetail(...)`
  so the open modal reflects its own edits; `recordNav()` clears it so it never
  lingers across a navigation. `goToHit` reuses `selectTodo`.

## `DashboardView.svelte`

Range presets (default **This week**) + custom from/to; a **Count-by** control
(*Planned day* vs *Completed day*) with a one-line hint; a scalable **"Tags ▾"
dropdown** (search + checkboxes + removable filter pills). Fetches a window padded
back one period (`store.loadDashboard`) so previous-period KPI deltas need no 2nd
call; a `$effect` refetches only when that window changes, everything else
re-derives client-side. `invalidateDashboard()` (called from `refreshLists` + tag
edits) keeps it fresh when tasks change elsewhere.

Sections:
- **4 KPIs** — Completed (Δ vs prev), Planned, Completion %, Tracked time — in the
  **theme accent**.
- **Tasks this period (mosaic)** — one uniform square per task, packed into a
  single figure ordered by primary tag (colors cluster), **✓ on done**, up to 3
  tag-color bands; click opens the task; hover = native tooltip.
- **Task field (bubbles)** — the flagship custom viz (see below), replaces the
  treemap.
- **Tracked time per day** — accent bars with the value shown in/above each bar;
  empty-state when nothing's tracked; click a bar to drill the table.
- **Effort by weekday** — 7 tiles (Mon–Sun) shaded by tracked time, **peak day**
  highlighted (tile style chosen from a 3-option mockup).
- **Completed over time** — a cumulative-done line (accent area fill + endpoint
  "N done").
- **Task table** — sort by Recent / Status / Tag; compact status pills
  (Open/WIP/Done); **rows open the detail modal**.
- **Cross-filter drill** — clicking a day bar (or a mosaic/bubble) filters the
  table with a "← Back to overview" bar; an empty period shows one friendly card
  instead of blank charts.
- **Copy as image** — rasterizes the whole dashboard (`html-to-image` → native
  clipboard).

## The Task field — a custom bubble visualization (`$lib/bubblefield.ts`)

A hand-rolled canvas physics sim (same family as `$lib/stages.ts`) that replaced
the treemap:

- **Size = tracked time** (sqrt/area, capped); not-started tasks get a small
  **dashed "seed"** bubble.
- **Color = status, from the theme accent**: done = accent + ✓, WIP = a lighter
  accent shade with an accent **pulse**, open = neutral outline. (Accent is read
  by setting `canvas.style.color = var(--accent)` and resolving to rgb — so it
  works whether `--accent` is hex, rgb OR **hsl**; parsing the raw token directly
  mis-read hsl as red.)
- **Physics** — gentle drift toward centre, collision packing, wall bounce;
  reduced-motion → a settled static pack.
- **Interactions** — hover tooltip (reuses the stages tooltip), **click opens the
  task**, **drag** a bubble (springs back). **Zoom + pan**: wheel/pinch zoom only
  with ⌘/Ctrl held (so plain scroll still scrolls the page), plus +/−/1:1
  buttons; drag the background to pan when zoomed. Hit-testing is in world coords
  so clicks stay accurate at any zoom.
- Re-mounts (via a `$effect`) only when the task set OR theme/tint changes — so a
  drill/hover doesn't reset the drift, and a theme switch recolors immediately.

## Task-workflow follow-ups folded in

- **Task-title badges** — `` `code` `` in a task title renders as an accent badge
  on read surfaces (list rows, Home, dashboard table) via `taskTitleHtml` +
  `.task-badge`; the editor input stays raw.
- **Focus mode** gained the WIP section (amber "In progress" group + live timers +
  ▶/⏸ via `setFocusTodoStatus`); **Home**'s Start button is always visible.

## Files

`commands/todos.rs` (+`get_todo`, lib.rs reg), `ipc.ts`; `stores/app.svelte.ts`
(`detailTodo`/`selectTodo`/`patchDetail`/dashboard state); `DashboardView.svelte`,
`$lib/bubblefield.ts` (new), `$lib/tasktime.ts` (`taskTitleHtml`), `app.css`
(`.task-badge`), `+page.svelte`, `FocusMode.svelte`, `Welcome.svelte`, `TodoRow`.

No migration (reads Sprint 69's columns). cargo test + svelte-check + build pass.
The canvas/clipboard/webview bits need a live `pnpm tauri dev` run. Deferred:
Markdown report export, per-tag completion rate, cycle-time distribution,
period-vs-previous compare (all prototyped in the mockup).
