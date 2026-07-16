# Sprint 25 — Link cards (markdown dashboards)

A Notion/GitBook-style **card** component for markdown: a ` ```cards ` fence
renders a responsive grid of clickable tiles (title, description, link, color,
icon). Lets you build a "dashboard" note/article of links — external URLs or
internal entities. Frontend-only.

## Syntax

````
```cards
title: Production Dashboard
desc: Live metrics & alerts
link: https://grafana.internal
color: blue
icon: 📊
---
title: Auth flow
desc: How login works
link: blueprint:12
color: violet
icon: 🔐
```
````

- Cards separated by a `---` line; fields are `key: value` lines.
- `title` (only required field), `desc`, `link`, `color`, `icon`.
- `link`: `https://…` (external) or an entity `note|list|workflow|article|
  flashcard|blueprint:<id>` (internal). Omit → non-clickable card.
- `color`: solids `red·orange·amber·green·teal·blue·violet·pink·gray`
  (hue-driven tints) or gradient presets `sunset·ocean·forest·dusk·candy`
  (white text).
- `filled: true`: bold, **darker** saturated fill with white text (solids
  only; gradients are already bold). The default is the pale tint.

## Light / dark

- **Tint (default)**: pale hue bg + dark text in light; deep hue bg
  (`hsl(h 32% 15%)`) + light text in dark. Subtle, readable both ways.
- **Filled**: `hsl(h 58% 45%)` light / `hsl(h 50% 40%)` dark, white text — same
  punchy look in both modes.
- **Gradient**: fixed preset gradients, white text — identical in both modes.
Verified in a dark-mode render.

## How it works

- **`renderCards` in `$lib/markdownit.ts`** — a `cards` branch in the shared
  `fence` renderer parses the block and emits the grid HTML *directly* (no
  async hydration needed, unlike mermaid). Each card is an `<a>` when it has a
  link, else a `<div>`. All user text is escaped (`md.utils.escapeHtml`).
- **Links reuse existing handling** — the card `<a href>` is caught by the
  editors' existing `onPreviewClick` (`target.closest("a")`): entity hrefs
  navigate in-app, `https?://` opens via the OS opener, anything else is
  inert (preventDefault). No new click wiring.
- **Styling in `app.css`** (`.md-cards` / `.md-card…`). Solid tints use a
  `--h` custom property set by the color class; gradients set the background
  directly. High-specificity selectors (`.markdown-body .md-cards …`) so the
  card anchors beat the link-chip pill styling in the editor components.
- **Insert button** — "Insert cards" added to both editors' toolbars (next to
  Insert table / diagram) drops a template. Documented in `FormattingHelp`.

Works in every markdown surface (notes, articles, task descriptions). In
blueprint-card bodies the grid renders but links are inert (no `onPreviewClick`
there) — acceptable; a follow-up could wire it.

## Follow-ups shipped

- **`color: black`** — a near-black card (white text, subtle border so it reads
  on both canvases). Added to `CARD_SOLID` + a dedicated `.md-card-black` rule.
- **Hover-color fix** — card `<a>`s were picking up the editors' link-chip
  `a:hover` background (a blue-purple) because that rule (`…:hover`, specificity
  0,3,1) beat the card's own background on hover. Fixed by excluding `.md-card`
  from the pill rules (`:global(a:not(.md-card))`) in both editors, so cards
  keep their own background and only lift on hover.

## Follow-ups / deferred

- `image:` background field (Approach C from the design chat) — deferred.
- Wire card-link navigation for blueprint-card descriptions.
- Per-card width / spanning options.
