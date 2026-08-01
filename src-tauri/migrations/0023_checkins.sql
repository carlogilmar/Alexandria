-- Sprint 42: "lolcommits"-style camera check-ins. When the user creates a
-- today's list (and only if they've opted in), the app snaps a ~1s webcam GIF
-- as a memory of the moment. `path` is the absolute file path of the saved GIF
-- (in the app's images dir). `list_id` is nullable + ON DELETE SET NULL so a
-- check-in survives its list being deleted.
CREATE TABLE checkins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id    INTEGER REFERENCES lists(id) ON DELETE SET NULL,
  path       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_checkins_created ON checkins(created_at);
