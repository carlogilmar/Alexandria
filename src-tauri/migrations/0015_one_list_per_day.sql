-- Sprint 19: one active todo list per day. Archive any duplicate active lists
-- for a date (keep the earliest), then enforce it with a partial unique index.
-- Archived lists keep history and don't count, so re-creating after archiving
-- still works.

UPDATE lists SET archived = 1, updated_at = datetime('now')
 WHERE archived = 0
   AND id NOT IN (SELECT MIN(id) FROM lists WHERE archived = 0 GROUP BY date);

CREATE UNIQUE INDEX idx_lists_one_active_per_day
  ON lists(date) WHERE archived = 0;
