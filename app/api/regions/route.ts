// app/api/regions/route.ts
// GET /api/regions?theater=slug&range=24h

import { NextRequest } from 'next/server';
import { ok, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater, EVENT_SELECT, EVENT_SOURCE_JOIN, EVENT_GROUP_BY } from '@/lib/db/events';
import { parseRange, rangeToInterval } from '@/lib/db/timeframe';
import type { ConflictEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp    = req.nextUrl.searchParams;
    const slug  = parseTheaterSlug(sp);
    const hours = parseRange(sp.get('range'), '24h');

    const theater  = await resolveTheater(slug);
    const tid      = theater.theater_id;
    const interval = rangeToInterval(hours);

    const events = await sql<ConflictEvent>(`
      SELECT ${EVENT_SELECT}
      FROM events e ${EVENT_SOURCE_JOIN}
      WHERE e.theater_id     = $1
        AND e.timestamp_utc >= now() - interval '${interval}'
        AND e.confidence     IN ('confirmed','likely')
      ${EVENT_GROUP_BY}
      ORDER BY e.country_primary ASC, e.importance_score DESC
      LIMIT 60
    `, [tid]);

    // Group into per-country summaries
    const byCountry: Record<string, ConflictEvent[]> = {};
    for (const ev of events) {
      (byCountry[ev.country_primary] ??= []).push(ev);
    }

    const regions = Object.entries(byCountry).map(([country, evs]) => ({
      country,
      bullets:    evs.slice(0, 3).map(e => e.summary_20w),
      key_events: evs.slice(0, 5),
    }));

    return ok({
      data: regions,
      meta: { theater: slug, range: `${hours}h` },
    });
  } catch (e) {
    return handleError(e);
  }
}
