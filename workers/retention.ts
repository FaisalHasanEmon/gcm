// workers/retention.ts
// Data retention worker — prunes rows that are no longer operationally needed.
//
// Targets:
//   raw_items          — keep last RAW_ITEMS_RETAIN_DAYS days (default 30).
//   job_runs           — keep last JOB_RUNS_RETAIN_DAYS days (default 90).
//   analysis_briefs    — keep last BRIEFS_RETAIN_DAYS days per theater (default 60).
//   alert_dispatch_log — keep last DISPATCH_LOG_RETAIN_DAYS days (default 90).
//                        Without pruning this grows ~365K rows/year at 100 subscribers
//                        × 20 events/day, and is queried on every dispatch run.
//
// Growth estimates without pruning:
//   raw_items:          ~25 items × 16 feeds × 288 runs/day ≈ 115 K rows/day → 42 M/year
//   job_runs:           ~300 rows/day → 110 K/year
//   alert_dispatch_log: ~100 subs × 20 events/day → 730 K/year
//
// Runs once daily at 03:00 UTC via vercel.json cron.

import * as dotenv from 'dotenv';
dotenv.config();

import { sql } from '../lib/db/pool';
import { log } from '../lib/logger';

const RAW_ITEMS_RETAIN_DAYS      = parseInt(process.env.RAW_ITEMS_RETAIN_DAYS      ?? '30',  10);
const JOB_RUNS_RETAIN_DAYS       = parseInt(process.env.JOB_RUNS_RETAIN_DAYS       ?? '90',  10);
const BRIEFS_RETAIN_DAYS         = parseInt(process.env.BRIEFS_RETAIN_DAYS         ?? '60',  10);
const DISPATCH_LOG_RETAIN_DAYS   = parseInt(process.env.DISPATCH_LOG_RETAIN_DAYS   ?? '90',  10);

export async function runRetention(): Promise<void> {
  const jobId = await startJobRun('retention');

  try {
    const results = await Promise.all([
      pruneRawItems(),
      pruneJobRuns(),
      pruneBriefs(),
      pruneDispatchLog(),
    ]);

    const [rawDeleted, jobDeleted, briefDeleted, dispatchDeleted] = results;
    const total = rawDeleted + jobDeleted + briefDeleted + dispatchDeleted;

    await finishJobRun(jobId, 'ok', total);
    log.info('retention', 'Pruning complete', {
      raw_items_deleted:      rawDeleted,
      job_runs_deleted:       jobDeleted,
      briefs_deleted:         briefDeleted,
      dispatch_log_deleted:   dispatchDeleted,
      retain_raw_days:        RAW_ITEMS_RETAIN_DAYS,
      retain_job_runs_days:   JOB_RUNS_RETAIN_DAYS,
      retain_briefs_days:     BRIEFS_RETAIN_DAYS,
      retain_dispatch_days:   DISPATCH_LOG_RETAIN_DAYS,
    });
  } catch (err) {
    await finishJobRun(jobId, 'error', 0, String(err));
    log.error('retention', 'Retention run failed', { error: String(err) });
    throw err;
  }
}

// ── Pruning helpers ───────────────────────────────────────────────────────────

async function pruneRawItems(): Promise<number> {
  const rows = await sql<{ deleted: string }>(`
    WITH deleted AS (
      DELETE FROM raw_items
      WHERE ingested_at < now() - ($1 || ' days')::interval
      RETURNING raw_id
    )
    SELECT COUNT(*) AS deleted FROM deleted
  `, [RAW_ITEMS_RETAIN_DAYS]);
  return parseInt(rows[0]?.deleted ?? '0', 10);
}

async function pruneJobRuns(): Promise<number> {
  const rows = await sql<{ deleted: string }>(`
    WITH deleted AS (
      DELETE FROM job_runs
      WHERE started_at < now() - ($1 || ' days')::interval
        AND status != 'running'
      RETURNING job_id
    )
    SELECT COUNT(*) AS deleted FROM deleted
  `, [JOB_RUNS_RETAIN_DAYS]);
  return parseInt(rows[0]?.deleted ?? '0', 10);
}

async function pruneBriefs(): Promise<number> {
  // Keep the most recent N days of briefs per theater — older ones are
  // superseded and the dashboard only ever reads the latest row.
  const rows = await sql<{ deleted: string }>(`
    WITH deleted AS (
      DELETE FROM analysis_briefs
      WHERE generated_at < now() - ($1 || ' days')::interval
      RETURNING brief_id
    )
    SELECT COUNT(*) AS deleted FROM deleted
  `, [BRIEFS_RETAIN_DAYS]);
  return parseInt(rows[0]?.deleted ?? '0', 10);
}

async function pruneDispatchLog(): Promise<number> {
  // Keep the dispatch log long enough to cover the longest dispatch window
  // (daily = 24h) many times over. 90 days is sufficient for debugging
  // subscriber delivery issues while keeping the table from growing without bound.
  const rows = await sql<{ deleted: string }>(`
    WITH deleted AS (
      DELETE FROM alert_dispatch_log
      WHERE dispatched_at < now() - ($1 || ' days')::interval
      RETURNING log_id
    )
    SELECT COUNT(*) AS deleted FROM deleted
  `, [DISPATCH_LOG_RETAIN_DAYS]);
  return parseInt(rows[0]?.deleted ?? '0', 10);
}

// ── Job run helpers ───────────────────────────────────────────────────────────

async function startJobRun(jobName: string): Promise<string> {
  const rows = await sql<{ job_id: string }>(`
    INSERT INTO job_runs (job_name, status) VALUES ($1,'running') RETURNING job_id
  `, [jobName]);
  return rows[0].job_id;
}

async function finishJobRun(
  jobId:   string,
  status:  'ok' | 'error',
  deleted: number,
  error?:  string
): Promise<void> {
  await sql(`
    UPDATE job_runs
    SET finished_at=now(), status=$2, events_created=$3, error=$4
    WHERE job_id=$1
  `, [jobId, status, deleted, error ?? null]);
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('retention.ts') || process.argv[1]?.endsWith('retention.js')) {
  runRetention().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
