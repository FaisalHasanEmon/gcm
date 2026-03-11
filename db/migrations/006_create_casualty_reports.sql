-- 006_create_casualty_reports.sql
-- Time-series casualty data. Must NOT be inferred from events — only from explicit source reports.
-- Each row = one source-reported casualty snapshot for a country + period.

CREATE TABLE casualty_reports (
  report_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id        UUID        NOT NULL REFERENCES theaters(theater_id) ON DELETE CASCADE,

  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  country           TEXT        NOT NULL,

  -- All counts nullable — only record what is explicitly reported
  killed            INT,
  injured           INT,
  civilian_killed   INT,
  civilian_injured  INT,
  military_killed   INT,
  military_injured  INT,

  confidence        TEXT        NOT NULL CHECK (confidence IN ('confirmed', 'likely', 'unconfirmed'))
                                DEFAULT 'likely',
  sources           JSONB       NOT NULL DEFAULT '[]'::JSONB,  -- [{publisher, url}]

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate period+country rows from same ingestion run
  CONSTRAINT casualty_period_country_uniq UNIQUE (theater_id, period_start, period_end, country)
);

CREATE INDEX cas_theater_idx    ON casualty_reports (theater_id, period_end DESC);
CREATE INDEX cas_country_idx    ON casualty_reports (country);
CREATE INDEX cas_period_idx     ON casualty_reports (period_start, period_end);
CREATE INDEX cas_confidence_idx ON casualty_reports (confidence);

COMMENT ON TABLE casualty_reports IS 'Explicitly reported casualty figures only. Never inferred from event summaries.';
COMMENT ON COLUMN casualty_reports.sources IS 'JSONB array: [{publisher: "Reuters", url: "..."}]';
