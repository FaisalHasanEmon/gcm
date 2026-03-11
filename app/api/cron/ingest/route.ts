// app/api/cron/ingest/route.ts
// Vercel Cron trigger for ingestion worker.
// vercel.json: { "crons": [{ "path": "/api/cron/ingest", "schedule": "*/5 * * * *" }] }
//
// Protected by CRON_SECRET header (set in Vercel env + vercel.json).

import { NextRequest } from 'next/server';
import { runIngestion } from '@/workers/ingest';
import { log } from '@/lib/logger';

export const dynamic  = 'force-dynamic';
export const maxDuration = 300;  // 5 min — Vercel Pro max for cron

export async function GET(req: NextRequest): Promise<Response> {
  // CRON_SECRET must be set in production. If absent, reject all external calls.
  // Vercel automatically adds: Authorization: Bearer <CRON_SECRET>
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    log.error('cron/ingest', 'CRON_SECRET is not set — rejecting request');
    return Response.json({ error: 'Cron not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  try {
    await runIngestion();
    return Response.json({ ok: true, durationMs: Date.now() - start });
  } catch (e) {
    log.error('cron/ingest', 'Ingestion failed', { error: String(e) });
    return Response.json({ ok: false, error: String(e), durationMs: Date.now() - start }, { status: 500 });
  }
}
