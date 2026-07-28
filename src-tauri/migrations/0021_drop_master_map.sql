-- Sprint 40: remove the Alexandria "master map" canvas. Blueprints (standalone
-- design canvases) superseded it, so the single shared knowledge-map view and
-- its tables are dropped. Edges first (FK to nodes), then nodes. Additive/
-- idempotent so existing DBs apply cleanly.
DROP TABLE IF EXISTS map_edges;
DROP TABLE IF EXISTS map_nodes;
