-- Sprint 51: the article entity is retired. Powered markdown (link cards,
-- entity links) absorbed its "wrap other entities" role, so articles were just
-- notes. The author migrated their articles into notes manually; drop the
-- table. Data is intentionally discarded.
DROP TABLE IF EXISTS articles;
