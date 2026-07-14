-- Sprint 24: a 'frame' node kind for Blueprints — a labeled, resizable
-- rectangle drawn behind cards to group/section a diagram (visual only; it
-- does not own its contents).
--
-- `kind` carries a CHECK constraint, and SQLite can't ALTER a CHECK, so we
-- recreate blueprint_nodes (the 0006/0008/0010 pattern) and rebuild
-- blueprint_edges so its FK re-binds to the new table. `image_url` (added by
-- 0018) is preserved. Columns are copied by explicit name, so physical order
-- doesn't matter.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE blueprint_nodes_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_id  INTEGER NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('card', 'text', 'comment', 'title', 'frame')),
  title         TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  color         TEXT,
  content       TEXT,
  image_url     TEXT,
  x             REAL    NOT NULL,
  y             REAL    NOT NULL,
  width         REAL,
  height        REAL,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

INSERT INTO blueprint_nodes_new
  (id, blueprint_id, kind, title, description, color, content, image_url, x, y, width, height, created_at, updated_at)
  SELECT id, blueprint_id, kind, title, description, color, content, image_url, x, y, width, height, created_at, updated_at
    FROM blueprint_nodes;

DROP TABLE blueprint_nodes;
ALTER TABLE blueprint_nodes_new RENAME TO blueprint_nodes;
CREATE INDEX idx_blueprint_nodes_blueprint ON blueprint_nodes(blueprint_id);

-- Rebuild edges so their FK re-binds to the recreated blueprint_nodes.
CREATE TABLE blueprint_edges_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_id   INTEGER NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  source_id      INTEGER NOT NULL REFERENCES blueprint_nodes(id) ON DELETE CASCADE,
  target_id      INTEGER NOT NULL REFERENCES blueprint_nodes(id) ON DELETE CASCADE,
  source_handle  TEXT,
  target_handle  TEXT,
  label          TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  UNIQUE (source_id, target_id)
);

INSERT INTO blueprint_edges_new
  (id, blueprint_id, source_id, target_id, source_handle, target_handle, label, created_at, updated_at)
  SELECT id, blueprint_id, source_id, target_id, source_handle, target_handle, label, created_at, updated_at
    FROM blueprint_edges;

DROP TABLE blueprint_edges;
ALTER TABLE blueprint_edges_new RENAME TO blueprint_edges;
CREATE INDEX idx_blueprint_edges_blueprint ON blueprint_edges(blueprint_id);
CREATE INDEX idx_blueprint_edges_source ON blueprint_edges(source_id);
CREATE INDEX idx_blueprint_edges_target ON blueprint_edges(target_id);
