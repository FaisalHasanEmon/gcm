// app/api/hotspots/route.ts
// GET /api/hotspots?theater=slug&range=24h&limit=8

import { NextRequest } from 'next/server';
import { ok, handleError, parseTheaterSlug } from '@/lib/api/response';
import { resolveTheater } from '@/lib/db/events';
import { parseRange } from '@/lib/db/timeframe';
import { computeHotspots } from '@/lib/geo/hotspots';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp    = req.nextUrl.searchParams;
    const slug  = parseTheaterSlug(sp);
    const hours = parseRange(sp.get('range'), '24h');
    const limit = Math.min(20, parseInt(sp.get('limit') ?? '8', 10) || 8);

    const theater  = await resolveTheater(slug);
    const hotspots = await computeHotspots(theater.theater_id, hours, limit);

    return ok({
      date:     new Date().toISOString().split('T')[0],   // today's date (site timezone)
      hotspots,
      meta:     { theater: slug, range: `${hours}h` },
    });
  } catch (e) {
    return handleError(e);
  }
}
