# Sprint 48 — Home, redesigned

## Why

The old Home (`Welcome.svelte`) led with **counter cards** (Articles / Notes
/ Blueprints) and **quick-nav cards** (Library / Mirror). Both were dead
weight: raw counts aren't actionable, and the nav shortcuts duplicate the
toolbar. Home should answer *"what do I do now / where do I pick up,"* not
*"how many things do I have."* Prototyped as an approved mockup.

## What shipped

`Welcome.svelte` rewritten around three things:

1. **Greeting + New-list button** — time-aware greeting ("Good morning/…")
   + long date; the header button creates today's list (or "Open today's
   list" when one exists). Replaced the old title + the theme toggle idea.
2. **Today card** — today's list as **checkable tasks** with a progress
   bar and an inline "Add a task…" field; a **Backlog pill** (pending
   count → opens Backlog) in the header. Empty state = a "＋ Create today's
   list" CTA + a backlog line. This is the daily driver, front and center.
3. **Jump back in** — the most recently touched notes / articles /
   blueprints / boards / storyboards (type colour + icon + "edited Xago"),
   click to resume. The actionable **replacement for the counters**.

**Kept:** the contribution **calendar** (now with a "N contributions in the
last year" caption) + its day-detail panel (plan/open lists & notes for a
day), and the first-run **Start here** card.

**Removed:** the counter cards, the Library/Mirror quick-nav cards, and the
expandable per-kind bucket list (all superseded by the toolbar + the
Library + "Jump back in").

### Store (Sprint 48)

A small **Home "Today"** slice in `app.svelte.ts`, mirroring the Focus
pattern so the Home card is self-contained:

- state `homeListId` / `homeTodos`.
- `loadHomeToday()` (resolves today's list like Focus; never auto-creates),
  `createHomeToday()`, `toggleHomeTodo(todo)`, `addHomeTodo(text)`.

`Welcome` calls `loadHomeToday()` on mount **and** in a guarded `$effect`
(reloads whenever the resolved today-list id changes — covers the async
`init()` race and external list add/remove without looping).

### Animation (native, no dependency)

New `$lib/anim.ts` exports a `reveal` Svelte action (Web Animations API:
fade + slide-up, staggered by `delay`, respects `prefers-reduced-motion`).
Home uses it for a staggered entrance (header → Today → Jump-back-in items
→ Activity). The progress bar animates its width (CSS), and the task
checkmark pops on completion (CSS keyframe). This is the same hand-rolled
approach as the Mirror (which uses rAF + custom easing on a canvas) — no
anime.js dependency; `reveal` is reusable elsewhere.

## Checks

`svelte-check` 0/0, `pnpm build` clean. (Frontend-only; no backend/ipc/
migration change — reuses existing todo/list commands.)
