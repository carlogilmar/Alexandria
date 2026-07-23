# Sprint 32 — Marquee banner (```marquee fence)

## Why

A moving, colored banner is a strong way to flag something important in a
note, or to act as a bold section divider. User ask: "a marquee from
right to left with a colored background — useful for important stuff or as
a division."

## What it is

A `` ```marquee `` fence renders a horizontally scrolling (right→left)
colored bar.

````
```marquee red fast
🚀 Deploy freeze at 3pm — do not merge to main!
```
````

- **Options ride in the fence info string** (`marquee <color> <speed>`),
  NOT as `key: value` lines — so the banner text can contain colons,
  URLs, anything. Order-independent.
  - color: `red · orange · amber · green · teal · blue · violet · pink ·
    gray` (600-level fills, white text). Default `blue`.
  - gradient (in place of a color): `sunset · ocean · forest · dusk ·
    candy` — shared with the `` ```cards `` gradient look
    (`MARQUEE_GRADIENTS`).
  - speed: `slow · normal · fast` (26s / 16s / 9s loop). Default `normal`.
- The fence body is the banner text (whitespace-collapsed, escaped).

The full option list is documented in-app in the **Formatting** reference
("Marquee banner" section).

## How it works (CSS-only, no hydration)

Unlike mermaid, there's no JS. `renderMarquee` emits the text **twice**
inside a `.md-marquee-track`; the track animates `translateX(0 → -50%)`
linearly and infinitely, so the second copy seamlessly takes over as the
first scrolls off — a continuous loop with no dependency and nothing to
hydrate (survives the `{@html}` re-renders for free).

Details in `app.css`:
- **Hover pauses** (`animation-play-state: paused`).
- **Reduced-motion**: no scroll — the second copy is hidden and the single
  label is centered, so the colored bar still works as a static callout /
  divider.

Background color is an **inline style** (`style="background:#..."`) rather
than a per-color class, avoiding Tailwind purge concerns; the palette is
the `MARQUEE_COLORS` map in `markdownit.ts`.

## Files

- `documentation/SPRINT32.md` — this doc.
- `src/lib/markdownit.ts` — `renderMarquee` + `MARQUEE_COLORS` /
  `MARQUEE_SPEEDS`; `marquee` case in the `fence` rule (matches
  `marquee` or `marquee …`).
- `src/app.css` — `.md-marquee*` styles + `@keyframes md-marquee-scroll`.
- `src/lib/components/SlashMenu.svelte` — "Marquee banner" slash command.
- `src/lib/components/FormattingHelp.svelte` — a marquee row.

## Not doing

- No left→right direction toggle, no custom hex color, no per-word
  formatting inside the banner (plain escaped text — keeps the seamless
  duplicate + reduced-motion handling simple).
