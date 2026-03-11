// app/api/daily/route.ts
// GET /api/daily?theater=slug&date=YYYY-MM-DD
//
// Returns the daily summary data for the Daily Briefing page.
// Lightweight alternative to hitting the full /api/dashboard payload.
//
// Response:
//   {
//     date:             'YYYY-MM-DD',
//     theater_slug:     string,
//     theater_name:     string,
//     total_incidents:  number,
//     by_type:          Record<EventType, number>,
//     by_severity:      Record<Severity, number>,
//     top_events:       ConflictEvent[],   // top 5 by importance_score
//     brief:            AnalysisBrief | null,
//   }

import { NextRequest }                          from 'next/server';
import { ok, err, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql }                                  from '@/lib/db/pool';
import { EVENT_SELECT, EVENT_SOURCE_JOIN, EVENT_GROUP_BY } from '@/lib/db/events';
import type { ConflictEvent }                   from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const sp      = req.nextUrl.searchParams;
  const slug    = parseTheaterSlug(sp);

  // Optional date param — defaults to today UTC. Format: YYYY-MM-DD.
  const dateParam = sp.get('date');
  let targetDate: string;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam;
  } else {
    targetDate = new Date().toISOString().split('T')[0];
  }

  try {
    // Resolve theater
    const theaters = await sql<{ theater_id: string; name: string }>(`
      SELECT theater_id, name FROM theaters WHERE slug = $1 LIMIT 1
    `, [slug]);
    if (!theaters.length) return err('Theater not found', 404);
    const { theater_id: tid, name: theaterName } = theaters[0];

    // Run queries in parallel
    const [typeRows, sevRows, topEvents, brief] = await Promise.all([
      // Incidents by event type
      sql<{ event_type: string; cnt: string }>(`
        SELECT event_type, COUNT(*) AS cnt
        FROM events
        WHERE theater_id   = $1
          AND timestamp_utc >= $2::date
          AND timestamp_utc <  $2::date + interval '1 day'
          AND NOT is_signal
        GROUP BY event_type
        ORDER BY cnt DESC
      `, [tid, targetDate]),

      // Incidents by severity
      sql<{ severity: string; cnt: string }>(`
        SELECT severity, COUNT(*) AS cnt
        FROM events
        WHERE theater_id   = $1
          AND timestamp_utc >= $2::date
          AND timestamp_utc <  $2::date + interval '1 day'
          AND NOT is_signal
        GROUP BY severity
      `, [tid, targetDate]),

      // Top 5 events by importance score
      sql<ConflictEvent>(`
        SELECT ${EVENT_SELECT}
        FROM events e ${EVENT_SOURCE_JOIN}
        WHERE e.theater_id   = $1
          AND e.timestamp_utc >= $2::date
          AND e.timestamp_utc <  $2::date + interval '1 day'
          AND NOT e.is_signal
          AND e.confidence IN ('confirmed', 'likely')
        ${EVENT_GROUP_BY}
        ORDER BY e.importance_score DESC
        LIMIT 5
      `, [tid, targetDate]),

      // Latest brief for this theater (generated on or before end of target day)
      sql<{ brief_id: string; bullets: string[] | string; sources: string[] | string; generated_at: string }>(`
        SELECT brief_id, bullets, sources, generated_at
        FROM analysis_briefs
        WHERE theater_id  = $1
          AND generated_at < $2::date + interval '1 day'
        ORDER BY generated_at DESC
        LIMIT 1
      `, [tid, targetDate]),
    ]);

    const by_type: Record<string, number> = {};
    let total = 0;
    for (const r of typeRows) {
      by_type[r.event_type] = parseInt(r.cnt, 10);
      total += parseInt(r.cnt, 10);
    }

    const by_severity: Record<string, number> = {};
    for (const r of sevRows) {
      by_severity[r.severity] = parseInt(r.cnt, 10);
    }

    const latestBrief = brief[0] ?? null;
    const briefNorm = latestBrief ? {
      brief_id:    latestBrief.brief_id,
      bullets:     Array.isArray(latestBrief.bullets) ? latestBrief.bullets : JSON.parse(latestBrief.bullets as string),
      sources:     Array.isArray(latestBrief.sources) ? latestBrief.sources : JSON.parse(latestBrief.sources as string),
      generated_at: latestBrief.generated_at,
    } : null;

    return ok({
      date:            targetDate,
      theater_slug:    slug,
      theater_name:    theaterName,
      total_incidents: total,
      by_type,
      by_severity,
      top_events:      topEvents,
      brief:           briefNorm,
    });
  } catch (e) {
    return handleError(e);
  }
}
