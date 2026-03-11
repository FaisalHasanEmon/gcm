// app/api/damage/route.ts
// GET /api/damage?theater=slug&range=72h&category=Embassy|Airport|Energy|Military|Civil&confidence=confirmed

import { NextRequest } from 'next/server';
import { ok, handleError, parsePagination, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater, EVENT_SELECT, EVENT_SOURCE_JOIN, EVENT_GROUP_BY } from '@/lib/db/events';
import { parseRange, rangeToInterval } from '@/lib/db/timeframe';
import type { ConflictEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Category → SQL keyword map (safe — values are internal constants, not user-interpolated)
const CATEGORY_MAP: Record<string, string> = {
  Embassy:  'embassy',
  Airport:  'airport',
  Energy:   'oil',
  Military: 'base',
  Civil:    'civil',
};

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp       = req.nextUrl.searchParams;
    const slug     = parseTheaterSlug(sp);
    const hours    = parseRange(sp.get('range'), '72h');
    const category = sp.get('category') ?? '';
    const conf     = sp.get('confidence');
    const { page, pageSize, offset } = parsePagination(sp, 50);

    const theater  = await resolveTheater(slug);
    const tid      = theater.theater_id;
    const interval = rangeToInterval(hours);

    const keyword    = CATEGORY_MAP[category];
    const catClause  = keyword ? `AND lower(e.damage_asset) LIKE '%${keyword}%'` : '';
    const ALLOWED_CONF = new Set(['confirmed', 'likely', 'unconfirmed']);
    const safeConf   = conf && ALLOWED_CONF.has(conf) ? conf : null;
    const confClause = safeConf
      ? `AND e.confidence = '${safeConf}'`
      : `AND e.confidence IN ('confirmed','likely')`;

    const [events, countRows] = await Promise.all([
      sql<ConflictEvent>(`
        SELECT ${EVENT_SELECT}
        FROM events e ${EVENT_SOURCE_JOIN}
        WHERE e.theater_id     = $1
          AND e.damage_asset   IS NOT NULL
          AND e.timestamp_utc >= now() - interval '${interval}'
          ${confClause}
          ${catClause}
        ${EVENT_GROUP_BY}
        ORDER BY e.importance_score DESC, e.timestamp_utc DESC
        LIMIT $2 OFFSET $3
      `, [tid, pageSize, offset]),

      sql<{ total: string }>(`
        SELECT COUNT(*) AS total FROM events e
        WHERE e.theater_id     = $1
          AND e.damage_asset   IS NOT NULL
          AND e.timestamp_utc >= now() - interval '${interval}'
          ${confClause}
          ${catClause}
      `, [tid]),
    ]);

    return ok({
      data: events,
      pagination: { page, pageSize, total: parseInt(countRows[0]?.total ?? '0', 10) },
      meta: { theater: slug, range: `${hours}h`, category: category || 'all' },
    });
  } catch (e) {
    return handleError(e);
  }
}
