# Sprint 12:

## Feedback Planning

Necesito encontrar una forma de escribir un feedback que quiera implementar, este feedback podría ser una serie de ideas que quiero implementar, es un primer paso para llevalor a la realidad, aquí necesito poder agregar mi idea y también acompañar de algún comentario. 

Por ejemplo:

Feeback Mayo

1. Hacer coffee meetings con miembros del equipo
    - Preguntarle al manager con quién puedo platicar
2. Mentorship sessions con andy
    - Constuir una relación de mentorship

El objetivo es poder aterrizar ideas maduras y no-maduras y experimentar con ellas, este espacio me permitirá madurar las ideas de feedback recibido que quiero implementar para mejorar, para ello la presentación visual es muy importante para poder visualizarlo como un mapa cartográfico.

Planear feedbacks es una actividad que será recurrente, no sé si es mejor tener varios archivos de feedback o uno solo. 

La implementación podría ser similar a la de Alexandria, un canvas de React Flow con nodos y comentarios que se conecten entre ellos, y así en un canvas infinito podría ver todo lo que voy recorriendo.

## Timeline 

Actualmente el apartado de visualización es muy bueno, tenemos una opción de timeline ya ahí, sin embargo ahora necesito evolucionar en otro apartado diferente al visualización de lo que voy creando, para ello, me gustaría poder visualizar por semana el contenido que voy creando, que visualmente sea muy claro por semana la cantidad de elementos que voy generando, quiero poder distinguir en un zoom in/out la comparación entre semanas, ver en qué semana cree más contenido, en cuál menos, esto ayudará a ver mi progreso, a dar hipótesis de qué ocurrió, y es un feedback visual importante.

---

## Technical Proposal — v2

> Rewritten per feedback: Alexandria stays the **single canvas** for the
> knowledge base; everything else helps structure work *around* it.
> Feedback gets its own simple **kanban** (multiple boards, columns,
> drag-and-drop). Activity becomes a **Kandinsky-inspired grid** where
> each week is a tiny geometric composition.

Two new top-level views, **zero changes to Alexandria**.

### Part 1 — Feedback Kanban (new dedicated section)

#### Framing

Feedback planning is *process work*, not knowledge structuring. The user
has a handful of ideas that ripen through stages — heard, considered,
started, finished. A kanban board is the canonical shape for "move
ideas across columns as they mature", and it's the opposite of a canvas:
structured columns, dense cards, drag-to-move.

Multiple boards are first-class — one per cycle ("Feedback Mayo",
"Feedback Junio", "Q3 reflections" …). Each board has a fixed 4-column
layout. Boards can be archived when the cycle is over without losing
history.

#### Visual model

```
┌─ Feedback Mayo ───────────────────────────────── + Add card ───┐
│  TO IMPLEMENT      IN DEFINITION    IN PROGRESS       DONE     │
│  ┌─────────────┐   ┌─────────────┐  ┌─────────────┐  ┌────────┐│
│  │ Coffee mtgs │   │ 1:1 cadence │  │ Mentorship  │  │Skip-lvl││
│  │ — ask mgr   │   │ — biweekly  │  │ with Andy   │  │ chat   ││
│  │ 💬 2         │   │ 💬 0         │  │ 💬 5         │  │ 💬 1    ││
│  └─────────────┘   └─────────────┘  └─────────────┘  └────────┘│
│  ┌─────────────┐                                               │
│  │ Async docs  │                                               │
│  │ for designs │                                               │
│  │ 💬 0         │                                               │
│  └─────────────┘                                               │
└────────────────────────────────────────────────────────────────┘
```

- Each card: **title** (one line), **description preview** (~3 lines
  truncated, markdown), **comment count badge**.
- Drag any card across columns; release to commit. Reorder within a
  column by drag.
- Click a card → side panel slides in with the full markdown editor and
  a chronological **comments thread**.
- Cards use a subtle background; column headers do the structure work.
  We deliberately don't use the entity-kind hue palette — that's
  reserved for Alexandria.

