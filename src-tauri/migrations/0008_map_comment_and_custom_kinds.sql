-- Alexandria gets two new free-form node kinds:
--   comment — plain text, no chrome (a margin note)
--   custom  — card-style with a user-typed title (not linked to an entity)
--
-- Both reuse the existing `content` column. SQLite can't ALTER a CHECK
-- constraint, so we recreate map_nodes (and map_edges to refresh its FK)
-- with the wider kind whitelist.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE map_nodes_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('note', 'article', 'workflow', 'text', 'comment', 'custom')),
  entity_id   INTEGER NOT NULL DEFAULT 0,
  x           REAL    NOT NULL,
  y           REAL    NOT NULL,
  content     TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

INSERT INTO map_nodes_new (id, kind, entity_id, x, y, content, created_at, updated_at)
  SELECT id, kind, entity_id, x, y, content, created_at, updated_at FROM map_nodes;

DROP TABLE map_nodes;
ALTER TABLE map_nodes_new RENAME TO map_nodes;

-- Same partial uniqueness rule as before — entity kinds only.
CREATE UNIQUE INDEX idx_map_nodes_unique_entity
  ON map_nodes(kind, entity_id)
  WHERE kind NOT IN ('text', 'comment', 'custom');

-- Rebuild map_edges to refresh its FK target.
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
