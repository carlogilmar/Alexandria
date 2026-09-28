-- Sprint 69: task status (open/wip/done) + work-time tracking + tag colors.
-- All additive; `todos` has no CHECK constraint so plain ALTERs are safe.

-- Tri-state status. `completed` stays as a mirror of status='done' so every
-- existing surface (Activity, Focus, Welcome, Mirror, stats) keeps working.
ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
-- Accumulated seconds spent in Work-In-Progress (folded in on each pause/done).
ALTER TABLE todos ADD COLUMN work_seconds INTEGER NOT NULL DEFAULT 0;
-- When the current WIP session started (NULL unless status = 'wip').
ALTER TABLE todos ADD COLUMN wip_started_at TEXT;
-- When the task was closed (NULL unless status = 'done').
ALTER TABLE todos ADD COLUMN completed_at TEXT;

-- Backfill existing tasks: completed ⇒ done (with a best-effort close time).
UPDATE todos SET status = 'done', completed_at = updated_at WHERE completed = 1;

-- Per-tag color (auto-assigned from a palette on creation; NULL for pre-existing
-- tags, which the frontend colors deterministically by id as a fallback).
ALTER TABLE tags ADD COLUMN color TEXT;
