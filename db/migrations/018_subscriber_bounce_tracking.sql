-- 018_subscriber_bounce_tracking.sql
-- Adds consecutive delivery-failure tracking to subscribers.
--
-- When an alert cannot be delivered (SMTP bounce, Telegram bot blocked, SMS
-- unreachable), the worker increments consecutive_failures. Once the counter
-- reaches BOUNCE_SUSPEND_AFTER (default 5), the subscriber is automatically
-- suspended — delivery is skipped and operators can review via the admin API.
--
-- Columns:
--   consecutive_failures  — resets to 0 on any successful delivery
--   suspended             — set true when threshold crossed; operator must
--                           manually re-enable or the subscriber can re-verify
--   last_failure_reason   — last error message, for admin triage

ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended            BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_failure_reason  TEXT;

CREATE INDEX IF NOT EXISTS sub_suspended_idx ON subscribers (suspended) WHERE suspended = true;

COMMENT ON COLUMN subscribers.consecutive_failures IS
  'Incremented on each failed delivery attempt; reset to 0 on success.';
COMMENT ON COLUMN subscribers.suspended IS
  'Set true when consecutive_failures reaches threshold. Delivery skipped until cleared.';
COMMENT ON COLUMN subscribers.last_failure_reason IS
  'Last delivery error message; aids admin triage of suspended subscribers.';
