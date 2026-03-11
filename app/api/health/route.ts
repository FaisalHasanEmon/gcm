// app/api/health/route.ts
// GET /api/health
//
// Used by load balancers, uptime monitors, and Vercel health checks.
// Does a DB ping, optional SMTP verify, and synchronous config check.
// Job health monitoring lives at GET /api/admin/monitor (separate, slower).
//
// Response shapes:
//   200 — DB reachable, no config errors
//     { ok: true, db: true, smtp: true|null, latency_ms, config: { warnings }, ts }
//
//   503 — DB unreachable OR config has error-level problems
//     { ok: false, db: false|true, smtp: false|null, db_error?, config: { has_errors, warnings }, ts }

import { getPool }                         from '@/lib/db/pool';
import { validateConfig, hasConfigErrors } from '@/lib/config';
import { log }                             from '@/lib/logger';

export const dynamic = 'force-dynamic';

const PROBE_TIMEOUT_MS = 3_000;

export async function GET(): Promise<Response> {
  const ts    = new Date().toISOString();
  const start = Date.now();

  // 1. Config validation (synchronous)
  const configWarnings  = validateConfig();
  const configHasErrors = hasConfigErrors(configWarnings);

  if (configWarnings.length > 0) {
    const errors = configWarnings.filter(w => w.level === 'error');
    const warns  = configWarnings.filter(w => w.level === 'warn');
    if (errors.length) log.error('health', 'Config errors', { errors: errors.map(e => `${e.key}: ${e.message}`).join('; ') });
    if (warns.length)  log.warn( 'health', 'Config warnings', { warnings: warns.map(w => `${w.key}: ${w.message}`).join('; ') });
  }

  // 2. DB probe
  let dbOk    = false;
  let dbError: string | undefined;

  try {
    const pool   = getPool();
    const client = await pool.connect();
    try {
      await Promise.race([
        client.query('SELECT 1'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`DB probe timed out after ${PROBE_TIMEOUT_MS} ms`)), PROBE_TIMEOUT_MS)
        ),
      ]);
      dbOk = true;
    } finally {
      client.release();
    }
  } catch (err) {
    dbError = String(err);
    log.error('health', 'DB probe failed', { error: dbError });
  }

  // 3. SMTP probe (only when SMTP is configured — skipped and reported as null otherwise)
  // Uses nodemailer verify() which opens a connection and sends EHLO; no mail sent.
  // A failed probe means every alert email and verification email will silently fail.
  let smtpOk:    boolean | null = null; // null = not configured
  let smtpError: string | undefined;

  if (process.env.SMTP_HOST && !/example\.com/i.test(process.env.SMTP_HOST)) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: PROBE_TIMEOUT_MS,
        greetingTimeout:   PROBE_TIMEOUT_MS,
      });
      await transporter.verify();
      smtpOk = true;
    } catch (err) {
      smtpOk    = false;
      smtpError = String(err);
      log.error('health', 'SMTP probe failed', { error: smtpError });
    }
  }

  // 4. Overall status — SMTP failure is surfaced in the response body but does
  // not cause 503; the core read-path remains up even if email alerts degrade.
  const ok     = dbOk && !configHasErrors;
  const status = ok ? 200 : 503;

  return Response.json(
    {
      ok,
      db:         dbOk,
      smtp:       smtpOk,
      latency_ms: Date.now() - start,
      config: {
        has_errors: configHasErrors,
        warnings:   configWarnings,
      },
      ...(dbError   ? { db_error:   dbError   } : {}),
      ...(smtpError ? { smtp_error: smtpError } : {}),
      ts,
    },
    { status }
  );
}
