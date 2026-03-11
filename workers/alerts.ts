// workers/alerts.ts
// Alert dispatch system.
// - Respects frequency: instant / hourly / daily
// - Filters: min_severity, theater, country, event_type
// - Only confirmed + likely events dispatched
// - Channels: email (SMTP), telegram (Bot API), sms (Twilio), push (FCM)
//   SMS and push require provider env vars — see workers/providers/sms.ts
//   and workers/providers/push.ts for setup instructions.
// - Double opt-in enforced: unverified subscribers are skipped

import * as dotenv from 'dotenv';
dotenv.config();

import { sql } from '../lib/db/pool';
import { log } from '../lib/logger';
import { sendSmsAlert }  from './providers/sms';
import { sendPushAlert } from './providers/push';
import {
  alertEmailHtml,
  alertEmailText,
  verificationEmailHtml,
  verificationEmailText,
} from '../lib/email/templates';

export type AlertFrequency = 'instant' | 'hourly' | 'daily';

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

// ── Main dispatch entry point ─────────────────────────────────────────────────

export async function runAlertDispatch(frequency: AlertFrequency): Promise<void> {
  let jobId: string;
  try {
    jobId = await startJobRun(`alert_${frequency}`);
  } catch (e) {
    if (e instanceof AlreadyRunningError) {
      log.info('alerts', e.message);
      return;
    }
    throw e;
  }

  let dispatched = 0, dispatchFailed = 0;

  try {
    const windowStart = frequencyToWindowStart(frequency);

    // Events in the dispatch window, confidence confirmed/likely only
    const events = await sql<{
      event_id: string; theater_id: string; theater_slug: string;
      headline: string; summary_20w: string; severity: string;
      confidence: string; country_primary: string; event_type: string;
      location_name: string; timestamp_utc: string; importance_score: number;
    }>(`
      SELECT e.event_id, e.theater_id, t.slug AS theater_slug,
             e.headline, e.summary_20w, e.severity, e.confidence,
             e.country_primary, e.event_type, e.location_name, e.timestamp_utc,
             e.importance_score
      FROM events e
      JOIN theaters t ON t.theater_id = e.theater_id
      WHERE e.timestamp_utc >= $1
        AND e.confidence IN ('confirmed','likely')
      ORDER BY e.importance_score DESC
      LIMIT 50
    `, [windowStart]);

    if (events.length === 0) {
      await finishJobRun(jobId, 'ok');
      return;
    }

    // Subscribers matching this frequency, verified, active, not bounce-suspended
    const subscribers = await sql<{
      subscriber_id: string; channel: string; address: string;
      theaters: string[] | null; countries: string[] | null;
      event_types: string[] | null; min_severity: string; frequency: string;
      unsub_token: string;
    }>(`
      SELECT subscriber_id, channel, address, theaters, countries,
             event_types, min_severity, frequency, unsub_token
      FROM subscribers
      WHERE verified       = true
        AND unsubscribed   = false
        AND suspended      = false
        AND frequency      = $1
    `, [frequency]);

    // Bulk-fetch all already-sent event_ids for this window, grouped by subscriber.
    // This replaces one SQL query per subscriber with a single query for all subscribers,
    // cutting dispatch latency from O(N × RTT) to O(1 × RTT).
    const subIds = subscribers.map(s => s.subscriber_id);
    const sentRows = subIds.length > 0
      ? await sql<{ subscriber_id: string; event_id: string }>(`
          SELECT subscriber_id, event_id
          FROM alert_dispatch_log
          WHERE subscriber_id = ANY($1)
            AND status        = 'sent'
            AND dispatched_at >= $2
        `, [subIds, windowStart])
      : [];

    // Build a map: subscriber_id → Set<event_id>
    const sentBySubscriber = new Map<string, Set<string>>();
    for (const row of sentRows) {
      let set = sentBySubscriber.get(row.subscriber_id);
      if (!set) { set = new Set(); sentBySubscriber.set(row.subscriber_id, set); }
      set.add(row.event_id);
    }

    for (const sub of subscribers) {
      const alreadySent = sentBySubscriber.get(sub.subscriber_id) ?? new Set<string>();

      const matched = events.filter(ev => {
        if (alreadySent.has(ev.event_id)) return false;
        if (sub.theaters?.length && !sub.theaters.includes(ev.theater_id)) return false;
        if (sub.countries?.length && !sub.countries.includes(ev.country_primary)) return false;
        if (sub.event_types?.length && !sub.event_types.includes(ev.event_type)) return false;
        const minRank = SEV_RANK[sub.min_severity] ?? 1;
        if ((SEV_RANK[ev.severity] ?? 0) < minRank) return false;
        return true;
      });

      if (matched.length === 0) continue;

      let sendStatus: 'sent' | 'failed' = 'sent';
      let sendError: string | undefined;
      try {
        if (sub.channel === 'email') {
          await sendEmailAlert(sub.address, matched, frequency, sub.unsub_token);
          dispatched++;
        } else if (sub.channel === 'telegram') {
          await sendTelegramAlert(sub.address, matched, frequency);
          dispatched++;
        } else if (sub.channel === 'sms') {
          await sendSmsAlert(sub.address, matched, frequency);
          dispatched++;
        } else if (sub.channel === 'push') {
          await sendPushAlert(sub.address, matched, frequency);
          dispatched++;
        }
      } catch (err) {
        sendStatus = 'failed';
        sendError  = String(err);
        dispatchFailed++;
        log.warn('alerts', 'Failed to send alert', { channel: sub.channel, address: sub.address, error: sendError });
      }

      // Update bounce counter — reset on success, increment (and maybe suspend) on failure
      await recordDeliveryOutcome(sub.subscriber_id, sendStatus, sendError);

      // Write one log row per dispatched event so future runs skip them
      for (const ev of matched) {
        await sql(`
          INSERT INTO alert_dispatch_log (subscriber_id, event_id, channel, status)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [sub.subscriber_id, ev.event_id, sub.channel, sendStatus]).catch(() => {/* non-fatal */});
      }
    }

    await finishJobRun(jobId, 'ok', dispatched, undefined, dispatchFailed);
    log.info('alerts', 'Dispatch complete', { frequency, dispatched, dispatchFailed });
  } catch (err) {
    await finishJobRun(jobId, 'error', 0, String(err), dispatchFailed);
  }
}

// ── Instant alerts (called from API route after event creation) ───────────────

export async function dispatchInstantAlert(eventId: string): Promise<void> {
  const events = await sql<{
    event_id: string; theater_id: string; headline: string; summary_20w: string;
    severity: string; confidence: string; country_primary: string;
    event_type: string; location_name: string; timestamp_utc: string;
    importance_score: number; theater_slug: string;
  }>(`
    SELECT e.*, t.slug AS theater_slug
    FROM events e JOIN theaters t ON t.theater_id = e.theater_id
    WHERE e.event_id = $1 AND e.confidence IN ('confirmed','likely')
  `, [eventId]);

  if (!events.length) return;
  const ev = events[0];

  const subscribers = await sql<{
    subscriber_id: string; channel: string; address: string;
    theaters: string[] | null; countries: string[] | null;
    event_types: string[] | null; min_severity: string; unsub_token: string;
  }>(`
    SELECT subscriber_id, channel, address, theaters, countries, event_types, min_severity, unsub_token
    FROM subscribers
    WHERE verified=true AND unsubscribed=false AND suspended=false AND frequency='instant'
  `);

  // Single bulk idempotency check: which subscribers already received this event?
  const subIds = subscribers.map(s => s.subscriber_id);
  const alreadySentRows = subIds.length > 0
    ? await sql<{ subscriber_id: string }>(`
        SELECT subscriber_id FROM alert_dispatch_log
        WHERE event_id = $1 AND subscriber_id = ANY($2) AND status = 'sent'
      `, [eventId, subIds])
    : [];
  const alreadySentSet = new Set(alreadySentRows.map(r => r.subscriber_id));

  for (const sub of subscribers) {
    const minRank = SEV_RANK[sub.min_severity] ?? 1;
    if ((SEV_RANK[ev.severity] ?? 0) < minRank) continue;
    if (sub.theaters?.length && !sub.theaters.includes(ev.theater_id)) continue;
    if (sub.countries?.length && !sub.countries.includes(ev.country_primary)) continue;
    if (sub.event_types?.length && !sub.event_types.includes(ev.event_type)) continue;
    if (alreadySentSet.has(sub.subscriber_id)) continue;

    let sendStatus: 'sent' | 'failed' = 'sent';
    let sendError: string | undefined;
    try {
      if (sub.channel === 'email')    await sendEmailAlert(sub.address, [ev as any], 'instant', sub.unsub_token);
      if (sub.channel === 'telegram') await sendTelegramAlert(sub.address, [ev as any], 'instant');
      if (sub.channel === 'sms')      await sendSmsAlert(sub.address, [ev as any], 'instant');
      if (sub.channel === 'push')     await sendPushAlert(sub.address, [ev as any], 'instant');
    } catch (err) {
      sendStatus = 'failed';
      sendError  = String(err);
      log.warn('alerts', 'Instant dispatch failed', { address: sub.address, error: sendError });
    }

    await recordDeliveryOutcome(sub.subscriber_id, sendStatus, sendError);
    await sql(`
      INSERT INTO alert_dispatch_log (subscriber_id, event_id, channel, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [sub.subscriber_id, eventId, sub.channel, sendStatus]).catch(() => {/* non-fatal */});
  }
}

// ── Bounce / delivery-failure tracking ───────────────────────────────────────
// After each delivery attempt, update the subscriber's consecutive_failures
// counter. Once it crosses BOUNCE_SUSPEND_AFTER the subscriber is automatically
// suspended so bad addresses don't degrade SMTP reputation on every run.
//
// Operators can review suspended subscribers via GET /api/admin/subscribers
// and hard-delete them; subscribers can also re-verify to clear the flag.

const BOUNCE_SUSPEND_AFTER = parseInt(process.env.BOUNCE_SUSPEND_AFTER ?? '5', 10);

async function recordDeliveryOutcome(
  subscriberId: string,
  status:       'sent' | 'failed',
  errorMsg?:    string
): Promise<void> {
  try {
    if (status === 'sent') {
      // Any successful delivery resets the failure streak
      await sql(`
        UPDATE subscribers
        SET consecutive_failures = 0
        WHERE subscriber_id = $1
      `, [subscriberId]);
    } else {
      // Increment; suspend automatically when threshold is crossed
      await sql(`
        UPDATE subscribers
        SET consecutive_failures = consecutive_failures + 1,
            last_failure_reason  = $2,
            suspended            = (consecutive_failures + 1) >= $3
        WHERE subscriber_id = $1
      `, [subscriberId, errorMsg ?? null, BOUNCE_SUSPEND_AFTER]);

      // Log the suspension event so operators can find it in logs
      const rows = await sql<{ suspended: boolean; consecutive_failures: number }>(`
        SELECT suspended, consecutive_failures FROM subscribers WHERE subscriber_id = $1
      `, [subscriberId]);
      if (rows[0]?.suspended) {
        log.warn('alerts', 'Subscriber suspended after repeated delivery failures', {
          subscriber_id:        subscriberId,
          consecutive_failures: rows[0].consecutive_failures,
          last_error:           errorMsg,
        });
      }
    }
  } catch (err) {
    // Non-fatal — never let bounce tracking break the dispatch loop
    log.warn('alerts', 'Failed to update delivery outcome', { subscriber_id: subscriberId, error: String(err) });
  }
}

// ── Email via SMTP (nodemailer) ───────────────────────────────────────────────

async function sendEmailAlert(
  to:         string,
  events:     { headline: string; summary_20w: string; severity: string; country_primary: string; confidence: string }[],
  frequency:  AlertFrequency,
  unsubToken: string = ''
): Promise<void> {
  if (!process.env.SMTP_HOST) {
    log.info('alerts', 'SMTP not configured — skipping email', { to });
    return;
  }

  // Dynamic require to avoid import overhead when SMTP not configured
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const subject = frequency === 'instant'
    ? `⚠ GCM ALERT: ${events[0].headline ?? events[0].summary_20w}`
    : `GCM ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest – ${events.length} event${events.length > 1 ? 's' : ''}`;

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gcm.example.com';
  const unsubUrl = unsubToken ? `${appUrl}/api/unsubscribe?token=${unsubToken}` : '';
  await transporter.sendMail({
    from:    process.env.SMTP_FROM ?? 'GCM Alerts <noreply@gcm.example.com>',
    to,
    subject,
    html:    alertEmailHtml(events, frequency, unsubUrl, appUrl),
    text:    alertEmailText(events, frequency, unsubUrl),
    headers: unsubUrl ? {
      'List-Unsubscribe':       `<${unsubUrl}>`,
      'List-Unsubscribe-Post':  'List-Unsubscribe=One-Click',
    } : {},
  });
}

// ── Telegram Bot API ──────────────────────────────────────────────────────────

async function sendTelegramAlert(
  chatId:    string,
  events:    { headline: string; summary_20w: string; severity: string; country_primary: string; confidence: string }[],
  frequency: AlertFrequency
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log.info('alerts', 'Telegram not configured — skipping', { chatId });
    return;
  }

  // Escape all MarkdownV2 reserved characters in user-supplied strings.
  // Unescaped chars (_*[]()~`>#+-=|{}.!) cause Telegram to reject the message.
  function esc(s: string): string {
    return s.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, c => `\\${c}`);
  }

  const SEV_EMOJI: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };
  const lines = events.slice(0, 5).map(ev => {
    const title    = esc(ev.headline ?? ev.summary_20w ?? '');
    const country  = esc(ev.country_primary ?? '');
    const conf     = esc(ev.confidence ?? '');
    const emoji    = SEV_EMOJI[ev.severity] ?? '⚪';
    return `${emoji} *${title}*\n_${country} · ${conf}_`;
  });

  const headerLabel = frequency === 'instant'
    ? '🚨 *GCM BREAKING ALERT*'
    : `📋 *GCM ${esc(frequency.toUpperCase())} DIGEST*`;

  const text = `${headerLabel}\n\n${lines.join('\n\n')}\n\n_Information subject to change\\. Confidence labels apply\\._`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
}

