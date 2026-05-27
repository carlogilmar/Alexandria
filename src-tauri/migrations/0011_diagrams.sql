-- Sprint 14: diagrams — a first-class entity for Mermaid diagrams-as-code.
-- Behaves like notes/articles: created freely, shown/edited/pinned/archived/
-- deleted. `source` holds the Mermaid text; the SVG is rendered client-side.

CREATE TABLE diagrams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL DEFAULT 'Untitled diagram',
  source      TEXT    NOT NULL DEFAULT '',
  pinned      INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_diagrams_updated_at ON diagrams(updated_at);
