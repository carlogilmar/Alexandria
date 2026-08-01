-- Sprint 43: Storyboards — a sequence of pages, each a tiny diagram (mini
-- canvas) + a powered-markdown note. Mirrors the Blueprints tables but adds a
-- `storyboard_pages` layer (the "slides"): nodes/edges belong to a PAGE, and
-- each page carries its own markdown `note`.

CREATE TABLE storyboards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE TABLE storyboard_pages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  storyboard_id INTEGER NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX idx_storyboard_pages_sb ON storyboard_pages(storyboard_id);

CREATE TABLE storyboard_nodes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id    INTEGER NOT NULL REFERENCES storyboard_pages(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('box', 'icon', 'header', 'comment')),
  label      TEXT    NOT NULL DEFAULT '',
  icon       TEXT,
  color      TEXT,
  content    TEXT,
  x          REAL    NOT NULL,
  y          REAL    NOT NULL,
  width      REAL,
  height     REAL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_storyboard_nodes_page ON storyboard_nodes(page_id);

CREATE TABLE storyboard_edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id       INTEGER NOT NULL REFERENCES storyboard_pages(id) ON DELETE CASCADE,
  source_id     INTEGER NOT NULL REFERENCES storyboard_nodes(id) ON DELETE CASCADE,
  target_id     INTEGER NOT NULL REFERENCES storyboard_nodes(id) ON DELETE CASCADE,
  source_handle TEXT,
  target_handle TEXT,
  label         TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  UNIQUE (source_id, target_id)
);
CREATE INDEX idx_storyboard_edges_page ON storyboard_edges(page_id);
