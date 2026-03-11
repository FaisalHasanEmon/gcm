// app/api/map/events/route.ts
// GET /api/map/events?theater=slug&range=24h&include_signals=false
// Returns lightweight marker payload only (no full text — keeps response small).

import { NextRequest } from 'next/server';
import { ok, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater } from '@/lib/db/events';
import { parseRange, rangeToInterval } from '@/lib/db/timeframe';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp            = req.nextUrl.searchParams;
    const slug          = parseTheaterSlug(sp);
    const hours         = parseRange(sp.get('range'), '24h');
    const inclSignals   = sp.get('include_signals') === 'true';

    const theater       = await resolveTheater(slug);
    const tid           = theater.theater_id;
    const interval      = rangeToInterval(hours);

    const signalClause  = inclSignals ? '' : 'AND NOT e.is_signal';

    const markers = await sql(`
      SELECT
        e.event_id,
        e.event_type,
        e.severity,
        e.confidence,
        e.is_signal,
        e.headline,
        e.summary_20w,
        e.country_primary,
        e.location_name,
        e.damage_asset,
        e.timestamp_utc,
        ST_Y(e.geom::geometry) AS lat,
        ST_X(e.geom::geometry) AS lon
      FROM events e
      WHERE e.theater_id     = $1
        AND e.timestamp_utc >= now() - interval '${interval}'
        AND e.geom            IS NOT NULL
        ${signalClause}
      ORDER BY e.timestamp_utc DESC
      LIMIT 500
    `, [tid]);

    return ok({
      markers,
      meta: { theater: slug, range: `${hours}h`, count: markers.length },
    });
  } catch (e) {
    return handleError(e);
  }
}
