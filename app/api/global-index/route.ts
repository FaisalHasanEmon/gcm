// app/api/global-index/route.ts
// GET /api/global-index
// Returns GCI across all active theaters — no theater filter needed.

import { ok, handleError } from '@/lib/api/response';
import { computeGci } from '@/lib/scoring/gci';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const data = await computeGci();
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
