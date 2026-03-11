// workers/scheduler.ts
// Cron-based scheduler for all background workers.
//
// Schedule:
//   ingestion       every 5 minutes
//   brief gen       every 6 hours
//   alert dispatch  every 1 hour  (for 'hourly' frequency subscribers)
//   daily digest    once a day at 06:00 UTC
//
// Run with:  npx tsx workers/scheduler.ts
// In production on Vercel, use Vercel Cron:
//   vercel.json → "crons": [{ "path": "/api/cron/ingest", "schedule": "*/5 * * * *" }]

import * as dotenv from 'dotenv';
dotenv.config();

interface CronJob {
  name:        string;
  intervalMs:  number;
  fn:          () => Promise<void>;
  lastRun:     number;
}

// Lazily import workers to avoid startup cost
async function runIngest():  Promise<void> { const m = await import('./ingest');  await m.runIngestion(); }
async function runBriefs():  Promise<void> { const m = await import('./brief');   await m.runBriefGeneration(); }
async function runAlerts():  Promise<void> { const m = await import('./alerts');  await m.runAlertDispatch('hourly'); }
async function runDaily():   Promise<void> { const m = await import('./alerts');  await m.runAlertDispatch('daily'); }

const JOBS: CronJob[] = [
  { name: 'ingestion',     intervalMs: 5  * 60 * 1000, fn: runIngest,  lastRun: 0 },
  { name: 'brief_gen',     intervalMs: 6  * 60 * 60 * 1000, fn: runBriefs, lastRun: 0 },
  { name: 'hourly_alerts', intervalMs: 60 * 60 * 1000, fn: runAlerts,  lastRun: 0 },
  { name: 'daily_alerts',  intervalMs: 24 * 60 * 60 * 1000, fn: runDaily,  lastRun: 0 },
];

let running = false;

async function tick(): Promise<void> {
  if (running) return;  // prevent overlap
  running = true;
  const now = Date.now();
  for (const job of JOBS) {
    if (now - job.lastRun >= job.intervalMs) {
      job.lastRun = now;
      console.log(`[scheduler] Starting ${job.name}`);
      try {
        await job.fn();
        console.log(`[scheduler] ${job.name} OK`);
      } catch (err) {
        console.error(`[scheduler] ${job.name} ERROR:`, err);
      }
    }
  }
  running = false;
}

// Tick every 60 seconds (fine-grained enough for 5-min intervals)
const TICK_MS = 60_000;

async function main() {
  console.log('[scheduler] Starting GCM background worker scheduler');
  console.log('[scheduler] Jobs:', JOBS.map(j => `${j.name}@${j.intervalMs/60000}min`).join(', '));

  // Run ingestion immediately on startup
  console.log('[scheduler] Running initial ingestion...');
  try { await runIngest(); } catch (e) { console.error('[scheduler] Initial ingest failed:', e); }

  setInterval(tick, TICK_MS);
  console.log(`[scheduler] Ticking every ${TICK_MS/1000}s`);
}

main().catch(err => { console.error(err); process.exit(1); });
