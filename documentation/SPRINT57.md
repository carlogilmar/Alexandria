# Sprint 57 — Shared GitHub-style header bar (files · cards · spec · stats)

The `files` block's header (a tinted strip: label left, metric right) read as
nicely GitHub-like, so it's now a **shared component** across the doc blocks.

## What shipped

- `blockHeader(title, sub, meta, md)` in `$lib/markdownit.ts` emits the shared
  `.md-bhead` bar (title + optional subtitle on the left, a count/metric on the
  right).
- **cards**: the `heading:` (+ `desc:`) first block now renders as the header
  bar with a **card count** on the right, and the grid is wrapped in a bordered
  **panel** (`.md-cards-panel` / `.md-cards-body`) — matching files. (Replaces
  the old big-title `.md-cards-head`/`-heading`/`-subtitle`.)
- **spec**: an optional `heading:` line becomes the header bar with a **field
  count** on the right (extracted before the `Label: value` rows).
- **stats**: an optional `heading:` line becomes the header bar with a **metric
  count**, wrapping the metric grid in a panel (`.md-stats-panel` /
  `.md-stats-body`) — same as cards.
- **files**: unchanged behaviour; its `.md-files-head` now shares the
  `.md-bhead` container CSS (grouped selector, no duplication).

## CSS

`.md-files-head, .md-bhead` share one container rule (tinted strip, uppercase
label, light/dark). `.md-bhead-left` (title + `.md-bhead-sub`) / `.md-bhead-meta`
(tabular-nums). `.md-cards-panel` / `.md-stats-panel` (+ their `-body`) give
cards/stats the same bordered container as files/spec.

## Notes

- Backward-compatible: cards/spec without a `heading:` render exactly as before
  (bare grid / header-less sheet).
- Slash `spec` template gains a `heading:` line; FormattingHelp + demo updated.

## Checks

`svelte-check` 0/0, `pnpm build` clean.
