# Sprint 51 — Remove the Article entity

## Why

Articles were originally the entity that could *wrap* others (inline
`{{note:5}}` embeds). Powered markdown — link cards, entity links —
absorbed that role, so articles were effectively just notes with a
different name. The author migrated their articles into notes manually,
so the entity is retired (same playbook as the Workflow removal).

## What shipped (full-stack removal)

**Backend**
- Migration `0027_drop_articles.sql` (DROP `articles`; data discarded).
- Deleted `commands/articles.rs` (+ `mod.rs` decl, 8 handler regs).
  Removed models `Article` / `ArticleSummary`.
- `WeeklyActivity` lost its `articles` count. `activity_stats` (the
  contribution graph) and `get_mirror` no longer query articles. The
  `mirror_collects_*` test now expects 2 today-entities (note + blueprint).

**Frontend**
- Deleted `ArticleView`, `ArticleEditor`, **and `EmbedBlock`** (the only
  user of `{{…}}` transclusion — gone with articles; notes never embedded).
- `ipc.ts`: removed the Article types + wrappers + `WeeklyActivity.articles`
  + `article` from `MirrorKind`.
- `stores/app.svelte.ts`: removed the whole article slice (state, the
  `article` view value + NavLoc, `select/new/rename/updateBody/delete/…`,
  per-kind pin/archive/delete, the **quick-article** feature
  [`quickArticleId`, `toggleQuickArticle`, `openQuickArticle`, ⌘⇧A], init
  load, nav switches).
- Removed the `article` kind everywhere it was woven: `LibraryView`,
  `Sidebar` pins, `AddEntityModal`, `CommandPalette`, `EntityLinkPicker`,
  `IdChip`, `MarkdownEditor` (entity-link regex + navigate), `markdownit`
  (CARD_ENTITY), `Welcome` (empty-state + "Jump back in"), `MirrorView`
  (type/label/hue/navigate/copy), `HelpModal` (⌘⇧A), `+page` (import /
  view / label / dispatch / shortcut).
- `ActivityView`: the Kandinsky weekly cell now shows **2 figures**
  (notes · lists) instead of 3 — the article rounded-square / TR quadrant
  is gone (legend + caption + hover updated).

## Notes / tradeoffs

- **Embeds are gone.** Removing articles also removed the only surface
  that transcluded entities. Any old `{{article:5}}` / `{{note:5}}` embed
  or `[..](article:5)` link is now inert. Acceptable per the migration.
- The Activity weekly grid is now sparse (2 of 4 quadrants). Fine for now;
  could be repurposed later (e.g. blueprints/storyboards) if wanted.

## Checks

`cargo test --lib` 90 pass, `svelte-check` 0/0, `pnpm build` clean.
Migration `0027` is additive-drop — run `pnpm tauri dev` once to apply.
