-- Add support for text annotations on the map. We extend map_nodes rather
-- than introducing a parallel table so xyflow's id namespace stays simple
-- and edges (which reference map_nodes.id) keep working unchanged.
--
-- SQLite can't ALTER a CHECK constraint, so we recreate the table. We also
-- recreate map_edges to repair its REFERENCES clause after the swap; the
-- inserts happen inside the migration's implicit transaction so FK checks
-- are deferred until the end.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE map_nodes_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('note', 'article', 'workflow', 'text')),
  entity_id   INTEGER NOT NULL DEFAULT 0,
  x           REAL    NOT NULL,
  y           REAL    NOT NULL,
  content     TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

INSERT INTO map_nodes_new (id, kind, entity_id, x, y, content, created_at, updated_at)
  SELECT id, kind, entity_id, x, y, NULL, created_at, updated_at FROM map_nodes;

DROP TABLE map_nodes;
ALTER TABLE map_nodes_new RENAME TO map_nodes;

-- Entity nodes (note/article/workflow) can appear at most once; text nodes
-- have no uniqueness requirement, hence the partial index.
CREATE UNIQUE INDEX idx_map_nodes_unique_entity
  ON map_nodes(kind, entity_id)
  WHERE kind != 'text';

-- Rebuild map_edges to refresh its FK target. We preserve all rows.
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
