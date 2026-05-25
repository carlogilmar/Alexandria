-- Feedback kanban: one section for personal-feedback planning.
-- Boards are named (e.g. "Feedback Mayo"). Each board has cards across
-- four fixed columns. Cards carry markdown descriptions and a
-- chronological comments thread.

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
  position     INTEGER NOT NULL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE INDEX idx_feedback_cards_board  ON feedback_cards(board_id);
CREATE INDEX idx_feedback_cards_column ON feedback_cards(board_id, column_kind, position);

CREATE TABLE feedback_card_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES feedback_cards(id) ON DELETE CASCADE,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX idx_feedback_comments_card ON feedback_card_comments(card_id);
