// lib/monitoring/job-alerts.ts
// Checks job_runs for silent failures and error-counter spikes.
// Called from GET /api/health and from the ingestion worker after each run.
//
// Emits:
//   - Structured log entries (always)
//   - Sentry alerts (when SENTRY_DSN is configured)
//   - Slack webhook (when SLACK_WEBHOOK_URL is configured — optional)
//
// Thresholds (all configurable via env):
//   JOB_MAX_LLM_ERROR_RATE    — fraction of items that may fail LLM (default 0.20)
//   JOB_MAX_GEO_FAIL_RATE     — fraction of items that may fail geocoding (default 0.30)
//   JOB_MAX_DISPATCH_FAILURES — absolute count of dispatch failures per run (default 5)
//   JOB_STALE_HOURS           — hours before a job is considered stale (default 2 for ingest, 8 for others)

import { sql }          from '../db/pool';
import { log }          from '../logger';
import { captureError } from '../errors';

interface JobRunRow {
  job_name:         string;
  started_at:       string;
  finished_at:      string | null;
  status:           string;
  items_fetched:    number | null;
  events_created:   number | null;
  llm_errors:       number | null;
  geocoding_failed: number | null;
  dispatch_failed:  number | null;
  error:            string | null;
}

export interface JobAlert {
  severity: 'error' | 'warn';
  job:      string;
  message:  string;
  details:  Record<string, unknown>;
}

const LLM_ERROR_RATE_THRESHOLD   = parseFloat(process.env.JOB_MAX_LLM_ERROR_RATE   ?? '0.20');
const GEO_FAIL_RATE_THRESHOLD    = parseFloat(process.env.JOB_MAX_GEO_FAIL_RATE    ?? '0.30');
const DISPATCH_FAIL_THRESHOLD    = parseInt(  process.env.JOB_MAX_DISPATCH_FAILURES ?? '5', 10);

// How many hours before each job type is considered "stale"
// Note: alert_instant is intentionally absent — instant alerts fire inline
// inside the ingestion worker (dispatchInstantAlert) rather than as a
// separate cron job, so they never create their own job_runs rows.
const STALE_HOURS: Record<string, number> = {
  ingestion:        2,
  brief_generation: 8,
  alert_hourly:     2,
  alert_daily:      26,   // daily — allow up to 2h of drift
  retention:        26,
};

/**
 * Check job_runs for silent failures and threshold violations.
 * Returns a list of alerts. Does not throw.
 */
export async function checkJobHealth(): Promise<JobAlert[]> {
  const alerts: JobAlert[] = [];

  try {
    // Fetch the most recent run for each job
    const rows = await sql<JobRunRow>(`
      SELECT DISTINCT ON (job_name)
        job_name, started_at, finished_at, status,
        items_fetched, events_created, llm_errors, geocoding_failed, dispatch_failed, error
      FROM job_runs
      ORDER BY job_name, started_at DESC
    `);

    const byJob = Object.fromEntries(rows.map(r => [r.job_name, r]));
    const now   = Date.now();

    for (const [jobName, staleHours] of Object.entries(STALE_HOURS)) {
      const run = byJob[jobName];

      // ── Stale job (no recent successful run) ──────────────────────────────
      if (!run) {
        alerts.push({
          severity: 'warn',
          job:      jobName,
          message:  `No runs recorded for job "${jobName}"`,
          details:  { stale_hours: staleHours },
        });
        continue;
      }

      const lastRunAge = (now - new Date(run.started_at).getTime()) / 3_600_000;
      if (lastRunAge > staleHours) {
        alerts.push({
          severity: 'error',
          job:      jobName,
          message:  `Job "${jobName}" has not run in ${lastRunAge.toFixed(1)}h (threshold: ${staleHours}h)`,
          details:  { last_run: run.started_at, age_hours: lastRunAge },
        });
      }

      // ── Run-level error ───────────────────────────────────────────────────
      if (run.status === 'error') {
        alerts.push({
          severity: 'error',
          job:      jobName,
          message:  `Job "${jobName}" last run failed`,
          details:  { started_at: run.started_at, error: run.error },
        });
      }

      // ── LLM error rate ────────────────────────────────────────────────────
      const fetched = run.items_fetched ?? 0;
      if (fetched > 0 && run.llm_errors != null) {
        const rate = run.llm_errors / fetched;
        if (rate > LLM_ERROR_RATE_THRESHOLD) {
          alerts.push({
            severity: 'warn',
            job:      jobName,
            message:  `High LLM error rate: ${(rate * 100).toFixed(1)}% (${run.llm_errors}/${fetched} items)`,
            details:  { llm_errors: run.llm_errors, items_fetched: fetched, rate },
          });
        }
      }

      // ── Geocoding failure rate ────────────────────────────────────────────
      if (fetched > 0 && run.geocoding_failed != null) {
        const rate = run.geocoding_failed / fetched;
        if (rate > GEO_FAIL_RATE_THRESHOLD) {
          alerts.push({
            severity: 'warn',
            job:      jobName,
            message:  `High geocoding failure rate: ${(rate * 100).toFixed(1)}% (${run.geocoding_failed}/${fetched} items)`,
            details:  { geocoding_failed: run.geocoding_failed, items_fetched: fetched, rate },
          });
        }
      }

      // ── Dispatch failures ─────────────────────────────────────────────────
      if ((run.dispatch_failed ?? 0) > DISPATCH_FAIL_THRESHOLD) {
        alerts.push({
          severity: 'warn',
          job:      jobName,
          message:  `High alert dispatch failures: ${run.dispatch_failed} failed sends`,
          details:  { dispatch_failed: run.dispatch_failed, threshold: DISPATCH_FAIL_THRESHOLD },
        });
      }
    }
  } catch (err) {
    log.error('monitoring', 'checkJobHealth failed', { error: String(err) });
  }

  return alerts;
}

/**
 * Run health check, log all alerts, send to Sentry/Slack if configured.
 * Safe to call from any context — never throws.
 */
export async function reportJobAlerts(): Promise<JobAlert[]> {
  const alerts = await checkJobHealth();

  for (const alert of alerts) {
    const logFn = alert.severity === 'error' ? log.error : log.warn;
    logFn('monitoring', alert.message, alert.details);

    // Report error-level alerts to Sentry
    if (alert.severity === 'error') {
      captureError('monitoring', new Error(alert.message), alert.details);
    }
  }

  // Send to Slack if configured
  if (alerts.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await sendSlackAlert(alerts).catch(err =>
      log.warn('monitoring', 'Slack alert failed', { error: String(err) })
    );
  }

  return alerts;
}

async function sendSlackAlert(alerts: JobAlert[]): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL!;
  const errors = alerts.filter(a => a.severity === 'error');
  const warns  = alerts.filter(a => a.severity === 'warn');

  const lines = [
    errors.length ? `*🔴 ${errors.length} error${errors.length > 1 ? 's' : ''}*` : '',
    warns.length  ? `*🟡 ${warns.length} warning${warns.length > 1 ? 's' : ''}*`  : '',
    '',
    ...alerts.map(a => `${a.severity === 'error' ? '🔴' : '🟡'} *${a.job}*: ${a.message}`),
  ].filter(Boolean);

  await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      text:    `*GCM Job Health Alert*\n${lines.join('\n')}`,
      unfurl_links: false,
    }),
    signal: AbortSignal.timeout(5_000),
  });
}
