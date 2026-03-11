// app/api/cron/alerts/route.ts
// vercel.json:
//   { "path": "/api/cron/alerts?freq=hourly", "schedule": "0 * * * *" }
//   { "path": "/api/cron/alerts?freq=daily",  "schedule": "0 6 * * *" }

import { NextRequest } from 'next/server';
import { runAlertDispatch } from '@/workers/alerts';
import type { AlertFrequency } from '@/workers/alerts';
import { log } from '@/lib/logger';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120;  // Must match vercel.json functions["app/api/cron/alerts/route.ts"]

export async function GET(req: NextRequest): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    log.error('cron/alerts', 'CRON_SECRET is not set — rejecting request');
    return Response.json({ error: 'Cron not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const freq = (req.nextUrl.searchParams.get('freq') ?? 'hourly') as AlertFrequency;
  try {
    await runAlertDispatch(freq);
    return Response.json({ ok: true, freq });
  } catch (e) {
    log.error('cron/alerts', 'Alert dispatch failed', { freq, error: String(e) });
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
