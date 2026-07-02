# Sprint 23 — Markdown upgrades: tasks, syntax highlighting, note outline

Three quality-of-life improvements to every markdown surface.

## Task checkboxes

`- [ ] todo` / `- [x] done` render as real checkboxes; checked items strike
through (`li.task-done`, styled in `app.css`). Clicking a checkbox in the
preview **persists**: it flips the matching marker in the markdown source and
commits.

Mechanics (all in `$lib/markdownit.ts`):
- `addTaskLists` (core rule): finds `inline` tokens whose parent chain is
  `list_item_open → paragraph_open` and whose text starts with `[ ] `/`[x] `;
  strips the marker, prepends an `<input class="md-task" data-task="N">`
  html_inline token, tags the `li` with `task-list-item` (+ `task-done`).
  `N` is the document-order task index.
- `toggleTaskInSource(src, n)`: scans source lines with the same ordering
  rules — skips fenced code, tolerates `>` blockquote prefixes, accepts
  `-*+` and `1.`/`1)` list markers — and flips the nth marker. The renderer
  count and the source count MUST stay in sync; both live in this file for
  that reason. Validated with a standalone test (fences skipped, nesting,
  blockquotes, numbered lists).
- `MarkdownEditor` handles the click (preview implies `draft === value`).
  `ArticleEditor` renders markdown in segments split around `{{embed}}`
  lines, so `data-task` restarts per segment — each md segment is wrapped in
  `<div data-seg={i}>` and the click handler offsets the local index by
  `countTasksInSource` of the preceding md segments. Checkboxes inside
  embeds are inert (the `closest("aside")` guard fires first).

## Syntax highlighting (the code-block fix)

Two things were wrong with fenced code:
1. The inline-code pill styling (`.markdown-body code { background … }`)
   also hit `code` inside `pre` — and since `code` is inline, a multi-line
   block painted a background strip per wrapped line ("weird highlight on
   every line"). Fixed by scoping the pill to `:not(pre) > code` and
   resetting `pre > code` in MarkdownEditor / ArticleEditor / EmbedBlock.
2. No highlighting. Now `createMarkdownIt` passes a `highlight` callback
   backed by **highlight.js core** with hand-registered languages (Elixir
   first-class, plus erlang/js/ts/json/bash/python/rust/sql/xml/css/yaml —
   core-only import keeps the bundle lean). Token colors are a
   GitHub-flavored palette in `app.css` (`.hljs-*`), light + dark. Unknown
   or missing language tags fall back to plain escaped text.

## Note outline ("on this page")

`MarkdownEditor` takes an `outline` prop (only `NoteView` passes it). In
preview mode with ≥2 headings, a floating right-side panel (`fixed`,
`xl:`-only so it never overlaps the centered column) lists h1–h3 headings,
indented by level; clicking scrolls the matching heading into view.
Headings are extracted from the source (fences skipped, inline markdown
stripped) in the same document order as the rendered `h1,h2,h3` NodeList —
index i in the panel maps to element i in the preview.
