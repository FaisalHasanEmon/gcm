// lib/intelligence/dedupe.ts
// Event deduplication — v5 §5.2
// Candidate duplicate: same/similar event_type + within 40km + within 60 minutes.

import { sql } from '../db/pool';
import type { EventType } from '../types';

/** Configurable dedup window (can override via env) */
export const DEDUPE_RADIUS_M  = parseInt(process.env.DEDUPE_RADIUS_M  ?? '40000',  10); // 40 km
export const DEDUPE_WINDOW_M  = parseInt(process.env.DEDUPE_WINDOW_M  ?? '60',     10); // 60 min

/** v5 §5.2 similar type mapping */
const SIMILAR_TYPES: Record<EventType, EventType[]> = {
  airstrike:            ['explosion', 'infrastructure_damage'],
  explosion:            ['airstrike', 'infrastructure_damage'],
  infrastructure_damage:['airstrike', 'explosion'],
  missile_launch:       ['explosion'],
  drone_attack:         ['explosion'],
  military_movement:    [],
  naval_activity:       [],
  official_statement:   [],
  warning_alert:        [],
  casualty_update:      [],
  other:                [],
};

/** Returns the event_id of an existing duplicate, or null if none found. */
export async function findDuplicate(candidate: {
  theater_id:   string;
  event_type:   EventType;
  timestamp_utc: string;
  lat:          number;
  lon:          number;
}): Promise<string | null> {
  const similarTypes = [candidate.event_type, ...(SIMILAR_TYPES[candidate.event_type] ?? [])];
  const typePlaceholders = similarTypes.map((_, i) => `$${i + 5}`).join(', ');

  const rows = await sql<{ event_id: string }>(`
    SELECT e.event_id
    FROM events e
    WHERE e.theater_id     = $1
      AND e.event_type     IN (${typePlaceholders})
      AND e.timestamp_utc  BETWEEN ($2::timestamptz - interval '${DEDUPE_WINDOW_M} minutes')
                                AND ($2::timestamptz + interval '${DEDUPE_WINDOW_M} minutes')
      AND e.geom IS NOT NULL
      AND ST_DWithin(
        e.geom,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
        ${'$' + (similarTypes.length + 5)}
      )
    ORDER BY e.created_at ASC
    LIMIT 1
  `, [
    candidate.theater_id,
    candidate.timestamp_utc,
    candidate.lon,
    candidate.lat,
    ...similarTypes,
    DEDUPE_RADIUS_M,
  ]);

  return rows[0]?.event_id ?? null;
}

/** Merge sources from a duplicate into an existing event, then recompute scores. */
export async function mergeIntoExisting(
  existingEventId: string,
  newSources: { publisher: string; url: string; published_time?: string | null; source_type: string; reliability_tier: string }[]
): Promise<void> {
  for (const src of newSources) {
    // Insert source if URL not already present
    await sql(`
      INSERT INTO event_sources (event_id, publisher, url, published_time, source_type, reliability_tier)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [existingEventId, src.publisher, src.url, src.published_time ?? null, src.source_type, src.reliability_tier]);
  }

  // Recompute confidence from merged source set
  const sources = await sql<{ reliability_tier: string; source_type: string }>(`
    SELECT reliability_tier, source_type FROM event_sources WHERE event_id = $1
  `, [existingEventId]);

  const t1 = sources.filter(s => s.reliability_tier === 'tier1').length;
  const t2 = sources.filter(s => s.reliability_tier === 'tier2').length;
  const hasOsint = sources.some(s => s.source_type === 'osint');
  let confidence = 'unconfirmed';
  if (t1 >= 2)          confidence = 'confirmed';
  else if (t1 >= 1)     confidence = 'likely';
  else if (t2 >= 2)     confidence = 'likely';
  else if (hasOsint && t2 >= 1) confidence = 'likely';

  await sql(`
    UPDATE events
    SET confidence  = $2,
        updated_at  = now()
    WHERE event_id  = $1
  `, [existingEventId, confidence]);
}
