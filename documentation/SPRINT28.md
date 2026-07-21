# Sprint 28 — Focus mode (aurora "screensaver" for today's tasks)

## Why

A calm, full-screen place to look at *only* today's tasks. The rest of
the app is a workbench; this is the opposite — a distraction-free
"screensaver" you drop into to see and check off what matters right now,
against a moving aurora backdrop. Requested directly by the user:
"a button to enter this screensaver, animated auroras, and I want to see
my todo list there so I can focus on my important tasks."

## What it is

A full-screen **overlay** (not a new `app.view`) that floats above
everything:

- **Animated aurora backdrop** — reuses the Sprint 23 aurora treatment
  (three drifting blurred color blobs + an feTurbulence noise film).
  Colors come from `theme.auroraColors` when the active sidebar tint is
  an aurora; otherwise a default teal/green/indigo palette. The
  backdrop is always dark-on-color (this is a lights-down mode) and is
  reduced-motion safe.
- **Live clock + date** — a large, thin time readout (updates every
  second) and the long date, centered above the list.
- **Today's list** — the todos for today's list rendered as big,
  clickable checkable rows. Completed rows dim + strike. A small
  "N of M done" caption. If there is **no** list for today, an empty
  state with a single "Create today's list" button (reuses
  `newList()`).
- **Exit** — an ✕ button top-right and **Esc**. No new global shortcut
  is bound (the webview reserves too many; see the memory note); entry
  is a button.

## Entry points

- A **moon/stars icon button in `TopNav.svelte`** (after the theme
  toggle) — "Focus mode".
- A **command-palette quick action** ("Enter Focus mode").

## Design decisions

- **Overlay, not a view.** Entering/exiting Focus must not disturb the
  navigation stack or the currently open entity. An overlay driven by a
  single boolean (`app.focusMode`) keeps the underlying view untouched,
  which is exactly the screensaver mental model.
- **Independent todo state.** Focus loads today's list into its own
  `focusTodos` / `focusListId` / `focusListTitle` fields via the
  existing `listTodos` IPC, rather than reusing `this.todos`. That means
  entering Focus never clobbers whatever list/entity is open behind it.
  Toggling a task there calls `toggleTodo`, updates `focusTodos`, and —
  if that same list happens to be the one selected underneath — syncs
  `this.todos` too, then `refreshLists()` so sidebar/Home counts stay
  live.
- **Today's list only** (chosen over "current-or-today" / "all pinned").
  Predictable daily ritual; matches "my important tasks."
- **No auto-create.** Consistent with Sprint 11 — Focus shows an empty
  state and only creates today's list when the user clicks the button.

## Files

- `documentation/SPRINT28.md` — this doc.
- `src/lib/stores/app.svelte.ts` — `focusMode` / `focusTodos` /
  `focusListId` / `focusListTitle` state + `enterFocus()` /
  `exitFocus()` / `toggleFocusTodo()` / `createFocusToday()`.
- `src/lib/components/FocusMode.svelte` — the overlay (aurora + clock +
  list). New component; aurora CSS mirrored from `Sidebar.svelte`.
- `src/routes/+page.svelte` — render `<FocusMode/>` when
  `app.focusMode`; Esc closes it (handled in the component).
- `src/lib/components/TopNav.svelte` — the Focus icon button.
- `src/lib/components/CommandPalette.svelte` — "Enter Focus mode" action.

## Not doing

- No persistence of Focus state across reloads (it's transient).
- No per-list picker inside Focus (today's list is the contract).
- No new keyboard shortcut for entry (button + palette only).
