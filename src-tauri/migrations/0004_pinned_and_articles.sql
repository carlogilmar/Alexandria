-- Sprint 8: pinned items + articles entity.
--
-- Pinned items stay in the sidebar even after many newer items push them
-- past the "recent" cutoff. Articles are knowledge-system documents that
-- can embed any other entity inline via {{kind:id}} tokens.

ALTER TABLE lists      ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes      ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflows  ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE articles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL DEFAULT '',
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_articles_updated_at ON articles(updated_at);
