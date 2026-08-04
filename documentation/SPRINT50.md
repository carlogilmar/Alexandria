# Sprint 50 — Remove the Workflow entity; add a ```workflow markdown block

## Why

The author doesn't create workflows (a handful existed). The full CRUD
entity — its own table, view, editor, sidebar section, entity links,
embeds, Library kind, Activity dimension — was dead weight. Replace it
with a lightweight **```workflow markdown block** that gives the same
numbered-step-chain style inline in notes/articles.

## Part A — the ```workflow markdown block

- `$lib/markdownit.ts` `renderWorkflow(source)` (synchronous fence, like
  the other blocks): one step per non-empty line; `` `backtick` ``
  segments render as tag badges — matching the old entity's style.
- CSS `.md-workflow` in `app.css`: numbered blue bullets joined by a
  connector line, `.md-wf-tag` badges (light/dark).
- Slash command "Workflow (steps)" (`SlashMenu`), a FormattingHelp row.

```workflow
Open a `pull request`
Get two approvals
Merge to `main`
```

## Part B — remove the entity

**Backend**
- Migration `0026_drop_workflows.sql` (DROP `workflow_steps`, `workflows`;
  data discarded).
- Deleted `commands/workflows.rs` (+ `mod.rs` decl, 13 handler regs in
  `lib.rs`). Removed models `Workflow`/`WorkflowSummary`/`WorkflowStep`.
- `WeeklyActivity` lost its `workflows` count (the Activity view's weekly
  figures) — dropped from the model + the `weekly_activity` SQL.

**Frontend**
- Deleted `WorkflowView.svelte` (and the unused legacy `IndexView.svelte`).
- `ipc.ts`: removed the Workflow types + all workflow wrappers + the
  `WeeklyActivity.workflows` field.
- `stores/app.svelte.ts`: removed the whole workflow slice (state, the
  `workflow` view value + NavLoc, `select/new/rename/…Workflow*`, step
  CRUD, the per-kind pin/archive/delete cases, init load, nav switches).
- Removed the `workflow` kind everywhere it was woven in: `LibraryView`,
  `Sidebar` (unified pins), `AddEntityModal`, `CommandPalette`,
  `EntityLinkPicker`, `IdChip`, `EmbedBlock` (`{{workflow:id}}`),
  `MarkdownEditor`/`ArticleEditor` (entity-link + embed regex + navigate),
  `ArticleView`/`ArticleEditor` placeholders, `Welcome` (empty-state check),
  `+page.svelte` (view/label/dispatch).
- `ActivityView`: the Kandinsky weekly cell now shows **3 figures**
  (notes · articles · lists) instead of 4 (the workflow diamond / BL
  quadrant is gone), plus legend + caption + hover updated.

**Kept:** `storyIcons.ts` still carries a `workflow` concept icon (used by
the Storyboard icon picker) — harmless, unrelated to the entity.

## Checks

`cargo test --lib` 95 pass, `svelte-check` 0/0, `pnpm build` clean.
Migration `0026` is additive-drop — run `pnpm tauri dev` once to apply.
