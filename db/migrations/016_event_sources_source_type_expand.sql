-- 016_event_sources_source_type_expand.sql
--
-- PROBLEM
-- event_sources.source_type has a CHECK constraint that only allows:
--   'news' | 'official' | 'osint'
--
-- But the application EvidenceType (lib/types.ts) includes:
--   'news' | 'official' | 'osint' | 'satellite' | 'flight' | 'ship' | 'mixed'
--
-- workers/ingest.ts inserts evidenceType directly into source_type. When the LLM
-- extracts an event with evidence_type = 'satellite', 'flight', 'ship', or 'mixed',
-- the INSERT into event_sources throws a CHECK constraint violation. This causes
-- processItem to throw, the event is counted as an error, and the raw item is
-- left unprocessed — silently dropping events from satellite imagery, flight
-- tracking, and AIS ship data.
--
-- FIX
-- Drop and recreate the CHECK constraint to match the full EvidenceType union.
-- Postgres requires dropping and re-adding CHECK constraints (they cannot be
-- altered in-place). The operation is instantaneous (no table rewrite needed).

ALTER TABLE event_sources
  DROP CONSTRAINT IF EXISTS event_sources_source_type_check;

ALTER TABLE event_sources
  ADD CONSTRAINT event_sources_source_type_check
  CHECK (source_type IN ('news', 'official', 'osint', 'satellite', 'flight', 'ship', 'mixed'));

COMMENT ON COLUMN event_sources.source_type IS
  'Evidence type: news=media report, official=govt/military statement, osint=open-source intelligence, '
  'satellite=imagery analysis, flight=ADS-B tracking, ship=AIS tracking, mixed=multiple source types.';
