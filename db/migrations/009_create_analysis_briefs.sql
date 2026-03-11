-- 009_create_analysis_briefs.sql
-- Stores AI-generated strategic analysis briefs (v5 §9.3)

CREATE TABLE IF NOT EXISTS analysis_briefs (
  brief_id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id   uuid         NOT NULL REFERENCES theaters(theater_id) ON DELETE CASCADE,
  bullets      jsonb        NOT NULL DEFAULT '[]',   -- text[] stored as JSON
  sources      jsonb        NOT NULL DEFAULT '[]',   -- publisher names cited
  generated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefs_theater_time_idx ON analysis_briefs (theater_id, generated_at DESC);
