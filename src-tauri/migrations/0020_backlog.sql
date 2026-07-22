-- Sprint 29: a single durable "Backlog" list for unscheduled tasks.
-- Additive flag on `lists`; the backlog row is a sentinel list
-- (is_backlog = 1, date = '') that reuses all the existing todo plumbing.
-- It is get-or-created lazily by lists::backlog and excluded from the daily
-- surfaces (list_all / stats / daily_stats).
ALTER TABLE lists ADD COLUMN is_backlog INTEGER NOT NULL DEFAULT 0;
