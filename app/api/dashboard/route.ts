// app/api/dashboard/route.ts
// GET /api/dashboard?theater=slug
// Returns all card payloads in a single response for fastest dashboard load.

import { NextRequest } from 'next/server';
import { ok, err, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater } from '@/lib/db/events';
import { EVENT_SELECT, EVENT_SOURCE_JOIN, EVENT_GROUP_BY } from '@/lib/db/events';
import { parseRange } from '@/lib/db/timeframe';
import { computeEscalation } from '@/lib/scoring/escalation';
import { computeGci } from '@/lib/scoring/gci';
import { computeHotspots } from '@/lib/geo/hotspots';
import type { ConflictEvent, CasualtySummary, DashboardPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp      = req.nextUrl.searchParams;
    const slug    = parseTheaterSlug(sp);
    const theater = await resolveTheater(slug);
    const tid     = theater.theater_id;

    // Run all data fetches in parallel
    const [
      escalation, gci, hotspots,
      breaking, developments,
      casualties, damage, timeline,
      regions, dailySummary,
    ] = await Promise.all([
      computeEscalation(tid),
      computeGci(),
      computeHotspots(tid, 24, 6),
      fetchBreaking(tid),
      fetchDevelopments(tid),
      fetchCasualties(tid),
      fetchDamage(tid),
      fetchTimeline(tid),
      fetchRegions(tid),
      fetchDailySummary(tid),
    ]);

    const payload: DashboardPayload = {
      theater,
      escalation,
      gci,
      breaking,
      developments,
      casualties,
      damage,
      timeline,
      hotspots,
      regions,
      analysis:     await fetchLatestBrief(tid, slug),
      daily_summary: dailySummary,
      generated_at:  new Date().toISOString(),
    };

    return ok(payload);
  } catch (e) {
    return handleError(e);
  }
}

// ── Private fetchers ─────────────────────────────────────────────────────────

async function fetchBreaking(tid: string): Promise<ConflictEvent | null> {
  // Highest scored event in last 3h
  const rows = await sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e ${EVENT_SOURCE_JOIN}
    WHERE e.theater_id = $1
      AND e.timestamp_utc >= now() - interval '3 hours'
      AND e.confidence IN ('confirmed', 'likely')
    ${EVENT_GROUP_BY}
    ORDER BY e.importance_score DESC, e.timestamp_utc DESC
    LIMIT 1
  `, [tid]);
  return rows[0] ?? null;
}

async function fetchDevelopments(tid: string): Promise<ConflictEvent[]> {
  return sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e ${EVENT_SOURCE_JOIN}
    WHERE e.theater_id = $1
      AND e.timestamp_utc >= now() - interval '24 hours'
      AND e.confidence IN ('confirmed', 'likely')
      AND NOT e.is_signal
    ${EVENT_GROUP_BY}
    ORDER BY e.importance_score DESC, e.timestamp_utc DESC
    LIMIT 6
  `, [tid]);
}

async function fetchCasualties(tid: string): Promise<CasualtySummary[]> {
  return sql<CasualtySummary>(`
    SELECT
      country,
      SUM(COALESCE(killed, 0))::int          AS killed,
      SUM(COALESCE(injured, 0))::int         AS injured,
      SUM(COALESCE(civilian_killed, 0))::int AS civilian_killed,
      SUM(COALESCE(military_killed, 0))::int AS military_killed,
      MAX(confidence)                         AS confidence
    FROM casualty_reports
    WHERE theater_id = $1
      AND period_start >= now() - interval '24 hours'
    GROUP BY country
    ORDER BY SUM(COALESCE(killed, 0)) DESC
    LIMIT 8
  `, [tid]);
}

async function fetchDamage(tid: string): Promise<ConflictEvent[]> {
  return sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e ${EVENT_SOURCE_JOIN}
    WHERE e.theater_id = $1
      AND e.damage_asset IS NOT NULL
      AND e.timestamp_utc >= now() - interval '72 hours'
      AND e.confidence IN ('confirmed', 'likely')
    ${EVENT_GROUP_BY}
    ORDER BY e.importance_score DESC, e.timestamp_utc DESC
    LIMIT 4
  `, [tid]);
}

async function fetchTimeline(tid: string): Promise<ConflictEvent[]> {
  return sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e ${EVENT_SOURCE_JOIN}
    WHERE e.theater_id = $1
      AND e.timestamp_utc >= now() - interval '24 hours'
    ${EVENT_GROUP_BY}
    ORDER BY e.timestamp_utc DESC, e.importance_score DESC
    LIMIT 8
  `, [tid]);
}

async function fetchRegions(tid: string) {
  const events = await sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e ${EVENT_SOURCE_JOIN}
    WHERE e.theater_id = $1
      AND e.timestamp_utc >= now() - interval '24 hours'
      AND e.confidence IN ('confirmed', 'likely')
    ${EVENT_GROUP_BY}
    ORDER BY e.country_primary, e.importance_score DESC
    LIMIT 40
  `, [tid]);

  const byCountry: Record<string, ConflictEvent[]> = {};
  for (const ev of events) {
    (byCountry[ev.country_primary] ??= []).push(ev);
  }

  return Object.entries(byCountry).map(([country, evs]) => ({
    country,
    bullets:    evs.slice(0, 2).map(e => e.summary_20w),
    key_events: evs.slice(0, 4),
  }));
}

// ── Fix #1: fetch live AI brief from analysis_briefs instead of hardcoded text ─
// Falls back gracefully on a fresh deployment before the first 6h cron runs.
async function fetchLatestBrief(tid: string, slug: string) {
  const rows = await sql<{
    brief_id:     string;
    bullets:      string[] | string;
    sources:      string[] | string;
    generated_at: string;
  }>(`
    SELECT brief_id, bullets, sources, generated_at
    FROM   analysis_briefs
    WHERE  theater_id = $1
    ORDER  BY generated_at DESC
    LIMIT  1
  `, [tid]);

  if (!rows.length) {
    return {
      bullets:      ['No analysis brief available yet — check back after the next scheduled run.'],
      sources:      [] as string[],
      generated_at: new Date().toISOString(),
      theater_slug: slug,
    };
  }

  const row = rows[0];
  return {
    brief_id:     row.brief_id,
    bullets:      Array.isArray(row.bullets) ? row.bullets : JSON.parse(row.bullets as string),
    sources:      Array.isArray(row.sources) ? row.sources : JSON.parse(row.sources as string),
    generated_at: row.generated_at,
    theater_slug: slug,
  };
}

async function fetchDailySummary(tid: string) {
  const today = new Date().toISOString().split('T')[0];

  const typeRows = await sql<{ event_type: string; cnt: string }>(`
    SELECT event_type, COUNT(*) AS cnt
    FROM events
    WHERE theater_id  = $1
      AND timestamp_utc >= current_date
      AND NOT is_signal
    GROUP BY event_type
  `, [tid]);

  const by_type: Record<string, number> = {};
  let total = 0;
  for (const r of typeRows) {
    by_type[r.event_type] = parseInt(r.cnt, 10);
    total += parseInt(r.cnt, 10);
  }

  const top_events = await sql<ConflictEvent>(`
    SELECT ${EVENT_SELECT}
    FROM events e ${EVENT_SOURCE_JOIN}
    WHERE e.theater_id  = $1
      AND e.timestamp_utc >= current_date
      AND NOT e.is_signal
    ${EVENT_GROUP_BY}
    ORDER BY e.importance_score DESC
    LIMIT 3
  `, [tid]);

  return { date: today, total_incidents: total, by_type, top_events };
}
