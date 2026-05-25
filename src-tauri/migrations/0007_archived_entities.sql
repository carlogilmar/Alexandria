-- Notes, articles, and workflows get an `archived` flag so users can
-- hide on-the-fly content from default views without deleting it. Lists
-- already have this column from 0001_initial.sql.

ALTER TABLE notes     ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles  ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflows ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
