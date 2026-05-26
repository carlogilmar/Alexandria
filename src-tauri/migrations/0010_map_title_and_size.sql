-- Alexandria gains a 'title' node kind (section headers, no handles, no
-- chrome) and *persistent* per-node width/height so user-resized text /
-- custom nodes keep their dimensions across reloads.
--
-- width and height are nullable: a NULL means "use the renderer's
-- default for this kind". Once the user drags a corner of NodeResizer,
-- the new values get written and stick.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE map_nodes_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN
                  ('note', 'article', 'workflow', 'text', 'comment', 'custom', 'title')),
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
  SELECT id, kind, entity_id, x, y, NULL, NULL, content, created_at, updated_at FROM map_nodes;

DROP TABLE map_nodes;
ALTER TABLE map_nodes_new RENAME TO map_nodes;

-- Partial uniqueness: only entity-backed kinds enforce one-per-map.
CREATE UNIQUE INDEX idx_map_nodes_unique_entity
  ON map_nodes(kind, entity_id)
  WHERE kind NOT IN ('text', 'comment', 'custom', 'title');

-- Rebuild map_edges so the FK target picks up the recreated map_nodes.
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
