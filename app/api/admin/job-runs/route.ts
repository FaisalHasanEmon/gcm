// app/api/admin/job-runs/route.ts
// GET /api/admin/job-runs
// Returns recent background worker runs with health status for each job.
//
// Protected by ADMIN_SECRET (separate from CRON_SECRET).
// Set ADMIN_SECRET in Vercel env vars — keep it out of client bundles.
//
// Query params:
//   ?job=ingestion|brief_generation|alert_hourly|alert_daily  (optional filter)
//   ?limit=20  (default 20, max 100)
//
// Response shape:
//   {
//     jobs: {
//       [jobName]: {
//         last_run:    { status, started_at, duration_s, events_created, ... } | null,
//         last_ok_at:  ISO | null,
//         error_rate:  0.0–1.0  (last 10 runs),
//         health:      'ok' | 'warn' | 'error',
//       }
//     },
//     recent: JobRun[],  // last N runs across all jobs
//   }

import { NextRequest } from 'next/server';
import { sql }         from '@/lib/db/pool';
import { log }         from '@/lib/logger';

export const dynamic = 'force-dynamic';

const JOB_NAMES = ['ingestion', 'brief_generation', 'alert_hourly', 'alert_daily', 'retention'] as const;

interface JobRun {
  job_id:          string;
  job_name:        string;
  started_at:      string;
  finished_at:     string | null;
  status:          string;
  items_fetched:   number | null;
  events_created:  number | null;
  events_updated:  number | null;
  llm_errors:      number | null;
  geocoding_failed: number | null;
  dispatch_failed: number | null;
  error:           string | null;
  duration_s:      number | null;
}

export async function GET(req: NextRequest): Promise<Response> {
  // Auth check
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return Response.json({ error: 'Admin endpoint not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    log.warn('admin/job-runs', 'Unauthorized access attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp     = req.nextUrl.searchParams;
  const jobFilter = sp.get('job');
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));

  try {
    // Fetch recent runs
    const recentRuns = await sql<JobRun>(`
      SELECT
        job_id, job_name, started_at, finished_at, status,
        items_fetched, events_created, events_updated,
        llm_errors, geocoding_failed, dispatch_failed, error,
        EXTRACT(EPOCH FROM (COALESCE(finished_at, now()) - started_at))::int AS duration_s
      FROM job_runs
      ${jobFilter ? 'WHERE job_name = $2' : ''}
      ORDER BY started_at DESC
      LIMIT $1
    `, jobFilter ? [limit, jobFilter] : [limit]);

    // Build per-job health summary
    const jobSummary: Record<string, {
      last_run:   JobRun | null;
      last_ok_at: string | null;
      error_rate: number;
      health:     'ok' | 'warn' | 'error';
    }> = {};

    for (const jobName of JOB_NAMES) {
      const jobRuns = await sql<JobRun>(`
        SELECT
          job_id, job_name, started_at, finished_at, status,
          items_fetched, events_created, events_updated,
          llm_errors, geocoding_failed, dispatch_failed, error,
          EXTRACT(EPOCH FROM (COALESCE(finished_at, now()) - started_at))::int AS duration_s
        FROM job_runs
        WHERE job_name = $1
        ORDER BY started_at DESC
        LIMIT 10
      `, [jobName]);

      const lastRun   = jobRuns[0] ?? null;
      const lastOkRun = jobRuns.find(r => r.status === 'ok');
      const errCount  = jobRuns.filter(r => r.status === 'error').length;
      const errorRate = jobRuns.length > 0 ? errCount / jobRuns.length : 0;

      // Health: error if last run failed OR >50% error rate; warn if any errors
      let health: 'ok' | 'warn' | 'error' = 'ok';
      if (lastRun?.status === 'error' || errorRate > 0.5) health = 'error';
      else if (errorRate > 0 || (lastRun && !lastRun.finished_at)) health = 'warn';

      jobSummary[jobName] = {
        last_run:   lastRun,
        last_ok_at: lastOkRun?.finished_at ?? null,
        error_rate: Math.round(errorRate * 100) / 100,
        health,
      };
    }

    return Response.json({
      jobs:   jobSummary,
      recent: recentRuns,
      ts:     new Date().toISOString(),
    });
  } catch (e) {
    log.error('admin/job-runs', 'Failed to fetch job runs', { error: String(e) });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
