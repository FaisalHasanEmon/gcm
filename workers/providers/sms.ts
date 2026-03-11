// workers/providers/sms.ts
// SMS alert provider — Twilio integration.
//
// ── Setup ────────────────────────────────────────────────────────────────────
// 1. Install SDK:   npm install twilio
// 2. Add env vars in Vercel (Project → Settings → Environment Variables):
//
//      TWILIO_ACCOUNT_SID  = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//      TWILIO_AUTH_TOKEN   = <token from Twilio console>
//      TWILIO_FROM_NUMBER  = +15005550006   (your Twilio number or Messaging Service SID)
//
// 3. In workers/alerts.ts, uncomment the sendSmsAlert import and call.
//
// ── Status ───────────────────────────────────────────────────────────────────
// The subscribe UI hides the SMS channel (app/subscribe/page.tsx) until this
// provider is fully wired up and tested. Once TWILIO_* vars are set in
// production, re-enable 'sms' in ALLOWED_CHANNELS in app/api/subscribe/route.ts.

import type { AlertFrequency } from '../alerts';

interface SmsEvent {
  headline:        string;
  summary_20w:     string;
  severity:        string;
  country_primary: string;
  confidence:      string;
}

/**
 * Send an SMS alert via Twilio.
 *
 * @param toNumber  E.164 phone number, e.g. '+61412345678'
 * @param events    List of conflict events to include
 * @param frequency Alert frequency label
 */
export async function sendSmsAlert(
  toNumber:  string,
  events:    SmsEvent[],
  frequency: AlertFrequency,
): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    // Log missing config but don't throw — caller marks as skipped, not failed.
    console.warn('[sms] Twilio env vars not set — skipping SMS dispatch');
    return;
  }

  // Dynamic import so the twilio package is only pulled in when SMS is active.
  const twilio = await import('twilio').then(m => m.default ?? m);
  const client = twilio(sid, token);

  const label  = frequency === 'instant' ? '🚨 GCM ALERT' : `📋 GCM ${frequency.toUpperCase()} DIGEST`;
  const body   = formatSmsBody(label, events);

  await client.messages.create({ body, from, to: toNumber });
}

// ── Formatter ─────────────────────────────────────────────────────────────────
// SMS bodies must be ≤160 chars for a single segment (1 credit).
// We truncate aggressively and include only the top event.

function formatSmsBody(label: string, events: SmsEvent[]): string {
  const ev   = events[0];
  if (!ev) return `${label}: No events.`;

  const sevEmoji: Record<string, string> = {
    critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
  };
  const icon    = sevEmoji[ev.severity] ?? '⚪';
  const summary = ev.headline ?? ev.summary_20w ?? '';

  // Truncate to keep total under 160 chars
  const prefix  = `${label} ${icon} ${ev.country_primary}: `;
  const maxText = 155 - prefix.length;
  const text    = summary.length > maxText ? summary.slice(0, maxText - 1) + '…' : summary;

  const suffix  = events.length > 1 ? ` (+${events.length - 1} more)` : '';
  return prefix + text + suffix;
}
