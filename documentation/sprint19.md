# Sprint 19

Before to continue with next features we need to stop to improve what we have.

Feedback Boards - The boards are excellent, we can take this to next level:
- Boards are not present in summay, in the alexandria canvas as a node to add, or in the sidebar, it's important to have this in all those places.
- Currently we have four columns, it's fine for simple and default boards, but I'd love to change the name of the columns and also add or remove columns, this will allow me to create custom boards based on my needs.
- I'd love to add a badge to the title of the board, so I can create bagdes as tags to categorize my boards.
- When I try to move any card inside the board, I saw I select some parts of the board, this shouldn't happen.
- Currently I need to click on create a new card and the press the button to create it, this is not useful when I writting many new cards, we need to find a quick way add cards.
- I'd love to have the option to choose the color of the card, so with this I can visualize better depending on my needs.
- I'd love to allow me to create markdown badges in the card titles as well.


Markdown text - Now we have markdown in many places, we implemented some things like tables and mermaid, let's improve the styles:
- I'd love to see the word counter somewhere, so I can see how big is my text.
- In tables I'd love to see a different style for headers, that would be great.
- As I'm writting big text I have the need of identify sections, so I'd love to have a chance to put color in headers or event in the text.
- There are some errors for example when I'm writing a table after put "----" I saw a line, or if I type a tab I exit the edit view, also nested lists needs a better format (nested list needs a different bullet, number bullets should be supported)
- I want a block to add a personal comment, this section need a different style so I can recognize immediately when I'll reading a text.
- As now we have references for our entities, after remove one of then, we need to validate when there is a broken link just to avoid getting an error.

Sidebar:
- I'd love the option to collapse the sidebar and read a whole note.
- In the today list there is bug, sometimes if I didn't create the todo list for the current day I saw the previous todo list, but I still saw that list even when I created a todo list for the day. 
- Let's create a constriction about create just one todo list per day. 

---

## Implementation plan (decisions + phases)

### Locked design decisions
- **Colored text:** `{color|text}` (named palette: red, orange, amber, green,
  blue, violet, pink, gray) + `==highlight==`. Works inside headers. Custom
  markdown-it inline rules (html stays false).
- **Callout / comment block:** GitHub-style `> [!NOTE|TIP|WARNING|COMMENT]`
  blockquote alerts → colored, icon-labeled panels. Custom block post-process.
- **Badges:** `#tag` in board titles and card titles → small auto-colored pills
  (color from a hash of the tag). A shared `renderBadges()` helper.

### Phase 1 — Backend schema + commands
- **`0013_feedback_columns.sql`** — custom columns + card color + board pin:
  - `feedback_columns(id, board_id→boards, name, position, created_at)`.
  - Seed 4 default columns per existing board; recreate `feedback_cards` with
    `column_id` (mapped from old `column_kind`) + nullable `color`, drop the
    `column_kind` CHECK column. Rebuild indexes.
  - `ALTER TABLE feedback_boards ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`.
- **`0014_map_board_node.sql`** — recreate `map_nodes`/`map_edges` (0010
  pattern) adding `'feedback_board'` to the kind CHECK.
- **`0015_one_list_per_day.sql`** — dedup active lists per date (archive extras),
  partial unique index `lists(date) WHERE archived = 0`.
- `models.rs`: `FeedbackColumn`; `FeedbackCard`/`Summary` → `column_id` + `color`.
- `feedback.rs`: `create_board` seeds default columns; new `list_columns`,
  `create_column`, `rename_column`, `delete_column`; cards keyed by `column_id`;
  `update_card` gains `color`. Update tests.
- `lists.rs`: `create` returns the existing active list for that date if present
  (idempotent → one-per-day); `map.rs`: allow `feedback_board` kind.

### Phase 2 — ipc + store
- ipc: `FeedbackColumn` type + column wrappers; card `columnId`/`color`;
  `MapEntityKind += "feedback_board"`; board `pinned`.
