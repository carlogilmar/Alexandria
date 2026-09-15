# Sprint 68 — The `stages` block (a "tree of stages")

A new powered-markdown block: an illustrated **tree of stages** inspired by
Manuel Lima's *The Book of Trees* (specifically Haeckel's *Pedigree of Man*).
Not a node graph and not a chart — a custom visualization that plays with form,
colour and magnitude. Ordered **strata** (stages) drawn bottom→top; each
milestone is a **magnitude-sized bubble** that clusters at its stage's centre and
gently jostles like bubbles, with hover / drag / click-to-focus.

Prototyped over ~9 Artifact rounds (tree → radial → Haeckel trunk → bubbles →
styles+drag → descriptions+detail → scale test → summaries+copy → header) before
any code.

## Authoring

```
```stages Product Roadmap
# Discovery
- User interviews *3: 8 sessions to validate the problem
- Market scan
# Build
- Frontend *4: the biggest chunk
- Backend *3
- Infra
# Launch
- Beta
- GA *5: public release
```
```

- **Title** — the fence info (`stages <title>`) or the first non-`#` line.
- **`#` stage** — a stratum (its own colour + corner label + `count · Σmag`
  summary), drawn bottom→top.
- **`- milestone`** — a bubble.
- **`*N`** — magnitude → bigger bubble + a taller stage band (busier/heavier
  stages grow).
- **`: text`** — a description, shown on hover.

## How it renders — a hydrated canvas

Like the board embeds (a synchronous fence can't animate/interact), the block
renders in two parts:

- **`renderStages`** (`markdownit.ts`) — emits the host synchronously: a
  `.md-bhead` header (title · `N stages · M milestones` meta · **Copy** + **Detail**
  buttons) + a fixed-height `.md-stages-body` + a **sr-only `<ol>` fallback**
  (accessibility / no-canvas). The full source rides in `data-src`; the block
  carries `data-line` (via `withSourceRange`) so per-block editing works.
- **`hydrateStagesBlocks(el)`** (`$lib/stages.ts`) — called from MarkdownEditor's
  hydrate `$effect` + MutationObserver (alongside mermaid/board), guarded by
  `data-rendered`. Mounts a `<canvas>` and `mountStages()`. De-dups any stray
  canvas first; old canvases self-terminate when a re-render detaches them
  (`!canvas.isConnected`).

## `mountStages` — the sim (`$lib/stages.ts`)

A hand-rolled `requestAnimationFrame` loop (no library, like the sidebar fx):

- **Physics** — each bubble is pulled to its stage centre, collides/packs within
  its stage, and wanders slightly; bands sized by total bubble diameter.
- **Bands** — tinted strata with a left accent bar, a **corner title** (bubbles
  cluster centre, so the label lives in the corner) and a `count · Σmag`
  summary badge on a plate-coloured pill.
- **Interactions** — **hover** → a fixed tooltip (name · ×magnitude · description)
  and isolation; **drag** a bubble (springs back to its stage); **click a stage**
  → focus it (toggle).
- **Copy** → PNG to clipboard (native `copy_image_to_clipboard`, web
  `ClipboardItem` fallback); **Detail** → a fullscreen modal running a second sim.
- Theme-aware via `--st-plate/--st-ink/--st-muted` (neutral **grays**, matching
  the other blocks — the mockup's warm cream was dropped) read off the canvas.

## Emphasis / de-emphasis (the two fixes that took a few rounds)

- **Hover froze under reduce-motion.** The loop was a one-shot static frame under
  `prefers-reduced-motion`, so `hovered` never recomputed and nothing redrew on
  hover. Fixed: the rAF loop **always runs**; only the *physics tick* is gated on
  reduce-motion (bubbles stay still, but hover/drag/select still detect + redraw).
  Added a `mousemove` fallback alongside `pointermove`.
- **De-emphasis was too subtle.** A dimmer opacity on the same coloured bubble
  didn't read as "not selected." Now non-emphasized bubbles are a distinct
  **gray ghost** — colour drained to a faint gray fill + gray ring + gray label —
  while the emphasized one keeps full colour (hovered adds a white ring). A
  bubble is emphasized when it's the hovered one, or (no hover) in the selected
  stage.

## Wiring

- Slash "**Stages tree**" (Charts & visuals) + a **FormattingHelp** row.
- Files: `markdownit.ts` (`renderStages`, fence dispatch, icons), `stages.ts`
  (new — parse + sim + hydrate + detail modal), `MarkdownEditor.svelte` (hydrate
  call), `app.css` (`.md-stages*`, `--st-*` tokens, tooltip, modal), `SlashMenu`,
  `FormattingHelp`.

Frontend-only — **no DB / IPC / migration**. svelte-check + build pass. The
canvas render, hydration, hover/drag, and PNG-to-clipboard need a live
`pnpm tauri dev` run to exercise (same caveat as the canvas tints). Limitation:
`stages` only hydrates on note surfaces — inside a blueprint card / flashcard it
falls back to the hidden list; notes are the intended home.

## Deferred (from the ideas list)

Clickable milestones (entity links), status encoding (done/doing/blocked) +
colour-by-status, park-a-bubble, calm/freeze toggle, search-highlight, a
detail-view legend table.
