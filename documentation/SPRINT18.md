# Sprint 18 — UI follow-ups: toolbar row (no overlap), last-updated footer, dark sidebar tints

> Three fixes after Sprint 17 landed: the floating nav menu overlapped some
> views' own top-right buttons; notes/articles/workflows had no visible
> "last edited" stamp; and the sidebar tints didn't include the darker /
> black looks the user wanted.

## 1. Top nav menu overlapped view controls (bug)

Sprint 17's `TopNav` was `position: fixed` at the top-right, so on some views it
sat on top of that view's own top-right controls (the note/article **Edit**
button, pin/delete, garden/map overlay controls…).

**Fix — give it a real row instead of floating.** `+page.svelte` now wraps the
content in a main column:

```
<div class="flex h-screen overflow-hidden">
  <Sidebar/>
  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <div class="flex h-11 shrink-0 items-center justify-end px-3" data-tauri-drag-region>
      <TopNav/>            <!-- reserved 44px toolbar row -->
    </div>
    <div class="flex-1 overflow-y-auto"> …views… </div>
  </div>
  {#if list}<Inspector/>{/if}
</div>
```

`TopNav` dropped its `fixed right-3 top-2` and is now a normal cluster in that
row; its tint popover anchors with `absolute right-0 top-full` (root is
`relative`) instead of fixed-to-viewport.

Because the scroll area is now 44px shorter than the viewport, views that
assumed full viewport height were adjusted so they fit without spurious
scrollbars / clipping:

- Full-bleed (canvas/flex-fill): `h-screen` → **`h-full`** in `MapEditor`,
  `GardenView`, `ActivityView`, `FeedbackBoardView`. Safe because each measures
  its own container (`clientWidth/clientHeight`), not `window`.
- Padded scroll pages: `min-h-screen` → **`min-h-full`** in `ListView`,
  `NoteView`, `ArticleView`, `WorkflowView`, `SummaryView`,
  `FeedbackBoardsView`, and the FeedbackBoard empty-state.

`h-full`/`min-h-full` resolve because the scroll area has a definite height
(flex child of the fixed-height shell).

## 2. "Last updated" footer on note / article / workflow

New `$lib/format.ts` → `formatTimestamp(raw)` (parses the SQLite
`"YYYY-MM-DD HH:MM:SS"` UTC string → local "May 29, 2026, 2:30 PM"). Added a
footer to `NoteView`, `ArticleView`, `WorkflowView`:

```svelte
<footer class="mt-auto pt-8 text-xs text-neutral-400 dark:text-neutral-500">
  Last updated {formatTimestamp(app.selectedNote.updatedAt)}
</footer>
```

`mt-auto` (the views are `flex flex-col min-h-full`) pins it to the bottom when
content is short, and it trails the content when long. All three full models
already carry `updatedAt`, and the selected entity is reassigned on save, so the
stamp updates reactively. (WorkflowView keeps its existing header "Updated …"
too; the footer reuses its `formatUpdatedAt`.)

## 3. Darker sidebar tints

`SIDEBAR_TINTS` gained dark-surface entries — **ink (black), graphite, navy,
forest, wine** — each flagged `dark: true`. The challenge: a dark sidebar in
**light** app mode would render the sidebar's dark-on-light text invisible.

**Fix:** when a `dark` tint is active, the `aside` adds a local `dark` class
(`class:dark={theme.isSidebarDark}`). Tailwind's variant is
`@custom-variant dark (&:where(.dark, .dark *))`, so every `dark:` utility
inside the sidebar activates — the whole rail flips to light-on-dark
**regardless of the app theme**. The logo also switches to `logo-dark.png` when
`theme.isSidebarDark`.

`theme.applyTint()` writes a deeper, mostly-opaque `--sidebar-bg` for dark tints
(same in light and dark mode); translucent hue tints and neutral are unchanged.
`theme.isSidebarDark` is a getter over the selected tint's `dark` flag. The
`TopNav` swatch picker shows dark swatches for these and wraps to two rows.

## Round-trip checks

- `npx svelte-check` — 0 errors. `pnpm build` — succeeds.
- Manual: no view's top-right buttons sit under the nav menu anymore; canvases
  (map/garden/activity/board) fill the area below the toolbar with no clipping;
  notes/articles/workflows show "Last updated …" at the bottom and it refreshes
  on save; picking ink/graphite/navy/… gives a dark sidebar with readable light
  text in both light and dark app themes, persisted across restart.

## Note on the "workflow" keyword

This request mentioned "workflow" as the *entity* ("bottom of every note,
article, or workflow"), not a request for multi-agent orchestration — so it was
implemented directly, not via the Workflow tool. (Three small interdependent
edits on shared files; a fan-out would have added cost and merge risk for no
benefit.)
