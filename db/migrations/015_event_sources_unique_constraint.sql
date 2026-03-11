-- 015_event_sources_unique_constraint.sql
--
-- PROBLEM
-- workers/ingest.ts and lib/intelligence/dedupe.ts both INSERT into event_sources
-- with ON CONFLICT DO NOTHING, but the table has no unique constraint beyond its
-- primary key. As a result ON CONFLICT DO NOTHING never fires — the same (event_id,
-- url) pair can be inserted multiple times, leading to duplicate source rows that
-- inflate confidence scores and corrupt source citation lists.
--
-- FIX
-- Add a unique index on (event_id, url). URL is the natural dedup key: the same
-- article URL should never be counted twice as a corroborating source for the same
-- event. We use a partial unique index rather than a table constraint so that
-- CREATE INDEX CONCURRENTLY can be used — safe on a live database with no locking.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS event_sources_event_url_unique
  ON event_sources (event_id, url);

COMMENT ON INDEX event_sources_event_url_unique IS
  'Prevents the same URL being counted twice as a source for a single event. '
  'Required for ON CONFLICT DO NOTHING in workers/ingest.ts and lib/intelligence/dedupe.ts to work correctly.';