// ── Verification helpers (email magic link + telegram token handshake) ─────────

export async function sendVerificationEmail(
  to:    string,
  token: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gcm.example.com';
  const link   = `${appUrl}/api/verify?token=${token}`;

  if (!process.env.SMTP_HOST) {
    log.info('alerts', 'SMTP not configured — skipping verification email', { to, link });
    return;
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from:    process.env.SMTP_FROM ?? 'GCM <noreply@gcm.example.com>',
    to,
    subject: 'Confirm your GCM alert subscription',
    html:    verificationEmailHtml(link, appUrl),
    text:    verificationEmailText(link),
  });
}

export async function verifySubscriberToken(token: string): Promise<boolean> {
  const rows = await sql<{ subscriber_id: string; verify_expires: string }>(`
    SELECT subscriber_id, verify_expires FROM subscribers
    WHERE verify_token = $1 AND verified = false AND unsubscribed = false
    LIMIT 1
  `, [token]);
  if (!rows.length) return false;

  const { subscriber_id, verify_expires } = rows[0];
  // 30-second grace window guards against clock skew between the server and
  // email-link-click timing; tokens are 24h so 30s is immaterial for security.
  if (new Date(verify_expires).getTime() < Date.now() - 30_000) return false;

  await sql(`
    UPDATE subscribers
    SET verified=true, verify_token=null, verify_expires=null
    WHERE subscriber_id=$1
  `, [subscriber_id]);

  return true;
}

