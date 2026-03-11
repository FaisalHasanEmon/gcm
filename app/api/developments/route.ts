// app/api/developments/route.ts
// GET /api/developments?theater=slug&range=24h&sort=impact|recency&page=1&pageSize=20

import { NextRequest } from 'next/server';
import { ok, handleError, parsePagination, parseTheaterSlug } from '@/lib/api/response';
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
    const sort  = sp.get('sort') === 'recency'
      ? 'e.timestamp_utc DESC, e.importance_score DESC'
      : 'e.importance_score DESC, e.timestamp_utc DESC';

    const { page, pageSize, offset } = parsePagination(sp, 50);
    const theater  = await resolveTheater(slug);
    const tid      = theater.theater_id;
    const interval = rangeToInterval(hours);

    const [events, countRows] = await Promise.all([
      sql<ConflictEvent>(`
        SELECT ${EVENT_SELECT}
        FROM events e ${EVENT_SOURCE_JOIN}
        WHERE e.theater_id     = $1
          AND e.timestamp_utc >= now() - interval '${interval}'
          AND e.confidence     IN ('confirmed','likely')
          AND NOT e.is_signal
        ${EVENT_GROUP_BY}
        ORDER BY ${sort}
        LIMIT $2 OFFSET $3
      `, [tid, pageSize, offset]),

      sql<{ total: string }>(`
        SELECT COUNT(*) AS total FROM events e
        WHERE e.theater_id     = $1
          AND e.timestamp_utc >= now() - interval '${interval}'
          AND e.confidence     IN ('confirmed','likely')
          AND NOT e.is_signal
      `, [tid]),
    ]);

    return ok({
      data: events,
      pagination: { page, pageSize, total: parseInt(countRows[0]?.total ?? '0', 10) },
      meta: { theater: slug, range: `${hours}h`, sort },
    });
  } catch (e) {
    return handleError(e);
  }
}
