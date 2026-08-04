-- Sprint 49: a persisted order for the unified "Pinned" list in the sidebar.
-- One row per pinned entity (kind, entity_id) with an integer position. The
-- frontend rewrites the whole set on every drag-and-drop reorder. Rows for
-- items that later get unpinned are harmless (filtered out client-side) and
-- get cleaned up on the next reorder.
CREATE TABLE pin_order (
  kind      TEXT    NOT NULL,
  entity_id INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  PRIMARY KEY (kind, entity_id)
);
