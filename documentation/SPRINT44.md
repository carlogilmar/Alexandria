# Sprint 44 — Icons in powered markdown

## Why

Storyboards (Sprint 43) shipped a curated, offline icon set — Lucide
concept line icons + Devicon brand logos — in `src/lib/storyIcons.ts`.
Those icons were only reachable from the storyboard icon-node picker.
The user wanted the same marks **inside markdown** (notes/articles),
and specifically asked for Jira/Confluence/tickets and other PM-flavored
icons. This sprint surfaces the icon set as an inline markdown feature.

## What shipped

### Inline `:name:` shortcode

Type `:jira:`, `:database:`, `:docker:` in any powered-markdown surface
and it renders as an inline icon, sized to the surrounding text and
(for concept icons) tinting with the text color.

- `src/lib/markdownit.ts` → `addIconShortcodes(md)`, registered as an
  inline rule **before `emphasis`** (so it wins over `_`/`*` parsing but
  after the fence/block rules). It fires only when the cursor is on a
  `:` and the following text matches `^:([a-z0-9][a-z0-9-]*):` **and**
  the name resolves to a known icon via `iconByShortcode`. An unknown
  `:foo:` is left untouched — so URLs (`http://…`), times (`10:30`) and
  emoji shortcodes we don't ship are never mangled. This whitelist guard
  is the key design choice.
- Render rule emits
  `<span class="md-icon md-icon-{kind}" title="…">{svg}</span>`.
- `.md-icon` CSS in `src/app.css`: `inline-flex`, `1.05em` box,
  `vertical-align:-0.18em`, small horizontal margin; the inner `svg`
  fills the box. Concept icons inherit `currentColor` (stroked), brand
  logos keep their own colors.

### storyIcons helpers

`src/lib/storyIcons.ts` gained two shared helpers (used by both the
markdown rule and the picker):

- `iconByShortcode(name)` — resolves a bare name to a `StoryIcon`,
  trying the flat concept key first, then the `b:` brand prefix.
- `iconInlineSvg(icon)` — returns an inline `<svg>` string; concept
  bodies are wrapped in a `stroke="currentColor"` svg, brand bodies are
  already full standalone svgs.

### IconPicker + editor wiring

- `src/lib/components/IconPicker.svelte` (new) — a centered modal with
  Concepts/Logos tabs, search, and a grid; clicking inserts the
  shortcode. Reused by both editors.
- `SlashMenu.svelte` — new `onIcon` prop + an **Icon** command
  (`action: "icon"`), so `/icon` opens the picker at the caret.
- `MarkdownEditor.svelte` and `ArticleEditor.svelte` — each got
  `iconPickerOpen` state, `openIconPicker()`, `insertIcon(name)` (inserts
  `:name:` at the caret, mirroring the link/image insert helpers), an
  **Insert icon** toolbar button (star glyph), the `onIcon` wire to
  `SlashMenu`, and the rendered `IconPicker`. `commit()`'s
  blur-guard now also checks `iconPickerOpen` so opening the picker
  doesn't drop the editor out of edit mode.

### New icons (19)

Grown the curated set from ~63 → 82 for PM / issue-tracker work:

- **Concepts** (Lucide): ticket, kanban, todo, backlog, pull-request,
  comment, flag, bell, calendar, bookmark, check, tag.
- **Logos** (Devicon): jira, confluence, trello, slack, figma, gitlab,
  bitbucket.

`scripts/gen-story-icons.mjs`'s `CONCEPTS`/`BRANDS` lists were updated to
match, so a regenerate reproduces the current `storyIcons.ts` (the
lucide-static + devicon dev-deps are still installed only transiently
for a regen, then removed — the generated file is self-contained/offline).

### Docs

`FormattingHelp.svelte` — a `:name:` row in the **Text** section plus a
dedicated **Icons** section (concepts vs logos, and the "unknown names
stay plain text" behavior).

## Notes / tradeoffs

- Icons render everywhere the shared markdown factory is used, including
  read-only surfaces (blueprint cards, flash cards) — synchronous, no
  hydration, CSP-safe (inline svg).
- No new dependency, no backend change, no migration.
- Deferred: letting `cards`/`treemap` accept icon keys in place of
  emoji; a broader BEAM logo set (Phoenix, Erlang).

## Checks

`svelte-check` 0/0 (653 files), `pnpm build` clean.
