// app/api/war-risk/route.ts
// GET /api/war-risk?theater=slug
// Returns War Probability Indicator (risk indicator — NOT a prediction).

import { NextRequest } from 'next/server';
import { ok, handleError, parseTheaterSlug } from '@/lib/api/response';
import { resolveTheater } from '@/lib/db/events';
import { computeWpi } from '@/lib/scoring/wpi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const sp      = req.nextUrl.searchParams;
    const slug    = parseTheaterSlug(sp);
    const theater = await resolveTheater(slug);
    const data    = await computeWpi(theater.theater_id);
    return ok({ ...data, theater: slug });
  } catch (e) {
    return handleError(e);
  }
}
