-- 005_create_raw_items.sql
-- Audit trail for every ingested feed item before LLM extraction.
-- Nothing is ever deleted from this table; processed=true when extraction is done.

CREATE TABLE raw_items (
  raw_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id       UUID        REFERENCES theaters(theater_id),   -- nullable (set during classify)

  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_name      TEXT,                    -- feed display name, e.g. "Reuters World"
  feed_url         TEXT,                    -- RSS/API endpoint
  title            TEXT,
  url              TEXT,
  published_time   TIMESTAMPTZ,

  content          TEXT,                    -- raw article text (truncated to ~4000 chars)
  content_hash     TEXT        UNIQUE,      -- SHA-256 of url+content; prevents re-ingestion

  processed        BOOLEAN     NOT NULL DEFAULT false,
  processing_error TEXT                     -- last error if extraction failed
);

CREATE INDEX raw_items_processed_idx ON raw_items (processed)  WHERE processed = false;
CREATE INDEX raw_items_ingested_idx  ON raw_items (ingested_at DESC);
CREATE INDEX raw_items_theater_idx   ON raw_items (theater_id);

COMMENT ON TABLE raw_items IS 'Full audit log of every RSS/API item fetched. Never deleted.';
COMMENT ON COLUMN raw_items.content_hash IS 'SHA-256(url || content). Dedup key — UNIQUE constraint.';
