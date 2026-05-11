-- Workflows: a chain of steps. Each step can optionally have a parent step
-- (for hierarchical sublists — schema supports it; stage-1 UI only uses the
-- main chain where parent_step_id IS NULL).

CREATE TABLE workflows (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  description  TEXT,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE TABLE workflow_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id     INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  parent_step_id  INTEGER          REFERENCES workflow_steps(id) ON DELETE CASCADE,
  text            TEXT    NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE INDEX idx_workflow_steps_workflow ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_steps_parent   ON workflow_steps(parent_step_id);
