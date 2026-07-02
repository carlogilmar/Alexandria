-- Sprint 22: Blueprints — standalone design canvases. Multiple documents,
-- each with its own nodes and edges. Unlike map_nodes there is no entity_id
-- and no partial unique index: blueprint nodes never reference entities.
-- Edges persist which handle (t|r|b|l) they attach to so four-sided cards
-- keep their layout across reloads.

CREATE TABLE blueprints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE blueprint_nodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_id  INTEGER NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('card', 'text', 'comment', 'title')),
  -- Card fields (kind = 'card'); decoratives leave these at defaults.
  title         TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  color         TEXT,
  -- Decorative text (kind = text | comment | title).
  content       TEXT,
  x             REAL    NOT NULL,
  y             REAL    NOT NULL,
  width         REAL,
  height        REAL,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX idx_blueprint_nodes_blueprint ON blueprint_nodes(blueprint_id);

CREATE TABLE blueprint_edges (
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

CREATE INDEX idx_blueprint_edges_blueprint ON blueprint_edges(blueprint_id);
CREATE INDEX idx_blueprint_edges_source ON blueprint_edges(source_id);
CREATE INDEX idx_blueprint_edges_target ON blueprint_edges(target_id);
