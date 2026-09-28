# Sprint 70 — The Dashboard (task performance over a period)

A new top-level **Dashboard** section for reviewing tasks over a time range —
built directly on Sprint 69's timing/status/tag data. Motivation: "visualize my
tasks … take the tasks from a week, a month, a period of time … so helpful to
make reports and see my performance." Prototyped as an interactive Artifact
mockup first (approved before any code).

## Decisions (confirmed)

- **Placement / label:** a first-class **"Dashboard"** top-nav destination at
  **⌘9** (the only free ⌘-digit), also in the command palette + HelpModal.
- **Export:** a **Copy-as-image** button (whole dashboard → PNG on the clipboard),
  the natural fit for pasting into a report. (Markdown export deferred.)
- Keep **both "Count by" modes** and the **hand-rolled charts** (no chart lib,
  like the Mirror).

## The "Count by" toggle (the one decision that shaped the backend)

A task can be bucketed by two different dates, which answer different report
questions, so both are offered:

- **List date** — tasks *scheduled* on days in the range (a planning view).
- **Completed date** — tasks *finished* in the range (a throughput view).

## Backend (`commands/search.rs`)

- **`get_dashboard(from, to)`** returns a `DashboardData { tasks, tags }`:
  - `tasks`: every task whose owning **non-backlog** list date is in `[from,to]`
    **OR** that was completed in that window (`date(completed_at)` in range) — so
    the frontend can bucket by either reference. Each carries status, `completed`,
    `work_seconds`, `created_at`, `completed_at`, and its `list_date`.
  - `tags`: the `(todo, tag)` links for the same predicate (reuses `TodoTag`),
    grouped client-side — no N+1.
  - New models `DashboardTask` / `DashboardData`. 1 test (in-range by list date,
    in-range by completion, far-out excluded, tag link present). **No migration**
    — it only reads Sprint 69's columns.

## Frontend (`DashboardView.svelte`)

The approved mockup rebuilt on real data with native Tailwind + dark mode:

- **Controls:** range presets (This week / This month / Last 7 / Last 30 /
  Custom from–to), the **Count by** segmented toggle, and a **tag filter**.
- **6 KPI cards:** Completed (with a **▲/▼ % delta vs. the previous equal-length
  period** — what makes it a performance view), Planned, Completion rate, Tracked
  time, Avg cycle time (created→done), In progress.
- **Charts (hand-rolled SVG):** Activity per day (planned vs completed bars),
  Status donut, Tracked time per day (bars, using the theme `--accent`), and
  By-tag bars (count · time).
- **Task table:** every task in the period — text, tags, status pill, created,
  work, cycle — the raw material for a report.
- **Copy as image:** rasterizes the whole dashboard via `html-to-image` `toBlob`
  and copies a PNG (native `copy_image_to_clipboard`, `ClipboardItem` fallback),
  theme-aware background — same mechanism as the powered-markdown blocks.

**Data fetching:** the view computes the current `[from,to]` from the preset,
then fetches a window **padded back by one period length** (`store.loadDashboard`)
so the previous-period deltas need no second call. A `$effect` refetches only
when that window changes; the *Count by* toggle and tag filter re-derive client-
side (the padded fetch already covers both date bases).

## Wiring

- Store: `view: "dashboard"` (+ NavLoc / snapshotLoc / back()), `openDashboard`,
  `dashboard`/`dashboardLoading`/`dashboardFetchedFrom`/`To` state, `loadDashboard`.
- `+page.svelte`: import + dispatch case + `VIEW_LABELS` + the **⌘9** shortcut.
- `TopNav.svelte`: a bar-chart Dashboard icon. `CommandPalette` + `HelpModal`
  entries.

Frontend + one read-only backend command; `cargo test` + `svelte-check` +
`build` pass. Canvas/clipboard + real numbers want a live `pnpm tauri dev` run
(numbers stay sparse until a few days of tracked work exist).

Deferred: Markdown/report-text export, streak / busiest-day, per-tag completion
rate, a weekly-comparison table.
