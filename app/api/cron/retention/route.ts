// app/api/cron/retention/route.ts
// vercel.json: { "path": "/api/cron/retention", "schedule": "0 3 * * *" }
// Runs once daily at 03:00 UTC.

import { NextRequest } from 'next/server';
import { runRetention } from '@/workers/retention';
import { log } from '@/lib/logger';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    log.error('cron/retention', 'CRON_SECRET is not set — rejecting request');
    return Response.json({ error: 'Cron not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  try {
    await runRetention();
    return Response.json({ ok: true, durationMs: Date.now() - start });
  } catch (e) {
    log.error('cron/retention', 'Retention run failed', { error: String(e) });
    return Response.json({ ok: false, error: String(e), durationMs: Date.now() - start }, { status: 500 });
  }
}
