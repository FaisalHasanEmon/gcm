-- 001_enable_postgis.sql
-- Must run before any table that uses geography() columns.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- provides gen_random_uuid()

-- Confirm versions for audit log
DO $$
BEGIN
  RAISE NOTICE 'PostGIS version: %', postgis_version();
END
$$;
