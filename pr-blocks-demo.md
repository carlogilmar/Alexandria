# Remove the Article entity

Powered markdown (link cards, entity links) absorbed the article's
"wrap other entities" role, so articles were just notes. This PR retires
the entity and migrates its data into notes.

> [!NOTE]
> Paste this whole file into a new note in Alexandria, then click outside
> to render. Hover any files/stats/spec/cards block for a 📷 "copy as image"
> button — click it to paste the block straight into a PR.

## At a glance — stats + spec

Both follow a surface theme (default `github`; also light · dark · midnight ·
slate). `+N` / `−N` stay green/red.

End any line with `pulse` to make that one item breathe (here: Tests).

```stats
heading: At a glance
Lines: +12 / −858
Files: 8
Migrations: 1
Tests: 90 ✓ pulse
```

The spec sheet takes inline markdown in values. Here in the `slate` theme:

```spec slate
heading: Migration plan
Risk: **Low** — additive drop, no data kept
Migration: `0027_drop_articles.sql`
Rollback: revert the migration
Touches: notes · search · ipc · store · Library
```

## New block #1 — Cards with a section header

The first block sets a `heading:` (+ optional `desc:`) → a GitHub-style header
bar (title · subtitle · card count) above the grid. The rest are normal cards.

```cards
heading: Key links
desc: The surfaces a reviewer needs
---
title: CI pipeline
desc: Green run required before merge
link: https://example.com/ci
color: blue
icon: 🟢
---
title: Migration
desc: 0027_drop_articles.sql
link: blueprint:1
color: violet
icon: 🗄
---
title: Runbook
desc: How to roll back
link: https://example.com/runbook
color: amber
icon: 📖
```

## New block #2 — Changed files

One file per line: `STATUS path [+adds] [-dels] — note`.
Status is `A` (add), `M` (modify), `D` (delete), or `R` (rename).

The status colors the row, the path splits into dimmed dir + bold filename, a
header sums the totals, and the note is a description row with inline markdown.

```files
A src-tauri/migrations/0027_drop_articles.sql +5 — Drops the `articles` table. Data is discarded; the author migrated content into notes first.
D src/lib/components/ArticleView.svelte -408 — The whole entity view; **notes** cover this now.
D src/lib/components/EmbedBlock.svelte -190 — The only `{{…}}` transclusion surface — gone with articles.
M src/lib/stores/app.svelte.ts +3 -96 — Removes the article slice: state, view value, all `*Article*` methods.
M src/lib/components/ActivityView.svelte +2 -41 — Weekly Kandinsky cell drops to 2 figures (notes · lists).
R src/lib/components/SummaryView.svelte — Folded into the unified Library.
```

## Test plan

```workflow
Run `pnpm tauri dev` to apply migration `0027`
Confirm the `Library` no longer lists articles
Check `/files` and `/cards` render in a note
`cargo test --lib` → 90 passing
```

## Impact

| Area          | Change                                  |
| ------------- | --------------------------------------- |
| Notes         | Unaffected (articles migrated in)       |
| Activity view | Weekly cell now shows 2 figures         |
| Entity links  | `article:` links now inert              |

> [!WARNING]
> Any old `{{article:5}}` embed or `[label](article:5)` link is now inert.

## Collapsible sections

Prefix a heading with `>` to make it a **toggle section** — collapsed by
default, so a long note reads as a summary you expand on demand.

### > Implementation details

This whole block is hidden until you click the heading. It runs down to the
next same-or-higher heading.

```files
M src/lib/markdownit.ts +90 — addCollapsibleSections + installSectionToggle
M src/app.css +55 — .md-section styles
```

### > Rollout notes

Another collapsed section. Nested toggle headings work too (a deeper `>`
heading inside becomes its own fold).

---

_Written in Alexandria · powered markdown_
