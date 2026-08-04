# Sprint 47 — "Library" (consolidates Summary + Blueprints + Feedback + Storyboards)

## Why

Four views were the same thing wearing different hats — a list of entities
with open / pin / archive / delete:

- **Summary** (`SummaryView`) — a section-rail catalog of everything.
- **Blueprints index** (`BlueprintsView`) — a list + "New blueprint".
- **Feedback index** (`FeedbackBoardsView`) — a list of boards + "New board".
- **Storyboards index** (`StoryboardsView`) — a list + "New storyboard".

The only thing the three dedicated views added over Summary was a "+ New"
button. The UX also didn't scale — Summary was a dense text list with no
search / sort / view options.

**The Library** replaces all four with one view: types become *filters*
(horizontal chips, so it coexists with the app's existing left sidebar
instead of adding a second rail), creation is contextual, and it gains the
things a big collection needs — search, sort, a grid/list toggle, and
pinned-surfaces-to-top. Prototyped as an Artifact mockup and approved.

## What shipped

### `LibraryView.svelte` (new, replaces the four)

- **Toolbar**: title · search (filters by title) · sort (Recently updated /
  Title A–Z / Type) · grid⇄list toggle · **+ New** (opens the existing
  `AddEntityModal`).
- **Filter chips** (horizontal): `All · Pinned │ Notes · Articles ·
  Blueprints · Boards · Storyboards · Workflows · Flash cards │ Archived`,
  each with a type colour dot + live count.
- **Cards** (or list rows): type colour accent + icon, title (`#tag` badges
  via `TagBadges` for boards/flashcards), a meta line (updated date + a
  type-native metric — nodes / pages / cards / steps, straight off the
  existing summaries), a pin toggle, and hover actions
  (rename* / archive / delete; restore / delete under Archived).
  *Rename is offered for blueprint / board / storyboard (the kinds whose old
  views had inline rename) via `app.renameBlueprint` /
  `renameFeedbackBoard` / `renameStoryboard`.
- **Pinned** surfaces to the top of every all/type view.
- All actions reuse existing store methods (the same ones the old Summary
  called: `selectNote`/`openBlueprint`/…, `set*Pinned*`, `set*Archived`,
  `delete*`). No backend, no ipc, no store changes.

### Low-risk wiring

The four `app.view` values (`index` / `blueprints` / `feedback` /
`storyboards`) and their open methods / shortcuts / TopNav icons are **kept**
— they now just render `LibraryView` with a different `initialKind` prop:

- `index` → all · `blueprints` → blueprint · `feedback` → board ·
  `storyboards` → storyboard.

So ⌘3 = the Library, and ⌘2 (Blueprints) / ⌘5 (Feedback) open it
pre-filtered. Nav history, restore, and the entity editors (BlueprintView /
FeedbackBoardView / StoryboardView) are untouched.

The now-redundant **TopNav Blueprints + Feedback icon buttons were removed**
(the Library is the place to browse those); their ⌘2 / ⌘5 shortcuts still
work (routing to the pre-filtered Library), and the Library hub icon is
`active` for `index` / `blueprints` / `feedback` / `storyboards`.

### Labels

TopNav "Summary" → "Library"; `+page.svelte` section labels for the four
index views → "Library"; CommandPalette / HelpModal / Welcome / Sidebar
copy updated ("Pin items from the Library…").

### Removed

`SummaryView.svelte`, `BlueprintsView.svelte`, `FeedbackBoardsView.svelte`,
`StoryboardsView.svelte`.

## Scope / deferred

- **Daily Lists** are NOT in the Library (they live in Home / the calendar).
  Summary used to list them; that's the one coverage change.
- **Card thumbnails** (a mini blueprint/storyboard canvas) — a natural
  fast-follow that would make grid mode sing; not in v1.
- Contextual "+ New <type>" when a type filter is active — v1 just opens the
  full AddEntityModal.

## Checks

`svelte-check` 0/0, `pnpm build` clean.
