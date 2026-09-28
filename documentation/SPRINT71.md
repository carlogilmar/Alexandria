# Sprint 71 — Task polish: manual time, ⌘E on task notes, Home WIP, legibility

A batch of follow-ups after living with Sprints 69–70. All small, all task-facing.

## 1. Manually set a task's tracked time

"If I have a task without this [tracked time], I should be able to add it
manually." Not every task gets timed via the WIP button, and figures sometimes
need correcting.

- Backend **`set_todo_work_seconds(id, seconds)`** (`commands/todos.rs`) sets the
  accumulator directly; if the task is currently **WIP** it also restarts
  `wip_started_at = now` so the new total takes effect immediately (rather than
  fighting the live tick). Rejects negatives. 1 test. **No migration** (reuses
  the `work_seconds` column).
- In the **task detail modal**, the tracked-time readout is now a button
  (shows **"add time"** + a pencil when zero). Click → inline **h / m** number
  inputs → **Save** (or Enter; Esc cancels without closing the modal). Store:
  `setTodoWorkSeconds`.

## 2. ⌘E on the task note

"In notes we have ⌘E to edit/show — can we implement this for the task note?"

- The Inspector's Description editor now toggles edit ⇄ preview with **⌘E**,
  exactly like `NoteView`: the `MarkdownEditor` instance is bound
  (`bind:this`) and a contextual `<svelte:window onkeydown>` calls
  `editor.toggleEdit()`. Only active while the modal is open; it ignores ⌘E
  while the title / tag / time inputs are focused so it won't hijack them.

## 3. Work-in-progress on the Home "Today" card

"On the home page we show today's list — can we add the WIP section there too?"

- `Welcome.svelte` splits `homeTodos` into **In progress** (an amber subheader +
  the rest below a divider). WIP rows show a **live ticking timer** (a 1s `clock`
  that runs only while something is WIP), and every non-done row gained a
  **▶ Start / ⏸ Pause** control (start on hover, pause always visible while
  running). Store: **`setHomeTodoStatus`** (mirrors `toggleHomeTodo` — updates
  `homeTodos`, syncs `this.todos` if that list is open behind Home, refreshes).

## 4. Legibility + a duplicate button

- **Meta badges:** the age + tracked-time on task rows were faint gray and hard
  to read. They're now **pill badges** with real contrast — age = a neutral pill
  with a calendar glyph; tracked time = an **indigo** pill with a clock glyph
  (so the important number stands out); the live WIP timer stays amber.
- **Removed the duplicate "Open list →"** button from the Home Today card — the
  header's "Open today's list" button already does the same thing.

## Files

`commands/todos.rs` + `lib.rs` (command reg) + `ipc.ts` (`setTodoWorkSeconds`);
`Inspector.svelte` (time editor + ⌘E), `Welcome.svelte` (Home WIP section),
`TodoRow.svelte` (meta badges), `stores/app.svelte.ts`
(`setTodoWorkSeconds`/`setHomeTodoStatus`).

`cargo test` (98) + `svelte-check` (0/0) + `build` pass. Interactions want a
live `pnpm tauri dev` run.
