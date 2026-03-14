// lib/db/events.ts
// Reusable SQL fragments and query helpers for events table.

import { sql } from './pool';
import type { ConflictEvent } from '../types';

/** Standard column list that extracts lat/lon from PostGIS geom. */
export const EVENT_SELECT = `
  e.event_id,
  e.theater_id,
  e.created_at,
  e.updated_at,
  e.timestamp_utc,
  e.country_primary,
  e.location_name,
  ST_Y(e.geom::geometry)  AS lat,
  ST_X(e.geom::geometry)  AS lon,
  e.location_precision,
  e.actors_involved,
  e.event_type,
  e.severity,
  e.confidence,
  e.evidence_type,
  e.is_signal,
  e.headline,
  e.summary_20w,
  e.tags,
  e.damage_asset,
  e.damage_type,
  e.importance_score,
  e.escalation_points,
  COUNT(es.source_id)::int AS sources_count
`;

/** Join clause to count sources. */
export const EVENT_SOURCE_JOIN = `
  LEFT JOIN event_sources es ON es.event_id = e.event_id
`;

/** GROUP BY for use when COUNT(es.source_id) is selected. */
export const EVENT_GROUP_BY = `GROUP BY e.event_id`;

/**
 * Fetch events with sources joined.
 * sources array is populated via a second query to avoid row explosion.
 */
export async function fetchEventWithSources(eventId: string): Promise<ConflictEvent | null> {
  const events = await sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e
    ${EVENT_SOURCE_JOIN}
    WHERE e.event_id = $1
    ${EVENT_GROUP_BY}
  `, [eventId]);

  if (!events[0]) return null;
  const event = events[0];

  const sources = await sql(`
    SELECT source_id, event_id, publisher, url, published_time, source_type, reliability_tier
    FROM event_sources
    WHERE event_id = $1
    ORDER BY reliability_tier ASC, published_time DESC
  `, [eventId]);

  return { ...event, sources: sources as ConflictEvent['sources'] };
}

/**
 * Resolve theater_id from slug. Throws 404-style error if not found.
 */
export async function resolveTheater(slug: string): Promise<{
  theater_id: string;
  name: string;
  slug: string;
  importance_weight: number;
  is_active: boolean;
  created_at: string;
}> {
  const rows = await sql<{
    theater_id: string; name: string; slug: string;
    importance_weight: number; is_active: boolean; created_at: string;
  }>(
    `SELECT theater_id, name, slug, importance_weight, is_active, created_at
     FROM theaters WHERE slug = $1 AND is_active = true LIMIT 1`,
    [slug]
  );
  if (!rows[0]) throw new NotFoundError(`Theater not found: ${slug}`);
  return rows[0];
}

export class NotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