#### Data model — three new tables, no migrations to existing schema

```sql
CREATE TABLE feedback_boards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE feedback_cards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id     INTEGER NOT NULL REFERENCES feedback_boards(id) ON DELETE CASCADE,
  column_kind  TEXT    NOT NULL CHECK (column_kind IN
                  ('to_implement', 'in_definition', 'in_progress', 'done')),
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  position     INTEGER NOT NULL,         -- order within column
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE INDEX idx_feedback_cards_board   ON feedback_cards(board_id);
CREATE INDEX idx_feedback_cards_column  ON feedback_cards(board_id, column_kind, position);

CREATE TABLE feedback_card_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES feedback_cards(id) ON DELETE CASCADE,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX idx_feedback_comments_card ON feedback_card_comments(card_id);
```

Notes:

- **Columns are hardcoded** in the CHECK constraint. The user named
  these four explicitly; keeping them fixed avoids the "let me reorder
  my columns forever" rabbit hole. If we ever want per-board column
  config, it's a clean future migration.
- **`position`** is an integer reassigned on move — same pattern as
  `todos` and `workflow_steps`. Move within or across columns rewrites
  positions in a transaction.
- **Comments append-only** in v1 (no edit, no delete). They're quick
  thoughts; if they need editing, they belong in the description.

#### Backend additions — 13 commands, mirrors workflows/notes shape

- **Boards**: `list_feedback_boards(include_archived: bool)`,
  `create_feedback_board(title)`, `rename_feedback_board(id, title)`,
  `set_feedback_board_archived(id, archived)`,
  `delete_feedback_board(id)`.
- **Cards**: `list_feedback_cards(board_id)`,
  `create_feedback_card(board_id, column_kind, title, description)`,
  `update_feedback_card(id, title?, description?)`,
  `move_feedback_card(id, target_column, target_position)`,
  `delete_feedback_card(id)`.
- **Comments**: `list_feedback_card_comments(card_id)`,
  `add_feedback_card_comment(card_id, body)`,
  `delete_feedback_card_comment(id)`.

`move_feedback_card` runs in a transaction: shifts positions in the
source column to close the gap, then shifts positions in the target
column to make room.

#### Frontend additions

Three new components:

- **`FeedbackBoardsView`** — index of all boards (active + archived
  tabs). Each row: title, card count, last-updated. Inline actions:
  rename, archive/unarchive, delete. **+ New board** button at top
  opens a small modal (same shape as `AddEntityModal`) with a title
  input.
- **`FeedbackBoardView`** — the kanban for a single board:
  - Header: editable board title, Archive button, Delete button.
  - Four columns laid out as a flex row, each with vertical stack of
    cards. **+ Add card** at the foot of each column → inline form
    (title + small description textarea).
  - HTML5 drag-and-drop (`draggable`, `ondragstart`, `ondragover`,
    `ondrop`). No library — the pattern from `MapEditor`'s drop
    handler transfers cleanly.
- **`FeedbackCardPanel`** (right-side, slide-in) — full editor for a
  selected card:
  - Editable title.
  - Markdown description (reuse `MarkdownEditor` from notes).
  - Comments thread, body + timestamp, oldest first.
  - "Add comment" textarea + Submit.

Store: `app.feedbackBoards`, `app.feedbackCards` (keyed by active
board), `app.feedbackComments` (keyed by active card).

Sidebar entry **"Feedback"** in the bottom cluster (alongside Summary
and Visualization). Suggested shortcut **Cmd+5**.

#### Build order

1. Migration `0009_feedback_kanban.sql` (3 tables, 4 indexes).
2. Backend models + 13 commands; tests for `move_feedback_card`
   transaction correctness.
3. Frontend ipc + store wiring.
4. `FeedbackBoardsView` (boards list).
5. `FeedbackBoardView` (kanban skeleton: columns + cards, no DnD).
6. Card add / edit / delete.
7. Drag-and-drop with position reassignment.
8. `FeedbackCardPanel` + comments thread.
9. Sidebar entry + shortcut.

