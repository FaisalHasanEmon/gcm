// app/api/forecasting/route.ts
import { NextRequest } from 'next/server';
import { ok, err, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { computeForecasting } from '@/lib/intelligence/forecasting';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const sp     = req.nextUrl.searchParams;
  const theater = parseTheaterSlug(sp);

  try {
    const theaters = await sql<{ theater_id: string; slug: string }>(`
      SELECT theater_id, slug FROM theaters WHERE slug = $1 LIMIT 1
    `, [theater]);
    if (!theaters.length) return err('Theater not found', 404);
    const { theater_id, slug } = theaters[0];

    const report = await computeForecasting(theater_id, slug);

    return ok({
      ...report,
      note: 'These are INDICATORS only. Not predictions. Always verify with primary sources.',
    });
  } catch (e) {
    return handleError(e);
  }
}
