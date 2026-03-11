// app/api/escalation/route.ts
// GET /api/escalation?theater=slug

import { NextRequest } from 'next/server';
import { ok, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { resolveTheater } from '@/lib/db/events';
import { computeEscalation, escalationTimeSeries } from '@/lib/scoring/escalation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp      = req.nextUrl.searchParams;
    const slug    = parseTheaterSlug(sp);
    const theater = await resolveTheater(slug);
    const tid     = theater.theater_id;

    const [escalation, timeSeries, topContributors] = await Promise.all([
      computeEscalation(tid),
      escalationTimeSeries(tid),

      // Top events contributing most escalation_points
      sql(`
        SELECT
          event_id, event_type, severity, confidence,
          headline, summary_20w, escalation_points,
          timestamp_utc, country_primary, location_name
        FROM events
        WHERE theater_id     = $1
          AND timestamp_utc >= now() - interval '72 hours'
          AND confidence     IN ('confirmed','likely')
        ORDER BY escalation_points DESC
        LIMIT 10
      `, [tid]),
    ]);

    return ok({
      ...escalation,
      time_series:     timeSeries,
      top_contributors: topContributors,
      methodology: {
        score_formula:    '72h rolling sum of event escalation_points, normalized 0–100',
        max_benchmark:    500,
        level_thresholds: { Low: '0–30', Medium: '31–60', High: '61–100' },
        trend_rule:       '> +10% Increasing; < -10% Decreasing; else Stable',
        note:             'Only confirmed/likely events counted.',
      },
      meta: { theater: slug },
    });
  } catch (e) {
    return handleError(e);
  }
}