Estimated effort: ~2 days. The kanban itself is well-trodden; comments
and the side panel are the polish.

#### Tradeoffs flagged

- **No card labels, no due dates, no assignees**. This is a *personal*
  feedback tool, not a project tracker. Restraint is the feature.
- **No per-card archive** — archive the *board* when its cycle ends.
- **Markdown in description, plain text in comments**. If a comment
  grows long enough to need markdown, it deserves promotion to the
  description.
- **Hardcoded columns**: the four the user named, no customization
  for v1.

### Part 2 — Activity (Kandinsky-inspired weekly grid)

#### Framing

The user wants to *feel* their pace, not read a spreadsheet of it. Bar
charts answer "how much" precisely; Kandinsky compositions answer
"what kind of week was that" instinctively — the eye registers a
sparse cell vs. a dense one before you even read the numbers.

Each week becomes one tiny **composition**: four geometric primitives
(one per entity kind) arranged within a fixed cell, each scaled by how
many items of that kind the user made that week. The cell stays
visually consistent in position; only the figures inside change. The
grid of cells, scanned across, becomes a year of personal rhythm.

This is the closest thing the app will have to a non-functional art
object — and we want that. It earns affection precisely because it
isn't trying to communicate efficiency.

#### Visual model

A 13-column × 4-row grid (52 weeks ≈ 1 year), cells ~96 × 96 px:

```
┌──────────────────────────────────────────────────────────────┐
│  Activity                       [ 52 weeks | 6 months | YTD ]│
│                                                              │
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐    │
│  │ ●    ││  ◆   ││ ●   ■││      ││ ●  ■ ││  ◆■  ││■     │    │
│  │   ◆  ││■     ││      ││  ●   ││      ││      ││  ●   │    │
│  │  ■   ││   ⬢  ││ ⬢    ││    ◆ ││   ⬢  ││    ⬢ ││   ⬢  │    │
│  └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘    │
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐    │
│  │   ◆  ││ ●  ■ ││  ●   ││ ●  ■ ││  ◆⬢  ││  ●   ││  ●■  │    │
│  │ ■    ││  ◆⬢  ││ ◆  ■ ││  ⬢   ││■     ││ ◆■   ││■     │    │
│  │  ⬢   ││      ││  ⬢   ││  ◆   ││  ●   ││ ⬢    ││  ◆⬢  │    │
│  └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘    │
│  ...                                                         │
│  Jan   Feb   Mar   Apr   May   Jun   Jul   Aug  Sep …        │
│                                                              │
│  Hovered: Week 28 · 2026-07-13                               │
│  ● 6 notes  ■ 3 articles  ◆ 1 workflow  ⬢ 4 lists  · 14 total │
└──────────────────────────────────────────────────────────────┘
```

**Each cell encodes:**

- One **circle** = notes (blue, hue 217)
- One **rounded square** = articles (violet, hue 268)
- One **diamond** = workflows (amber, hue 32)
- One **hexagon** = lists (emerald, hue 158)

Same shape language as the Visualization view, so the user already
knows what each glyph means.

**Sizing** (the Kandinsky weight):

- Per-figure radius = `base + sqrt(count) × step`, capped at the
  cell's safe inscribed radius (~28 px in a 96 px cell). Square-root
  scaling because Kandinsky cared about *visual balance*, not strict
  proportionality — a week of 16 notes shouldn't dwarf a week of 4.
- Empty kinds render as a 2 px outlined dot, *not absence*. Even an
  empty week shows the four primitives as faint ghosts — the
  composition holds together.

**Positioning** (the Kandinsky composition):

- Each kind has a fixed anchor inside the cell: circle top-left,
  square top-right, diamond bottom-left, hexagon bottom-right. Quadrants
  of a 2×2 sub-grid.
- A tiny per-cell seeded jitter (deterministic from `week_start`
  hashed) shifts each anchor up to ±6 px, so cells feel
  *compositions* and not a stamped pattern. Same week always gets the
  same jitter — stable across reloads.
