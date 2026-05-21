-- Sprint 10: the master Map — a single global blackboard where the user
-- places articles, notes, and workflows and draws connections between them.
--
-- No `maps` table; there is exactly one map for the whole app. Each entity
-- has at most one home position on it (the uniqueness constraint).

CREATE TABLE map_nodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('note', 'article', 'workflow')),
  entity_id   INTEGER NOT NULL,
  x           REAL    NOT NULL,
  y           REAL    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (kind, entity_id)
);

CREATE TABLE map_edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   INTEGER NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  target_id   INTEGER NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  label       TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (source_id, target_id)
);

CREATE INDEX idx_map_edges_source ON map_edges(source_id);
CREATE INDEX idx_map_edges_target ON map_edges(target_id);
