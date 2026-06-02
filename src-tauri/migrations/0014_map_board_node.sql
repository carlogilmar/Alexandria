-- Sprint 19: allow feedback boards as nodes on the Alexandria canvas. Same
-- table-recreate pattern as 0006/0008/0010 (SQLite can't ALTER a CHECK). Adds
-- 'feedback_board' to the kind CHECK; it's entity-backed so it stays under the
-- partial unique index (one node per board).

PRAGMA defer_foreign_keys = ON;

CREATE TABLE map_nodes_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN
                  ('note', 'article', 'workflow', 'feedback_board',
                   'text', 'comment', 'custom', 'title')),
  entity_id   INTEGER NOT NULL DEFAULT 0,
  x           REAL    NOT NULL,
  y           REAL    NOT NULL,
  width       REAL,
  height      REAL,
  content     TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

INSERT INTO map_nodes_new (id, kind, entity_id, x, y, width, height, content, created_at, updated_at)
  SELECT id, kind, entity_id, x, y, width, height, content, created_at, updated_at FROM map_nodes;

DROP TABLE map_nodes;
ALTER TABLE map_nodes_new RENAME TO map_nodes;

CREATE UNIQUE INDEX idx_map_nodes_unique_entity
  ON map_nodes(kind, entity_id)
  WHERE kind NOT IN ('text', 'comment', 'custom', 'title');

CREATE TABLE map_edges_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   INTEGER NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  target_id   INTEGER NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  label       TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (source_id, target_id)
);

INSERT INTO map_edges_new (id, source_id, target_id, label, created_at, updated_at)
  SELECT id, source_id, target_id, label, created_at, updated_at FROM map_edges;

DROP TABLE map_edges;
ALTER TABLE map_edges_new RENAME TO map_edges;

CREATE INDEX idx_map_edges_source ON map_edges(source_id);
CREATE INDEX idx_map_edges_target ON map_edges(target_id);
