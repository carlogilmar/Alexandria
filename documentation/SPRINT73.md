# Sprint 73 — The `timeline` block (a custom, animated timeline)

A new powered-markdown block for simple visual timelines — a deliberate
alternative to mermaid's timeline, with our own original style + animations.
Prototyped as an Artifact mockup first (two rounds). Frontend-only, no
backend/migration.

## Authoring

```
```timeline Product Roadmap
- 2024 Q1 | Discovery : user interviews & market scan - done
- 2024 Q2 | Design : prototypes & validation - done
- 2024 Q3 | Build : core engineering - current
- 2024 Q4 | Launch : GA release - upcoming
```
```

- Title = fence info (`timeline <title>`).
- One milestone per line: `- <date> | <title> : <description> - <status>`.
- `status` ∈ `done | current | upcoming` (optional; default upcoming). Title +
  description take inline markdown.

## Render (`renderTimeline` in `$lib/markdownit.ts`)

Synchronous HTML (renders in note previews + blueprint cards), **theme-accent**
coloured:

- A **horizontal rail** (`.md-tl-railwrap` scrolls when wide) of milestone beads;
  labels **alternate above/below** the line to save vertical space. The accent
  **progress line draws in** (CSS `@keyframes`) up to the current milestone (or
  last done); beads **pop in** staggered via per-bead `animation-delay`.
- Status colours: done = accent + ✓, current = accent + pulsing ring, upcoming =
  hollow/muted. All from `var(--accent)` + neutral tokens (light/dark on
  `.md-timeline`); reduced-motion safe.
- A **detail section** below — a card per milestone (date · "Milestone N" · title ·
  description · status badge).

`blockHeader` gives the title + `N milestones · M done`. `parseTimeline` reads the
DSL; title default "Timeline".

## Dynamic status — in-place, no note re-render

On an **editable note**, clicking a bead or its detail badge cycles the status
(upcoming → current → done) and **rewrites the fence source** — like task
checkboxes / progress steppers, but with one key difference:

- `setTimelineStatusInSource(src, index)` (exported) scans `- ` lines inside
  `` ```timeline `` fences in document order and rewrites the Nth line's trailing
  ` - status`. Each bead/badge carries a document-ordered `data-timeline` index
  (a counter on `env.timelineCount`, mirroring progress steppers).
- **The flash fix:** naively setting `draft = next` rebuilt the whole
  `{@html rendered}` preview (replaying every block's animation). Instead
  `cycleTimeline` (MarkdownEditor) **mutates only that block's DOM in place**
  (bead class + ✓, detail badge + row, progress width with a smooth transition,
  header count) and persists via `onCommit` **without** touching `draft`. A
  `tlLiveSource` guard makes the value→draft sync skip our own change (DOM already
  correct), so the preview isn't rebuilt; `startEditing` re-seeds the buffer from
  the latest source. Read-only surfaces render static.

## Wiring

Fence dispatch in `markdownit.ts`; `renderTimeline` + `parseTimeline` +
`setTimelineStatusInSource`; `MarkdownEditor.svelte` (click handler +
`cycleTimeline` in-place updater + sync guard); `app.css` `.md-timeline*`
(theme-accent, light/dark tokens, draw-in/pop/ping keyframes, reduced-motion +
mobile rules); slash "**Timeline**" (Charts & visuals) + a FormattingHelp row.

svelte-check + build pass; animations/interaction need a live webview run.
Deferred: Copy-as-image button, proportional (date-based) spacing, an "add
milestone" affordance.
