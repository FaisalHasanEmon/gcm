// app/api/analysis/route.ts
// GET /api/analysis?theater=slug&limit=10&before=<brief_id>
//
// Returns AI strategic analysis briefs with cursor-based pagination.
//
// Query params:
//   theater  — theater slug (default: me-iran-israel-us)
//   limit    — page size 1–50 (default 10)
//   before   — cursor: return briefs generated before this brief_id (for "load more")
//
// Response:
//   { data: Brief[], meta: { theater, count, has_more, next_cursor } }

import { NextRequest }                          from 'next/server';
import { ok, err, handleError, parseTheaterSlug } from '@/lib/api/response';
import { sql }                                  from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

interface BriefRow {
  brief_id:    string;
  bullets:     string[] | string;
  sources:     string[] | string;
  generated_at: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  const sp      = req.nextUrl.searchParams;
  const theater = parseTheaterSlug(sp);
  const limit   = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '10', 10) || 10));
  const before  = sp.get('before') ?? null;   // cursor: brief_id to paginate from

  try {
    // Resolve theater slug → id
    const theaters = await sql<{ theater_id: string }>(`
      SELECT theater_id FROM theaters WHERE slug = $1 LIMIT 1
    `, [theater]);
    if (!theaters.length) return err('Theater not found', 404);
    const theaterId = theaters[0].theater_id;

    // Build cursor clause — when `before` is supplied, fetch only briefs whose
    // generated_at is strictly before the cursor brief's generated_at.
    let cursorClause = '';
    const params: unknown[] = [theaterId, limit + 1]; // +1 to detect has_more

    if (before) {
      const cursorRow = await sql<{ generated_at: string }>(`
        SELECT generated_at FROM analysis_briefs
        WHERE brief_id = $1 AND theater_id = $2
        LIMIT 1
      `, [before, theaterId]);

      if (cursorRow.length) {
        params.push(cursorRow[0].generated_at);
        cursorClause = `AND generated_at < $${params.length}`;
      }
    }

    const briefs = await sql<BriefRow>(`
      SELECT brief_id, bullets, sources, generated_at
      FROM analysis_briefs
      WHERE theater_id = $1
        ${cursorClause}
      ORDER BY generated_at DESC
      LIMIT $2
    `, params);

    const hasMore    = briefs.length > limit;
    const page       = briefs.slice(0, limit);
    const nextCursor = hasMore ? page[page.length - 1].brief_id : null;

    // Normalise — bullets/sources stored as JSONB; pg driver may return
    // already-parsed arrays or strings depending on pool config.
    const data = page.map(b => ({
      brief_id:     b.brief_id,
      theater_slug: theater,
      bullets:      Array.isArray(b.bullets) ? b.bullets : JSON.parse(b.bullets as string),
      sources:      Array.isArray(b.sources) ? b.sources : JSON.parse(b.sources as string),
      generated_at: b.generated_at,
    }));

    return ok({
      data,
      meta: {
        theater,
        count:       data.length,
        has_more:    hasMore,
        next_cursor: nextCursor,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