- store: feedback columns state + actions; board pin/summary plumbing; today's
  list dedup + a single source of truth for "today".

### Phase 3 — Feedback UI
- FeedbackBoardView: render columns from data; rename/add/remove column UI;
  quick-add (Enter adds + stays); card color picker; `user-select:none` while
  dragging; `#tag` badge rendering in card titles.
- FeedbackBoardsView / Summary / Sidebar: board badges, Boards tab, pinned
  boards section. Canvas: board node kind in palette + MapNodeCard.

### Phase 4 — Markdown
- `markdownit.ts`: `{color|text}`, `==highlight==`, `[!alert]` callouts, plus a
  `countWords()` util and a shared `renderBadges()`.
- Editors: word counter in the toolbar; Tab inserts spaces (no blur);
  table-header CSS; nested-list bullets (disc/circle/square, decimal/alpha/roman);
  fix stray `<hr>` from `----`; broken entity links → flash, not `app.error`.

### Phase 5 — Sidebar
- Collapse toggle (hide sidebar, full-width content, floating re-open button).

Each phase gated on `cargo check` / `npx svelte-check` / `pnpm build`.

---

## What shipped

**Feedback boards**
- **Custom columns** — new `feedback_columns` table (migration `0013`, recreates
  `feedback_cards` keyed on `column_id`, maps old `column_kind`). `create_board`
  seeds the 4 defaults; `list/create/rename/delete_column` commands. UI:
  data-driven columns in `FeedbackBoardView`, click-to-rename headers, "+ Add
  column", delete (confirms; cascades cards). Horizontal scroll for many columns.
- **In Summary / sidebar / canvas** — boards added `pinned`; "Boards" Summary
  tab, pinned-boards sidebar section, and `feedback_board` canvas node (migration
  `0014`, palette + `MapNodeCard`).
- **`#tag` badges** in board + card titles (`$lib/badges.ts`, `TagBadges.svelte`)
  — used in board view, boards index, Summary, sidebar, cards, card panel.
- **Drag selection bug** — `select-none` on the board while a pointer press is
  active (plus the existing per-card `select-none`).
- **Quick add** — `+ Add card` opens an inline input; Enter adds the card and
  keeps the input focused for the next; blur commits a pending title; Esc closes.
- **Card color** — nullable `color` + `set_feedback_card_color`; swatch picker in
  `FeedbackCardPanel` (`$lib/cardColors.ts`); shows as a left accent stripe.

**Markdown** (`$lib/markdownit.ts` + shared CSS in `app.css`)
- `{color|text}` named colors + `==highlight==` (custom inline rules; work in
  headers). `> [!NOTE|TIP|WARNING|COMMENT|IMPORTANT|CAUTION]` callout panels.
- Distinct table-header style; nested-list bullets (circle/square,
  lower-alpha/roman). Word counter in the editor toolbars.
- Tab inserts two spaces instead of blurring the editor. `lheading` disabled so
  `text` + `----` no longer becomes a surprise heading.
- Broken entity links (target deleted) → a flash, not an error screen
  (`navigateEntity` existence-checks the store before navigating).

**Sidebar**
- Collapse toggle (button in the sidebar header + re-open button in the toolbar
  row; **⌘\\**) for full-width reading.
- One active todo list per day: `create_list` is idempotent per date and a
  partial unique index `lists(date) WHERE archived = 0` enforces it (migration
  `0015`, which first archives existing duplicates). This removes the stale /
  duplicate "today's list" the sidebar showed.

**Verification:** `cargo test --lib` 86 pass · `svelte-check` 0 errors · `pnpm
build` ok · migrations `0013–0015` apply to the live DB (3 boards → 12 columns,
29 cards mapped) with no error on boot.

## Deferred / notes
- Column **reordering** (drag columns) isn't implemented — add/rename/delete +
  append only. Cards reorder/move across columns as before.
- Deleting a board leaves any canvas node it had as a "Missing board" card until
  removed (map nodes aren't FK-linked to entities); it renders gracefully.
