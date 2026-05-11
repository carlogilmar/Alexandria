# Sprint 2

## Sprint 1 recap

We built the foundations of our application, this document is for continue the development together.

## Sprint 2

### Features

Welcome Page
- I'd love the have a welcome page with some stats of my todo lists
- The welcome page should include a github stats visualization (grids of days, a day with all todos marked as completed should be in green, if not, it should be in red, if the day doesn't have at least one list that day should be in gray)

Lists
- Every time I click on some item the detailed view should be displayed, now it just happens when I click on the button
- Include a help section to visualize shortcuts
- Every item should be able to reorder, now it's not possible
- Let's work on define a good visualization to quatinfy the number of tasks in a current day, and the ones completed.

---

## Implementation notes

### What was built

**Welcome / Home view (`Welcome.svelte`)**
- New "Home" entry pinned at the top of the sidebar — app boots into this view now; clicking a list still switches to the list view.
- Four stat tiles at the top: Today's `done/total`, Streak (days), Total todos, Perfect days (`perfect / active` where active = day with at least one todo).
- GitHub-style grid covering the last ~53 weeks (371 cells, Sun → Sat columns). Color rules per the spec:
  - **green** — all todos for that day were completed
  - **red/rose** — had todos but not all completed
  - **gray** — no list that day (or future date, rendered transparent)
- Each cell has a tooltip with the date + `done/total` count. Month labels run across the top.

**Click row → details**
- The whole todo row body is now a button that opens the Inspector. Checkbox and delete still work and don't bubble (stopPropagation).
- Inline text editing on the row is removed; the Inspector now has an editable **Task** input at the top so the text can still be edited (Enter / blur commits, Esc reverts).
- The chevron button was removed since the row click does the same thing.

**Help modal (`HelpModal.svelte`)**
- Triggered by `?` (only when no input/textarea is focused) or by clicking **Shortcuts** at the bottom of the sidebar footer.
- Lists every keyboard shortcut. `Esc` closes the modal (and also the inspector when no modal is open).

**Progress visualization**
- Slim horizontal progress bar under the list header. Fills proportionally to completion; turns **green** when 100% done.
- The `done / total` count next to the bar also turns green at 100%. Removed the trailing word "done" for less visual noise.

**Drag-to-reorder discoverability**
- The `⋮⋮` drag handle is now always visible (was hover-only).
- The whole `<li>` is the drag source as before — no change to the actual reorder mechanism, just made it more obviously interactive.

**Backend additions**
- New command `get_daily_stats(from?, to?)` returns `Vec<DayStats { date, total, done }>` aggregated per date (multiple lists for the same date are summed). Archived lists excluded.
- 3 new unit tests (44 total: aggregation correctness, archived exclusion, range filter).
- Store refreshes `dailyStats` on every mutation so the welcome grid stays current.

### Open question — please confirm

The "Every item should be able to reorder, now it's not possible" line is the one place I had to guess. Drag-and-drop reorder for **todos** has been working since Sprint 1; I've just made the handle always visible to surface it. If you actually meant something else by "every item", here are the candidates:

1. **Reorder lists in the sidebar** — within the same day (multiple Today lists), or arbitrary user-defined ordering of past lists across months. This would need a `position` column on `lists` and a `reorder_lists` command.
2. **Reorder *something specific* you tried to drag and it didn't work** — e.g., sidebar items, tag chips, etc. If you have a specific case, I'll fix that.
3. **Todos already reorder fine** — just confirm and we move on.

Let me know which and I'll add it to Sprint 3 (or fix straight away if it's a bug).

---

## Sprint 3 candidates

Carrying over for next iteration:
- **Restore-archived UI** — backend already supports `restore_list`; sidebar needs a toggle to "Show archived" and a restore action.
- **Tag filter** — clicking a tag chip filters the list to only that tag.
- **Search filter chips** — open / done toggle in the search results (backend already supports `completed: Option<bool>`).
- **Weekly review** — a richer Welcome panel that summarizes the last 7 days inline (not just the heat-map cells).
- **Recurring todos** — explicitly out of scope for v1, but worth defining if you want them later.
