-- 017_feed_fetch_tracking.sql
--
-- PROBLEM
-- The ingestion worker fetches every feed on every 5-minute run regardless of
-- whether the feed has been updated since last fetch. This wastes LLM API budget
-- (processing items already in raw_items via content_hash dedup) and can trigger
-- rate-limiting from feed providers that throttle frequent requests.
--
-- FIX
-- Add a feed_fetch_log table that records the last successful fetch time and
-- ETag/Last-Modified headers for each feed URL. The ingestion worker can:
--   1. Send If-None-Match / If-Modified-Since request headers → 304 Not Modified
--      means skip processing entirely (no LLM calls, no DB writes)
--   2. Skip feeds that were fetched successfully within the last N minutes
--      even if the feed provider doesn't support conditional GETs
--
-- The table is keyed on feed_url (the RSS/Atom URL) rather than a feed name
-- because URLs are stable identifiers even if the feed name changes.

CREATE TABLE IF NOT EXISTS feed_fetch_log (
  feed_url      TEXT        PRIMARY KEY,
  last_fetched  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified TEXT,                  -- value of Last-Modified response header
  etag          TEXT,                  -- value of ETag response header
  item_count    INT         DEFAULT 0, -- items returned in last successful fetch
  error_count   INT         DEFAULT 0, -- consecutive fetch errors (reset on success)
  last_error    TEXT                   -- last error message if any
);

COMMENT ON TABLE feed_fetch_log IS
  'Tracks last fetch time and HTTP cache headers per RSS/Atom feed URL. '
  'Used by ingestion worker to avoid redundant fetches and enable conditional GETs.';
