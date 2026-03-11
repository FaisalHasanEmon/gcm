-- 008_create_job_runs.sql
-- Ingestion worker audit log. One row per worker execution.

CREATE TABLE job_runs (
  job_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       TEXT        NOT NULL,   -- e.g. "ingestion", "brief-generation", "alert-dispatch"
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         TEXT        NOT NULL CHECK (status IN ('running', 'ok', 'error', 'partial')),
  items_fetched  INT         DEFAULT 0,
  events_created INT         DEFAULT 0,
  events_updated INT         DEFAULT 0,
  error          TEXT                    -- last error message if status = error|partial
);

CREATE INDEX job_runs_name_idx   ON job_runs (job_name, started_at DESC);
CREATE INDEX job_runs_status_idx ON job_runs (status);
CREATE INDEX job_runs_time_idx   ON job_runs (started_at DESC);

COMMENT ON TABLE job_runs IS 'Audit log for all background workers. Used for ops monitoring.';
COMMENT ON COLUMN job_runs.status IS 'running=in progress; ok=clean finish; partial=some items failed; error=full failure.';
