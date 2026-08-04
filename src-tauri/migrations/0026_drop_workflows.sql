-- Sprint 50: the workflow entity is retired (replaced by a ```workflow markdown
-- block). Drop its tables. Data is intentionally discarded. `workflow_steps`
-- FKs to `workflows`, so drop it first.
DROP TABLE IF EXISTS workflow_steps;
DROP TABLE IF EXISTS workflows;
