-- Sprint 16: remove the standalone Diagram entity. Inline ```mermaid fences in
-- note/article bodies (Sprint 15) replace it, so the per-diagram table is no
-- longer used. Additive drop (we keep 0011 so existing DBs don't fail sqlx's
-- applied-migration checksum). No data migration needed — the rendering source
-- now lives inline in the markdown bodies.
DROP TABLE IF EXISTS diagrams;