- A single thin **diagonal accent line** appears in cells with above-
  average activity, drawn between two of the figures. Bold but quiet.
  Pure Kandinsky.

**Grid affordances:**

- **Granularity switcher** (top-right): **52 weeks** (default 13×4),
  **6 months** (26 weeks → 13×2 with bigger cells), **YTD** (variable,
  depending on date). No continuous zoom — discrete steps make the
  rhythm legible.
- **Month labels** as a subtle row underneath, anchored to the column
  containing each month's first week.
- **Hover any cell** → bottom detail strip lights up with the breakdown
  and a click-through to that week's items (uses the existing entity
  selectors to navigate).
- **Today's cell** has a soft ring around it.

#### Data model

No schema changes. Existing `created_at` is the source of truth.

One new backend query:

```rust
struct WeeklyActivity {
    week_start: String,         // YYYY-MM-DD of the Monday
    notes: i64,
    articles: i64,
    workflows: i64,
    lists: i64,
}

fn weekly_activity(from, to) -> Vec<WeeklyActivity>;
```

SQL bucketing: one CTE per kind using
`strftime('%Y-%W', created_at)` (ISO week, Mon–Sun), full-outer joined
on the week key. Returns one row per week even if all kinds are zero
— the composition needs every cell, including the empty ones.

#### Backend additions

One new Tauri command:

- `get_weekly_activity(from: Option<String>, to: Option<String>)`

Defaults: from = 52 weeks ago, to = today.

#### Frontend additions

New sidebar entry **"Activity"** in the bottom cluster (suggested
**Cmd+6**, with Feedback at Cmd+5).

`ActivityView.svelte` — pure SVG, no chart library, ~250 lines:

- Grid of `<g transform="translate(col*W, row*H)">` cell groups.
- Per cell: four `<g>` figure groups, each calling the per-kind shape
  helper (circle / rounded-square path / diamond path / hexagon path).
  Reuse the shape helpers we already have in `GardenView.svelte`.
- Seeded jitter: stable hash function of `week_start` → two small
  random-feeling offsets per anchor.
- Detail strip below the grid: bound to `hoveredCell` $state.
- Granularity switcher → re-fetches data with a different `from`
  range; same component renders all three.

#### Build order

1. Backend: `weekly_activity` query + Tauri command. Test with a
   synthetic dataset.
2. Frontend ipc + a tiny `app.weeklyActivity` cache.
3. `ActivityView.svelte`: grid + cell composition rendering (use
   mock data first).
4. Hook to backend.
5. Hover detail strip.
6. Granularity switcher.
7. Today-cell ring + month labels.
8. Sidebar entry + shortcut.

Estimated effort: ~1.5 days. The composition logic is the
interesting part; everything else is straightforward SVG and store
wiring.

#### Tradeoffs flagged

- **Square-root sizing** instead of linear — magnitudes are still
  legible but a single 50-item week doesn't blot out everything else.
  Linear is one constant change if you'd prefer raw scale.
- **ISO week (Mon–Sun)** by default. Easy to parameterize later.
- **Deleted items don't appear**: the query counts items that exist
  *now*. Deleting a note from 2026-04 will shrink that week's circle.
  Tracking creation events separately is out of scope for v1.
- **Cells beyond the date range** (future weeks) render as blank
  frames — they hold the grid's shape but don't pretend to have data.

### Open questions before building

1. **Sidebar slot** — both new entries go in the bottom cluster
   alongside Summary and Visualization? Or do you want them grouped
   under a "Workflow" pseudo-section?
2. **Shortcuts** — **Cmd+5 Feedback**, **Cmd+6 Activity**, OK?
3. **Default Activity range** — 52 weeks (last year)? Or always
   year-to-date so January starts fresh?
4. **Cell jitter for Activity** — adds personality, but if you want
   strictly aligned cells (more like a contact sheet), I'll lock the
   anchors instead.
