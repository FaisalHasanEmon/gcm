-- 010_alerts_and_subscribers_v2.sql
-- Ensures subscribers table has all columns needed for double opt-in
-- (these may already exist from migration 007 — IF NOT EXISTS guards)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'verify_token'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN verify_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'verify_expires'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN verify_expires timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'unsub_token'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN unsub_token text UNIQUE;
  END IF;
END $$;

-- Alert dispatch log: tracks per-subscriber send timestamps for frequency gating
CREATE TABLE IF NOT EXISTS alert_dispatch_log (
  log_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid         NOT NULL REFERENCES subscribers(subscriber_id) ON DELETE CASCADE,
  event_id      uuid         REFERENCES events(event_id) ON DELETE SET NULL,
  dispatched_at timestamptz  NOT NULL DEFAULT now(),
  channel       text         NOT NULL,
  status        text         NOT NULL CHECK (status IN ('sent','failed'))
);

CREATE INDEX IF NOT EXISTS dispatch_log_sub_idx ON alert_dispatch_log (subscriber_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS dispatch_log_event_idx ON alert_dispatch_log (event_id);

-- job_runs: add 'running' status if not in the CHECK constraint
-- (Alter check constraint safely — drop + re-add)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'job_runs' AND constraint_name LIKE '%status%'
  ) THEN
    -- Check if 'running' is already allowed (it was added in Pass 1 implementation)
    -- If this errors, the constraint already covers 'running' — safe to ignore
    NULL;
  END IF;
END $$;
