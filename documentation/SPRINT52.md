# Sprint 52 — Home visual: the "Your year" ridge + a dark Today card

## Why

Home read a bit list-y (cards + the green calendar) and lacked a hero
visual moment. Explored four options as a mockup; the author picked the
**Mirror-style bars, minus the orbs** — a compact "activity ridge."

## What shipped

- **"Your activity" ridge** (`Welcome.svelte`) — a full-width canvas band, one
  bar per day for the history so far (first activity → today, capped ~52 weeks), **height = tasks that day** (from
  `app.dailyStats`, already loaded), a fixed **Magma** gradient, centered
  (mirror-style) ridge. Animates in left→right on mount (rAF + per-bar
  stagger; reduced-motion → instant). The whole card is a button that
  **opens the Mirror** (⌘4). Only shown when there's ≥1 day with tasks.
  Sits below the contribution calendar. Spanning actual history (not a fixed 364-day window) keeps a young history filling the width with fat bars instead of a thin right-aligned sliver.
- **Dark Today card** — the today's-list card is now a solid dark surface
  (`bg-neutral-900`, light text) in both themes, so it reads as the
  primary hero: progress bar over `white/10`, emerald-400 fill/checks,
  light task text, a `white/15` backlog pill, dark-styled add-task input.

## Notes

- Frontend-only; no backend/ipc/store change. Uses `dailyStats` (task
  counts) rather than `activityStats` (combined) so it's "your daily
  effort," visually distinct from the green contribution calendar below.
- The ridge draw loop lives in `onMount` (rAF, cancelled on destroy) and
  reads the reactive `ridgeVals`, so it fills in as data loads.

## Checks

`svelte-check` 0/0, `pnpm build` clean.
