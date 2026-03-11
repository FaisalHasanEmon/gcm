// app/api/admin/monitor/route.ts
// GET /api/admin/monitor
//
// Runs job health checks, logs results, and sends alerts to Sentry/Slack
// when thresholds are exceeded. Called by the monitor cron (every 15 min).
//
// Also accepts direct calls with ADMIN_SECRET for manual inspection.
// Returns the full alert list so operators can see the state at a glance.
//
// Protected by: CRON_SECRET (when called from cron) OR ADMIN_SECRET (direct).

import { NextRequest }        from 'next/server';
import { reportJobAlerts }    from '@/lib/monitoring/job-alerts';
import { log }                from '@/lib/logger';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<Response> {
  // Accept either cron auth or admin auth
  const cronSecret  = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;

  const auth = req.headers.get('authorization');
  const authed =
    (cronSecret  && auth === `Bearer ${cronSecret}`)  ||
    (adminSecret && auth === `Bearer ${adminSecret}`);

  if (!authed) {
    log.warn('admin/monitor', 'Unauthorized access attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  try {
    const alerts = await reportJobAlerts();
    const errors = alerts.filter(a => a.severity === 'error');
    const warns  = alerts.filter(a => a.severity === 'warn');

    log.info('admin/monitor', 'Health check complete', {
      alerts: alerts.length, errors: errors.length, warns: warns.length,
      duration_ms: Date.now() - start,
    });

    return Response.json({
      ok:          errors.length === 0,
      alerts,
      summary:     { errors: errors.length, warnings: warns.length },
      duration_ms: Date.now() - start,
      ts:          new Date().toISOString(),
    });
  } catch (e) {
    log.error('admin/monitor', 'Monitor check failed', { error: String(e) });
    return Response.json({ error: 'Monitor check failed', detail: String(e) }, { status: 500 });
  }
}
