-- 012_composite_confidence_index.sql
--
-- PROBLEM
-- Every escalation, WPI, forecasting, and hotspot query filters by:
--   WHERE theater_id = $1
--     AND timestamp_utc >= <window>
--     AND confidence IN ('confirmed', 'likely')
--
-- The existing events_theater_time_idx covers (theater_id, timestamp_utc DESC)
-- but does NOT include confidence. Postgres satisfies the confidence predicate
-- with a filter step after the index scan, reading and discarding every
-- unconfirmed row in each theater+time range. As event volume grows
-- (target: 40M rows/year) this becomes a full-range partial scan per request.
--
-- FIX
-- A composite partial index that bakes the confidence filter directly in:
--   - Index columns: (theater_id, timestamp_utc DESC)
--   - WHERE clause:  confidence IN ('confirmed', 'likely')
--
-- This lets Postgres satisfy all three predicates from the index alone,
-- eliminating the filter step entirely for the ~90% of queries that only
-- want confirmed/likely events. The partial index is also smaller than a
-- full-table index, so it fits in shared_buffers more readily.
--
-- NOTES
-- - CREATE INDEX CONCURRENTLY does not block reads or writes while building.
-- - Safe to run on a live production database.
-- - The existing events_theater_time_idx is kept; it still serves queries
--   that span all confidence levels (e.g. admin dashboards, data exports).

CREATE INDEX CONCURRENTLY IF NOT EXISTS events_theater_time_conf_idx
  ON events (theater_id, timestamp_utc DESC)
  WHERE confidence IN ('confirmed', 'likely');

COMMENT ON INDEX events_theater_time_conf_idx IS
  'Partial index for the dominant query pattern: theater + time window + confirmed/likely confidence. '
  'Used by escalation, WPI, forecasting, hotspot, dashboard, and breaking-news queries.';
