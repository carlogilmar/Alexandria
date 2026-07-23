# Sprint 33 — Progress bars in markdown (```progress fence)

## Why

With charts and marquees in place, the natural companion is a simple
**progress bar** for notes — to eyeball "how far along" something is
(tasks done, reading position, a goal). The user wanted the *easy*
option: type a value, get a bar — no schema, no computed state.

> Considered but not chosen: auto-bars derived from a note's task
> checkboxes, and a stored per-note % field surfaced in Summary. The
> user picked the authored markdown fence for its simplicity.

## DSL

One labeled bar per `Label: value` line — same family as ```chart.

````
```progress
Tasks: 4/10
Reading: 60%
Savings goal: 45 green
Migration: 90% teal
```
````

Value forms (per line):
- **fraction** `4/10` → 40% (the "4/10" is shown as the readout)
- **percent** `60%`
- **bare number** `45` → 45% (shown as "45%")

An optional **trailing color word** (`red · orange · amber · green · teal
· blue · violet · pink · gray · black`, shared with ```marquee) sets the
fill; default blue. Percent is clamped to 0–100; unparseable lines are
skipped.

## How it works

CSS-only, synchronous, no hydration (like ```cards / ```chart /
```marquee). `renderProgress` in `$lib/markdownit.ts` emits, per row, a
label + readout header and a track/fill bar; the fill width and color are
inline styles. The track uses `color-mix(currentColor 12%)` so it reads on
any surface / theme; the fill animates its width via a CSS transition.

## Files

- `documentation/SPRINT33.md` — this doc.
- `src/lib/markdownit.ts` — `renderProgress`; `progress` case in the
  `fence` rule (reuses `MARQUEE_COLORS`).
- `src/app.css` — `.md-progress*` styles.
- `src/lib/components/SlashMenu.svelte` — "Progress bars" slash command.
- `src/lib/components/FormattingHelp.svelte` — a progress row.

## Not doing

- No auto-compute from checkboxes, no stored per-note field, no gradient
  fills, no segmented/stacked bars. Kept intentionally minimal.
