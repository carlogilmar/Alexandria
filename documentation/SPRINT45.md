# Sprint 45 — Note editor: stay where you were

## Why

Two friction points editing long notes in `MarkdownEditor`:

1. Finish editing near the bottom, click away → the preview renders but
   the page jumps back to the **top** of the note. You lose your place.
2. Re-editing meant hunting for the small **Edit** button (top-right, or
   the bottom one on tall notes) — neither is where your eye is while
   reading. The user wanted a single, always-reachable Edit affordance.

(Fix #1 needs a mapping between a source line and the rendered block it
produced.)

## What shipped

### Source-line mapping (shared markdown engine)

`$lib/markdownit.ts` → `addLineNumbers(md)`, a core rule (`line_numbers`,
pushed last) that walks the top-level tokens and, for each block token
carrying source-map info, sets `data-line="<0-based source line>"`. The
default `renderToken` emits it, so rendered `<p>`/`<h2>`/`<ul>`/`<table>`
/… carry their originating line. Custom fence renderers
(mermaid/cards/chart/…) build HTML by hand and ignore token attrs, so
those blocks simply don't get a line — a click there falls back to the
nearest preceding block. The attribute is **inert** on every other
surface (blueprint cards, flash cards, etc.).

### Scroll-to-edited on commit (fixes #1)

`MarkdownEditor` — `commit()` records `pendingScrollLine` = the source
line of the caret at blur time. An `$effect` keyed on `previewEl`
(which transitions undefined→defined on the edit→preview swap) then
scrolls the block whose `data-line` is the largest `≤` that line into
view (`block: "center"`). Set only by `commit()`, so it no-ops on
every other render (task toggles, theme flips, external value sync).

### Floating Edit FAB (fixes #2)

New `floatingEdit` prop (NoteView passes it, like `outline`). When on,
the inline top-right and bottom Edit buttons are **hidden**, replaced by
a single pill FAB fixed in the bottom-right corner (`fixed bottom-6
right-6 z-20`) that's always reachable while reading and doesn't
interrupt the text. A plain click in the preview does nothing (reading
stays uninterrupted); links/checkboxes/steppers still act.

(An earlier same-session attempt made the whole preview click-to-edit;
the user found that intrusive while reading, so it was replaced with the
FAB. `lineAtOffset` remains for the scroll restore; the reverse
offset-lookup helper was dropped with click-to-edit.)

## Scope / tradeoffs

- Notes only (`NoteView`). Articles (`ArticleEditor`) and the other
  MarkdownEditor surfaces keep the inline Edit buttons — extend later by
  passing `floatingEdit`.
- Scroll target is exact for standard blocks; a caret inside a custom
  fence (no `data-line`) lands on the nearest preceding block — fine.
- No dependency, no backend, no migration.

## Checks

`svelte-check` 0/0 (653 files), `pnpm build` clean. Verified the core
rule emits the expected `data-line` values on a sample document.
