-- Sprint 75: The Hub — a dedicated tabbed knowledge index. Hub pages are their
-- OWN entity (not notes): they never appear in the Library, pins, or search.

CREATE TABLE hub_pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

-- Single-row banner (hero) for the Hub.
CREATE TABLE hub_meta (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  title    TEXT NOT NULL DEFAULT 'My Knowledge Base',
  subtitle TEXT NOT NULL DEFAULT 'Everything starts here — a curated map of your notes, projects and learning.'
);
INSERT INTO hub_meta (id, title, subtitle)
VALUES (1, 'My Knowledge Base', 'Everything starts here — a curated map of your notes, projects and learning.');
