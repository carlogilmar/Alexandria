-- Notes: per-day markdown notes (one or more notes per day).
-- Also a single global "index" note for the summary/index page.

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  date        TEXT    NOT NULL,            -- ISO 8601 YYYY-MM-DD
  body        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_notes_date ON notes(date);

-- Single-row table for the global index/summary markdown document.
CREATE TABLE index_doc (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  body        TEXT    NOT NULL DEFAULT '',
  updated_at  TEXT    NOT NULL
);

INSERT INTO index_doc (id, body, updated_at) VALUES (1, '', datetime('now'));
