-- 004_create_event_sources.sql
-- One row per source that corroborates an event.
-- Multiple sources per event; confidence is computed from source tier set.

CREATE TABLE event_sources (
  source_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,

  publisher        TEXT        NOT NULL,           -- "Reuters", "AP", "BBC"
  url              TEXT        NOT NULL,
  published_time   TIMESTAMPTZ,

  source_type      TEXT        CHECK (source_type IN ('news', 'official', 'osint'))
                               DEFAULT 'news',
  reliability_tier TEXT        CHECK (reliability_tier IN ('tier1', 'tier2', 'tier3'))
                               DEFAULT 'tier2',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_sources_event_idx ON event_sources (event_id);
CREATE INDEX event_sources_tier_idx  ON event_sources (reliability_tier);

COMMENT ON TABLE event_sources IS 'Sources corroborating each event. Used to compute confidence tier.';
COMMENT ON COLUMN event_sources.reliability_tier IS 'tier1=Reuters/AP/BBC. tier2=regional reputable. tier3=social/uncorroborated.';
