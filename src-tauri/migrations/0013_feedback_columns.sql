-- Sprint 19: custom kanban columns per board (replacing the hardcoded
-- column_kind CHECK), per-card color, and a `pinned` flag on boards so they
-- can live in the sidebar like other entities.

PRAGMA defer_foreign_keys = ON;

-- Per-board, user-editable columns.
CREATE TABLE feedback_columns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER NOT NULL REFERENCES feedback_boards(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  position    INTEGER NOT NULL,
  created_at  TEXT    NOT NULL
);
CREATE INDEX idx_feedback_columns_board ON feedback_columns(board_id, position);

-- Seed the four legacy default columns for every existing board, in order.
INSERT INTO feedback_columns (board_id, name, position, created_at)
  SELECT id, 'To Implement', 0, datetime('now') FROM feedback_boards;
INSERT INTO feedback_columns (board_id, name, position, created_at)
  SELECT id, 'In Definition', 1, datetime('now') FROM feedback_boards;
INSERT INTO feedback_columns (board_id, name, position, created_at)
  SELECT id, 'In Progress', 2, datetime('now') FROM feedback_boards;
INSERT INTO feedback_columns (board_id, name, position, created_at)
  SELECT id, 'Done', 3, datetime('now') FROM feedback_boards;

-- Recreate feedback_cards keyed on column_id (mapped from old column_kind),
-- with a nullable color.
CREATE TABLE feedback_cards_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id     INTEGER NOT NULL REFERENCES feedback_boards(id) ON DELETE CASCADE,
  column_id    INTEGER NOT NULL REFERENCES feedback_columns(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  color        TEXT,
  position     INTEGER NOT NULL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

INSERT INTO feedback_cards_new
    (id, board_id, column_id, title, description, color, position, created_at, updated_at)
  SELECT c.id, c.board_id,
         (SELECT col.id FROM feedback_columns col
            WHERE col.board_id = c.board_id
              AND col.name = CASE c.column_kind
                 WHEN 'to_implement'  THEN 'To Implement'
                 WHEN 'in_definition' THEN 'In Definition'
                 WHEN 'in_progress'   THEN 'In Progress'
                 WHEN 'done'          THEN 'Done'
                 ELSE 'To Implement' END),
         c.title, c.description, NULL, c.position, c.created_at, c.updated_at
    FROM feedback_cards c;

DROP TABLE feedback_cards;
ALTER TABLE feedback_cards_new RENAME TO feedback_cards;

CREATE INDEX idx_feedback_cards_board ON feedback_cards(board_id);
CREATE INDEX idx_feedback_cards_column ON feedback_cards(column_id, position);

-- Boards can be pinned to the sidebar.
ALTER TABLE feedback_boards ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
