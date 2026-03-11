-- 002_create_theaters.sql
-- Multi-conflict theater registry. Each theater groups events, casualties, and hotspots.

CREATE TABLE theaters (
  theater_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,                   -- "Middle East – Iran/Israel/US"
  slug              TEXT        NOT NULL UNIQUE,            -- "me-iran-israel-us"
  importance_weight NUMERIC(4,2) NOT NULL DEFAULT 1.0,     -- used in GCI weighted average
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed-safe: allow re-runs
-- No additional indexes needed; slug has UNIQUE index; theater_id is PK.

COMMENT ON TABLE theaters IS 'One row per tracked conflict theater. Drives event partitioning and GCI weighting.';
COMMENT ON COLUMN theaters.slug IS 'URL-safe identifier used in all API ?theater= params.';
COMMENT ON COLUMN theaters.importance_weight IS 'Weight used in Global Conflict Index calculation (v5 §5.5).';
