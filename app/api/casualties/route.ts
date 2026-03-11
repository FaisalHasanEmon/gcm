// app/api/casualties/route.ts
// GET /api/casualties?theater=slug&range=24h&page=1&pageSize=20

import { NextRequest } from 'next/server';
import { ok, handleError, parsePagination, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater } from '@/lib/db/events';
import { parseRange, rangeToInterval } from '@/lib/db/timeframe';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp    = req.nextUrl.searchParams;
    const slug  = parseTheaterSlug(sp);
    const hours = parseRange(sp.get('range'), '24h');
    const { page, pageSize, offset } = parsePagination(sp, 100);

    const theater  = await resolveTheater(slug);
    const tid      = theater.theater_id;
    const interval = rangeToInterval(hours);

    const [rows, totalsRow] = await Promise.all([
      // Per-country summary
      sql(`
        SELECT
          country,
          SUM(COALESCE(killed, 0))::int           AS killed,
          SUM(COALESCE(injured, 0))::int          AS injured,
          SUM(COALESCE(civilian_killed, 0))::int  AS civilian_killed,
          SUM(COALESCE(civilian_injured, 0))::int AS civilian_injured,
          SUM(COALESCE(military_killed, 0))::int  AS military_killed,
          SUM(COALESCE(military_injured, 0))::int AS military_injured,
          MAX(confidence)                          AS confidence,
          jsonb_agg(DISTINCT sources)              AS sources
        FROM casualty_reports
        WHERE theater_id   = $1
          AND period_start >= now() - interval '${interval}'
        GROUP BY country
        ORDER BY SUM(COALESCE(killed, 0)) DESC NULLS LAST
        LIMIT $2 OFFSET $3
      `, [tid, pageSize, offset]),

      // Grand totals
      sql<{ killed: string; injured: string }>(`
        SELECT
          SUM(COALESCE(killed, 0))::int  AS killed,
          SUM(COALESCE(injured, 0))::int AS injured
        FROM casualty_reports
        WHERE theater_id   = $1
          AND period_start >= now() - interval '${interval}'
      `, [tid]),
    ]);

    return ok({
      data:    rows,
      totals:  { killed: parseInt(totalsRow[0]?.killed ?? '0', 10), injured: parseInt(totalsRow[0]?.injured ?? '0', 10) },
      pagination: { page, pageSize },
      meta: { theater: slug, range: `${hours}h` },
    });
  } catch (e) {
    return handleError(e);
  }
}
