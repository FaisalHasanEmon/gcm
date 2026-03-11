-- 014_job_runs_error_counters.sql
--
-- PROBLEM
-- job_runs tracks whether a run succeeded or failed overall, but gives no
-- visibility into *partial* failure rates:
--   - How many LLM extraction/scoring calls failed this run?
--   - How many events have no map pin due to geocoding misses?
--   - How many subscribers received a failed dispatch?
--
-- Without these counters, operators cannot distinguish "everything is fine"
-- from "40% of events are dropping off the map silently".
--
-- FIX
-- Add three nullable integer counters to job_runs:
--   llm_errors        — incremented each time callLlm() or parseLlmJson()
--                       throws or returns an unusable result during ingestion.
--   geocoding_failed  — incremented each time geocodeLocation() returns null
--                       for a non-null location_name (i.e. the event has a
--                       place name but no map coordinates).
--   dispatch_failed   — incremented each time a per-subscriber send throws
--                       during alert dispatch (email/telegram/sms/push).
--
-- All three are nullable so existing rows (before this migration) read as NULL
-- rather than 0, clearly distinguishing "not tracked" from "zero failures".
-- Application code uses COALESCE($n, 0) when incrementing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_runs' AND column_name = 'llm_errors'
  ) THEN
    ALTER TABLE job_runs ADD COLUMN llm_errors INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_runs' AND column_name = 'geocoding_failed'
  ) THEN
    ALTER TABLE job_runs ADD COLUMN geocoding_failed INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_runs' AND column_name = 'dispatch_failed'
  ) THEN
    ALTER TABLE job_runs ADD COLUMN dispatch_failed INT;
  END IF;
END $$;

COMMENT ON COLUMN job_runs.llm_errors       IS 'Count of LLM call or parse failures during this ingestion run.';
COMMENT ON COLUMN job_runs.geocoding_failed IS 'Count of events with a location_name that could not be geocoded.';
COMMENT ON COLUMN job_runs.dispatch_failed  IS 'Count of per-subscriber send failures during alert dispatch.';
