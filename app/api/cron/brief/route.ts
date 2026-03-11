// app/api/cron/brief/route.ts
// vercel.json: { "crons": [{ "path": "/api/cron/brief", "schedule": "0 */6 * * *" }] }

import { NextRequest } from 'next/server';
import { runBriefGeneration } from '@/workers/brief';
import { log } from '@/lib/logger';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    log.error('cron/brief', 'CRON_SECRET is not set — rejecting request');
    return Response.json({ error: 'Cron not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await runBriefGeneration();
    return Response.json({ ok: true });
  } catch (e) {
    log.error('cron/brief', 'Brief generation failed', { error: String(e) });
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
