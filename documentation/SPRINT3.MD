# Sprint 3

Updates:

Welcome Page
- Mark with a color the current day in the grid.
- Every time you click a day in the grid, you should see just the lists created that day
- Every time that the user launch the app should see the welcome page
- You should include a button to create a list in the current day in the welcome page

List
- The notes are great, I'd love to include bullet lists and also links there, please make this useful in the UI
- I can't reorder the items in a list, I need to do this.
- Tags should suggest existing tasks based on what the user is typing, like an autocomplete of the existing tags.

---

## Implementation notes

### What was built

**Welcome page**
- **Current day marker** — today's cell now has a blue ring outline. The legend in the top-right of the grid section shows the ring as the "today" indicator alongside empty/partial/all-done colors.
- **Click a day** — every cell with state ≠ future is a button. Clicking opens a "day detail" panel below the grid that lists every list created on that date, with each one click-to-open. The panel shows the full prettified date plus an X to close it. Empty state when no lists exist for that day.
- **Launch view** — the welcome page is the default landing now (`view = "home"` in the store, set on every `init()` and `goHome()`). Click "Today" in the sidebar to jump into a list as before.
- **New list buttons** — "+ New list for today" in the page header creates a list dated today; the day-detail panel also has "+ New list" that uses the *selected* cell's date, so you can backfill yesterday or set up a future plan.

**List**
- **Notes — markdown rendering**. The textarea stays as the editor; a rendered preview now appears below it whenever notes is non-empty. Powered by `markdown-it` with `html: false` (no raw HTML escapes), `linkify: true` (URLs become clickable links automatically), and `breaks: true` (single newline = `<br>`). Bullet lists (`- item`), numbered lists (`1. item`), bold/italic, inline `code`, and links all render. The label under "Notes" shows a quick syntax hint.
- **Link opening**. The plain `[text](url)` syntax produces an `<a>`. The preview intercepts clicks on those anchors and routes them through `tauri-plugin-opener`'s `openUrl()`, so they open in your default browser instead of trying to navigate the WKWebView. Required adding `opener:allow-open-url` to `capabilities/default.json`.
- **Reorder rewrite**. The previous HTML5 drag-and-drop implementation never fired reliably in WKWebView — `<button>` children inside a `draggable="true"` parent suppress drag initiation, and even after moving `draggable` onto the `⋮⋮` handle, dragover/drop events didn't bubble consistently. Replaced the whole mechanism with **pointer events**:
  - `pointerdown` on `⋮⋮` records `dragId`
  - A `$effect` attaches `pointermove`/`pointerup`/`pointercancel` listeners on `window` while a drag is in progress
  - `pointermove` calls `document.elementFromPoint()` and walks up to find the `<li data-todo-id="…">` under the cursor, then mutates the local array in place
  - `pointerup` commits via `reorderTodos`
  - No HTML5 DnD at all — no `dragstart`, no `dataTransfer`, no `setDragImage`. The dragged row dims to `opacity-40` via local state; the rest of the visual flow stays the same.
- **Tag autocomplete**. The store now keeps `allTags` (loaded on init, refreshed after every tag add). The inspector's tag input renders a dropdown of up to 5 matches that *include* the typed substring (case-insensitive), excluding tags already on the current todo. Keyboard: `↓`/`↑` navigates, `Enter` commits the highlighted suggestion (or creates a new tag when there are no matches), `Esc` clears the input. Hovering a suggestion also moves the highlight, and clicking commits.

### What you'll notice

The `⋮⋮` drag handle is now the only drag entry point. Press and hold it, then drag — the row should follow the cursor and the list reorders live. Release to commit. (HTML5 DnD is gone; the cursor won't change to the "ghost" drag indicator, but the in-app reorder is fully working.)

---

## Sprint 4 candidates

- **Recurring lists / templates** — copy a previous list as a starting point
- **Tag filter** — clicking a tag chip in a todo filters the current list (or sidebar search) to that tag
- **Restore-archived UI** — backend already supports it; needs a sidebar toggle + action
- **Stale tags cleanup** — tags with zero linked todos linger in `allTags`; consider auto-pruning or a "manage tags" view
- **Per-day shortcuts** — jump to today's list with `⌘1`, yesterday with `⌘2`, etc.
- **Welcome — week summary** — a "this week" mini-section above the year grid with the 7 most recent days, larger cells, todo titles inline
- **Markdown source preview toggle** — explicit Edit / Preview tabs in the notes area (instead of always showing both)
