# Sprint 39 — Contribution graph in Focus mode (multi-entity activity)

## Why

Focus mode (the aurora "screensaver", Sprint 28) shows the clock + today's
list. The user wanted the **contribution graph** there too — a
GitHub-style heatmap — so the focus screen doubles as a motivating "look
how consistent I've been" view. It counts activity across **todos, notes,
articles, and blueprints** (not just todos) for a truer picture.

## What

A year-long (52-week) heatmap below the today's-list block, colored by a
combined **activity count** per day:

- **completed todos** (by their list's date), plus
- **notes / articles / blueprints created** that day (by `created_at`).

Archived items and the Backlog are excluded, matching the daily surfaces.

- Columns = weeks (Sun→Sat), classic GitHub layout; the current week is
  the last column with future days hidden.
- 5-level green scale on the dark stage: 0 · 1–2 · 3–4 · 5–6 · 7+.
  Today's cell gets a white outline; a "Less → More" legend + an
  "N contributions in the last year" caption sit around it.

## Backend

`get_activity_stats` (`commands/search.rs`, model `ActivityDay {date,
count}`) `UNION ALL`s four per-day GROUP BYs (todos done by list date;
notes/articles/blueprints created by `date(created_at)`), then sums per
date. Registered in `lib.rs`. Covered by
`activity_stats_combines_todos_and_entities`.

## Frontend

- Store: `activityStats` loaded in `init` + `refreshLists`, and refreshed
  in `enterFocus()` so entities created since load are reflected (toggling
  a focus todo already calls `refreshLists`, so completions update live).
- `FocusMode.svelte`: `contrib` (`$derived.by`) builds the week columns
  from a `date → count` map, keyed off `todayKey` (an `isoLocal(now)`
  string) rather than `now`, so the grid rebuilds at **midnight**, not on
  every 1-second tick. `levelFor(count)` buckets 0–4 (`.cg-l0…4` green
  scale); future cells `visibility: hidden`; `overflow-x-auto` +
  `w-max`/`mx-auto` centers when it fits, scrolls on narrow windows.

## Files

- `documentation/SPRINT39.md` — this doc.
- `src-tauri/src/db/models.rs` — `ActivityDay`.
- `src-tauri/src/commands/search.rs` — `activity_stats` /
  `get_activity_stats` (+ test).
- `src-tauri/src/lib.rs` — command registration.
- `src/lib/ipc.ts` — `ActivityDay` + `getActivityStats`.
- `src/lib/stores/app.svelte.ts` — `activityStats` state + loads.
- `src/lib/components/FocusMode.svelte` — heatmap markup + `.cg-*` styles.

## Home calendar now matches

The Home (`Welcome.svelte`) contribution grid was already a GitHub-style
weekly layout, but colored **past** days by todo completion state
(rose = partial, emerald = done). It now colors past/today cells by the
**same combined `activityStats` count** on the **same 5-level green scale**
as the Focus graph (via `levelFor`), so the two read identically. What was
kept: the **future runway** (clickable `future-empty` / `future-planned`
cells for planning), the today ring, month labels, and click-to-open a
day. The legend became a "Less → More" green ramp (+ planned + today), and
the tooltip now shows the contribution count (plus `todos done/total` when
a list existed). `activityStats` is loaded on init/refreshLists, so Home
stays current.

## Not doing

- No month/weekday labels on the *Focus* graph (kept minimal there), no
  per-entity breakdown in tooltips (just the total). Entity *edits* aren't
  counted — only creations + todo completions.
