// app/api/timeline/route.ts
// GET /api/timeline?theater=&range=&type=&severity=&confidence=&is_signal=&q=&cursor=&cursor_ts=&pageSize=

import { NextRequest } from 'next/server';
import { ok, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater, EVENT_SELECT, EVENT_SOURCE_JOIN, EVENT_GROUP_BY } from '@/lib/db/events';
import { parseRange, rangeToInterval } from '@/lib/db/timeframe';
import type { ConflictEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Allowlists for filter params — prevents SQL injection
const ALLOWED_TYPES = new Set([
  'airstrike','missile_launch','drone_attack','military_movement','naval_activity',
  'official_statement','warning_alert','explosion','infrastructure_damage','casualty_update','other'
]);
const ALLOWED_SEVERITIES   = new Set(['critical','high','medium','low']);
const ALLOWED_CONFIDENCES  = new Set(['confirmed','likely','unconfirmed']);

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp      = req.nextUrl.searchParams;
    const slug    = parseTheaterSlug(sp);
    const hours   = parseRange(sp.get('range'), '24h');
    const pageSize = Math.min(50, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));

    // Keyset pagination params (for infinite scroll)
    const cursor    = sp.get('cursor');
    const cursorTs  = sp.get('cursor_ts');

    // Allowlisted filters (safe to interpolate)
    const typeRaw  = sp.get('type')   ?? '';
    const sevRaw   = sp.get('severity') ?? '';
    const confRaw  = sp.get('confidence') ?? '';
    const signalRaw = sp.get('is_signal');

    const eventType  = ALLOWED_TYPES.has(typeRaw)   ? typeRaw  : null;
    const severity   = ALLOWED_SEVERITIES.has(sevRaw) ? sevRaw  : null;
    const confidence = ALLOWED_CONFIDENCES.has(confRaw) ? confRaw : null;

    // Search query — parameterized
    const searchQ = sp.get('q')?.trim().slice(0, 200) ?? null;

    const theater  = await resolveTheater(slug);
    const tid      = theater.theater_id;
    const interval = rangeToInterval(hours);

    // Build WHERE clauses (only validated values interpolated)
    const clauses: string[]  = [
      `e.theater_id     = $1`,
      `e.timestamp_utc >= now() - interval '${interval}'`,
    ];
    const params: unknown[] = [tid];
    let   pIdx             = 2;

    if (eventType)  { clauses.push(`e.event_type  = $${pIdx++}`); params.push(eventType);  }
    if (severity)   { clauses.push(`e.severity    = $${pIdx++}`); params.push(severity);   }
    if (confidence) { clauses.push(`e.confidence  = $${pIdx++}`); params.push(confidence); }
    if (signalRaw === 'true')  clauses.push(`e.is_signal = true`);
    if (signalRaw === 'false') clauses.push(`e.is_signal = false`);
    if (searchQ) {
      clauses.push(`(e.headline ILIKE $${pIdx} OR e.summary_20w ILIKE $${pIdx})`);
      params.push(`%${searchQ}%`);
      pIdx++;
    }

    // Keyset: events older than cursor (for next page)
    if (cursor && cursorTs) {
      clauses.push(`(e.timestamp_utc, e.event_id) < ($${pIdx}, $${pIdx + 1})`);
      params.push(cursorTs, cursor);
      pIdx += 2;
    }

    const where = `WHERE ${clauses.join(' AND ')}`;

    // Fetch one extra to detect hasMore
    params.push(pageSize + 1);
    const events = await sql<ConflictEvent>(`
      SELECT ${EVENT_SELECT}
      FROM events e ${EVENT_SOURCE_JOIN}
      ${where}
      ${EVENT_GROUP_BY}
      ORDER BY e.timestamp_utc DESC, e.event_id DESC
      LIMIT $${pIdx}
    `, params);

    const hasMore = events.length > pageSize;
    const data    = hasMore ? events.slice(0, pageSize) : events;
    const last    = data[data.length - 1];

    return ok({
      data,
      cursor_meta: {
        cursor:    hasMore && last ? last.event_id    : null,
        cursor_ts: hasMore && last ? last.timestamp_utc : null,
        hasMore,
      },
      meta: { theater: slug, range: `${hours}h` },
    });
  } catch (e) {
    return handleError(e);
  }
}
