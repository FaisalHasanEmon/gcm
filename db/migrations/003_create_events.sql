-- 003_create_events.sql
-- Deduped, scored conflict events. Central table. All foreign keys reference theaters.

CREATE TABLE events (
  event_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id         UUID        NOT NULL REFERENCES theaters(theater_id) ON DELETE CASCADE,

  -- Timestamps
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  timestamp_utc      TIMESTAMPTZ,               -- event time (may differ from ingestion time)

  -- Geography
  country_primary    TEXT        NOT NULL,
  location_name      TEXT,                       -- human-readable place name
  geom               geography(Point, 4326),     -- PostGIS point; NULL if geocoding failed
  location_precision TEXT        CHECK (location_precision IN
                       ('exact', 'approximate', 'region', 'unknown'))
                       DEFAULT 'unknown',

  -- Actors
  actors_involved    TEXT[],                     -- e.g. '{IDF,IRGC}'

  -- Classification
  event_type         TEXT        NOT NULL CHECK (event_type IN (
                       'airstrike', 'missile_launch', 'drone_attack', 'military_movement',
                       'naval_activity', 'official_statement', 'warning_alert', 'explosion',
                       'infrastructure_damage', 'casualty_update', 'other'
                     )),
  severity           TEXT        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence         TEXT        NOT NULL CHECK (confidence IN ('confirmed', 'likely', 'unconfirmed')),
  evidence_type      TEXT        NOT NULL CHECK (evidence_type IN (
                       'news', 'official', 'osint', 'satellite', 'flight', 'ship', 'mixed'
                     )) DEFAULT 'news',
  is_signal          BOOLEAN     NOT NULL DEFAULT false,  -- unverified signal; shown dimmed in UI

  -- Content
  headline           TEXT,                       -- ≤12 words (LLM-generated)
  summary_20w        TEXT        NOT NULL,       -- ≤20 words neutral summary
  tags               TEXT[],

  -- Damage (populated for infrastructure_damage / airstrike events)
  damage_asset       TEXT,                       -- "US Embassy", "Airport runway", "Oil depot"
  damage_type        TEXT,                       -- "bombed", "fire", "disabled", "breach"

  -- Scoring (v5 §5.3 + §5.4)
  importance_score   INT         NOT NULL DEFAULT 0,   -- 0–100 final hybrid score
  escalation_points  INT         NOT NULL DEFAULT 0    -- raw points for escalation_score calc
);

-- ── Indexes (v5 §3.1) ────────────────────────────────────────────────────────
CREATE INDEX events_time_idx         ON events (timestamp_utc DESC);
CREATE INDEX events_theater_time_idx ON events (theater_id, timestamp_utc DESC);
CREATE INDEX events_conf_idx         ON events (confidence);
CREATE INDEX events_type_idx         ON events (event_type);
CREATE INDEX events_severity_idx     ON events (severity);
CREATE INDEX events_score_idx        ON events (importance_score DESC);
CREATE INDEX events_signal_idx       ON events (is_signal);
CREATE INDEX events_geom_gix         ON events USING GIST (geom);   -- spatial index

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION events_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER events_updated_at_trg
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_set_updated_at();

COMMENT ON TABLE  events             IS 'Deduplicated, scored conflict events. One row per distinct incident after merge.';
COMMENT ON COLUMN events.geom        IS 'PostGIS geography(Point,4326). NULL when geocoding unavailable.';
COMMENT ON COLUMN events.is_signal   IS 'True = unverified/unconfirmed signal. Shown with dashed border in UI.';
COMMENT ON COLUMN events.importance_score IS '0–100 hybrid score: 0.6*deterministic + 0.4*ai (v5 §5.3).';
COMMENT ON COLUMN events.escalation_points IS 'Per-event raw points summed over 72h to compute escalation_score.';
