-- 007_create_subscribers.sql
-- Alert subscription records. Extended from v5 §3 to include verification flow.

CREATE TABLE subscribers (
  subscriber_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Contact
  channel        TEXT        NOT NULL CHECK (channel IN ('email', 'telegram', 'sms', 'push')),
  address        TEXT        NOT NULL,    -- email address / telegram chat_id / phone

  -- Filters
  theaters       UUID[],                 -- NULL = all active theaters
  countries      TEXT[],                 -- NULL = all countries
  event_types    TEXT[],                 -- NULL = all event types
  min_severity   TEXT        CHECK (min_severity IN ('critical', 'high', 'medium', 'low'))
                             DEFAULT 'high',
  frequency      TEXT        CHECK (frequency IN ('instant', 'hourly', 'daily'))
                             DEFAULT 'instant',

  -- Verification
  verified       BOOLEAN     NOT NULL DEFAULT false,
  verify_token   TEXT,                   -- one-time token sent via channel
  verify_expires TIMESTAMPTZ,            -- token TTL (24h from creation)
  unsubscribed   BOOLEAN     NOT NULL DEFAULT false,
  unsub_token    TEXT        UNIQUE      -- used in one-click unsubscribe link
);

-- Active subscription uniqueness (allow re-subscribe after unsubscribe)
CREATE UNIQUE INDEX sub_active_uniq ON subscribers (channel, address)
  WHERE unsubscribed = false;

CREATE INDEX sub_verified_idx    ON subscribers (verified, unsubscribed);
CREATE INDEX sub_verify_tok_idx  ON subscribers (verify_token) WHERE verify_token IS NOT NULL;
CREATE INDEX sub_unsub_tok_idx   ON subscribers (unsub_token)  WHERE unsub_token  IS NOT NULL;

COMMENT ON TABLE subscribers IS 'Alert subscription preferences. Verification required before dispatch.';
COMMENT ON COLUMN subscribers.unsub_token IS 'Included in every alert email as one-click unsubscribe URL parameter.';