// ── Telegram handshake (subscriber sends /start <token> to bot) ───────────────

export async function processTelegramUpdate(body: any): Promise<void> {
  const text   = body?.message?.text as string | undefined;
  const chatId = String(body?.message?.chat?.id ?? '');
  if (!text || !chatId) return;

  // /start <verify_token> pattern
  const match = text.match(/^\/start\s+([a-f0-9]{32,64})$/i);
  if (!match) return;

  const token = match[1];
  const rows = await sql<{ subscriber_id: string; verify_expires: string }>(`
    SELECT subscriber_id, verify_expires FROM subscribers
    WHERE verify_token = $1 AND verified = false
      AND channel = 'telegram'
    LIMIT 1
  `, [token]);

  if (!rows.length) {
    await sendTelegramMessage(chatId, '❌ Token not found or already verified.');
    return;
  }
  if (new Date(rows[0].verify_expires).getTime() < Date.now() - 30_000) {
    await sendTelegramMessage(chatId, '❌ Token expired. Please re-subscribe.');
    return;
  }

  await sql(`
    UPDATE subscribers
    SET verified=true, verify_token=null, verify_expires=null, address=$2
    WHERE subscriber_id=$1
  `, [rows[0].subscriber_id, chatId]);

  await sendTelegramMessage(chatId, '✅ Subscription verified! You will now receive GCM alerts.');
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function frequencyToWindowStart(frequency: AlertFrequency): string {
  const intervals = { instant: '5 minutes', hourly: '1 hour', daily: '1 day' };
  return new Date(Date.now() - parseInterval(intervals[frequency])).toISOString();
}

function parseInterval(s: string): number {
  const [n, unit] = s.split(' ');
  const multipliers: Record<string, number> = { minutes: 60_000, hour: 3_600_000, day: 86_400_000 };
  return parseInt(n) * (multipliers[unit] ?? 60_000);
}

// Thrown when a concurrent instance of the same job is already running.
class AlreadyRunningError extends Error {
  constructor(jobName: string) { super(`${jobName} already running — skipping concurrent invocation`); }
}

async function startJobRun(jobName: string): Promise<string> {
  // Hourly alerts: guard 30-minute window (prevents double-firing on deploy overlap)
  // Daily alerts: guard 12-hour window (the job only runs once per day)
  const guardMinutes = jobName === 'alert_daily' ? 720 : 30;

  const active = await sql<{ job_id: string }>(`
    SELECT job_id FROM job_runs
    WHERE job_name = $1
      AND status   = 'running'
      AND started_at > now() - ($2 || ' minutes')::interval
    LIMIT 1
  `, [jobName, guardMinutes]);

  if (active.length > 0) {
    throw new AlreadyRunningError(jobName);
  }

  const rows = await sql<{ job_id: string }>(`
    INSERT INTO job_runs (job_name, status) VALUES ($1,'running') RETURNING job_id
  `, [jobName]);
  return rows[0].job_id;
}

async function finishJobRun(jobId: string, status: 'ok'|'error', dispatched = 0, error?: string, dispatchFailed = 0): Promise<void> {
  await sql(`
    UPDATE job_runs SET finished_at=now(), status=$2, events_created=$3, error=$4, dispatch_failed=$5 WHERE job_id=$1
  `, [jobId, status, dispatched, error ?? null, dispatchFailed]);
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('alerts.ts') || process.argv[1]?.endsWith('alerts.js')) {
  const freq = (process.argv[2] ?? 'hourly') as AlertFrequency;
  process.on('SIGTERM', () => { log.info('alerts', 'SIGTERM received'); });
  process.on('SIGINT',  () => process.exit(0));
  runAlertDispatch(freq).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
