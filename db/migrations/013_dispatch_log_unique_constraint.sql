-- 013_dispatch_log_unique_constraint.sql
-- Add unique constraint to alert_dispatch_log so that ON CONFLICT DO NOTHING
-- in workers/alerts.ts provides true idempotency under concurrent dispatch.
-- Without this, two concurrent processes could both pass the "SELECT 1" pre-check
-- and insert duplicate rows for the same (subscriber, event) pair.
--
-- NOTE: event_id is nullable (SET NULL on event delete), so we use COALESCE
-- and a partial approach. Since we only want idempotency for event-based alerts
-- (instant/hourly), the constraint covers non-null event_id rows only.

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_log_sub_event_unique
  ON alert_dispatch_log (subscriber_id, event_id)
  WHERE event_id IS NOT NULL;
