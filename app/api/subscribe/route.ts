// app/api/subscribe/route.ts
// POST /api/subscribe
// Body: { channel, address, theaters?, countries?, event_types?, min_severity?, frequency? }

import { NextRequest } from 'next/server';
import { ok, err, handleError } from '@/lib/api/response';
import { sql } from '@/lib/db/pool';
import { log } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface SubscribeBody {
  channel:      'email' | 'telegram';
  address:      string;
  theaters?:    string[];        // theater slugs
  countries?:   string[];
  event_types?: string[];
  min_severity?: 'critical' | 'high' | 'medium' | 'low';
  frequency?:   'instant' | 'hourly' | 'daily';
}

const ALLOWED_CHANNELS   = new Set(['email', 'telegram']);
const ALLOWED_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const ALLOWED_FREQS      = new Set(['instant', 'hourly', 'daily']);
const ALLOWED_EVENT_TYPES = new Set([
  'airstrike','missile_launch','drone_attack','military_movement','naval_activity',
  'official_statement','warning_alert','explosion','infrastructure_damage','casualty_update','other',
]);

// RFC 5321 max email length is 254 chars
const EMAIL_MAX_LEN = 254;
// Telegram chat IDs are numeric strings, typically 5–15 digits
const TELEGRAM_MAX_LEN = 20;
// Loose RFC 5322-compatible email regex — rejects obviously malformed addresses
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Export for unit testing
export function validateAddress(channel: string, address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return 'address is required';

  if (channel === 'email') {
    if (trimmed.length > EMAIL_MAX_LEN)
      return `email address must be ${EMAIL_MAX_LEN} characters or fewer`;
    if (!EMAIL_RE.test(trimmed))
      return 'email address is not valid';
  }

  if (channel === 'telegram') {
    if (trimmed.length > TELEGRAM_MAX_LEN)
      return 'telegram address is not valid';
  }

  return null; // valid
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body: SubscribeBody = await req.json();
    const { channel, address, theaters, countries, event_types, min_severity, frequency } = body;

    // ── Validate required fields ─────────────────────────────────────────────
    if (!ALLOWED_CHANNELS.has(channel))
      return err('Invalid channel — must be "email" or "telegram"', 400);

    const addrError = validateAddress(channel, address);
    if (addrError) return err(addrError, 400);

    // ── Validate optional array fields ───────────────────────────────────────
    if (countries !== undefined) {
      if (!Array.isArray(countries) || countries.length > 20)
        return err('countries must be an array of up to 20 strings', 400);
      if (countries.some(c => typeof c !== 'string' || c.length > 60))
        return err('each country must be a string of up to 60 characters', 400);
    }

    if (event_types !== undefined) {
      if (!Array.isArray(event_types) || event_types.length > ALLOWED_EVENT_TYPES.size)
        return err('event_types must be an array of known event type strings', 400);
      const invalid = event_types.filter(t => !ALLOWED_EVENT_TYPES.has(t));
      if (invalid.length > 0)
        return err(`unknown event_type(s): ${invalid.join(', ')}`, 400);
    }

    if (theaters !== undefined) {
      if (!Array.isArray(theaters) || theaters.length > 20)
        return err('theaters must be an array of up to 20 slugs', 400);
      if (theaters.some(t => typeof t !== 'string' || t.length > 100))
        return err('each theater slug must be a string of up to 100 characters', 400);
    }

    const sev  = ALLOWED_SEVERITIES.has(min_severity ?? '') ? min_severity : 'high';
    const freq = ALLOWED_FREQS.has(frequency ?? '')         ? frequency    : 'instant';

    // Resolve theater slugs → UUIDs
    let theaterIds: string[] | null = null;
    if (theaters?.length) {
      const rows = await sql<{ theater_id: string }>(
        `SELECT theater_id FROM theaters WHERE slug = ANY($1) AND is_active = true`,
        [theaters]
      );
      theaterIds = rows.map(r => r.theater_id);
    }

    // Generate tokens
    const verifyToken  = crypto.randomBytes(32).toString('hex');
    const unsubToken   = crypto.randomBytes(32).toString('hex');
    const verifyExpiry = new Date(Date.now() + 24 * 3_600_000).toISOString();

    // Upsert subscriber.
    // If the address already exists and is still unverified, refresh the token
    // so a new verification email can be sent (re-subscribe flow).
    // If already verified or unsubscribed, the ON CONFLICT DO NOTHING
    // path returns no rows and we fall through without sending a duplicate email.
    await sql(`
      INSERT INTO subscribers
        (channel, address, theaters, countries, event_types,
         min_severity, frequency, verify_token, verify_expires, unsub_token)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (channel, address) WHERE unsubscribed = false DO UPDATE
        SET verify_token   = EXCLUDED.verify_token,
            verify_expires = EXCLUDED.verify_expires
        WHERE subscribers.verified = false
    `, [
      channel, address.trim(),
      theaterIds, countries ?? null, event_types ?? null,
      sev, freq, verifyToken, verifyExpiry, unsubToken,
    ]);

    // Dispatch verification based on channel.
    // The upsert above guarantees verifyToken is now in the DB if the subscriber
    // is new or was previously unverified — so we can send directly.
    try {
      if (channel === 'email') {
        const { sendVerificationEmail } = await import('@/workers/alerts');
        // Only send if the row actually holds our new token (i.e. new or refreshed).
        // Already-verified subscribers are excluded by the upsert WHERE clause,
        // so their token was not overwritten and this lookup returns nothing.
        const rows = await sql<{ subscriber_id: string }>(`
          SELECT subscriber_id FROM subscribers WHERE verify_token = $1 LIMIT 1
        `, [verifyToken]);
        if (rows[0]) {
          await sendVerificationEmail(address.trim(), verifyToken);
        }
      }
      // Telegram: subscriber sends /start <token> to the bot — no outbound needed here
    } catch (verifyErr) {
      // Non-fatal: subscription still stored, verification email is best-effort
      log.warn('subscribe', 'Verification dispatch failed', { error: String(verifyErr) });
    }

    return ok({
      ok:      true,
      message: channel === 'telegram'
        ? `Subscription registered. Open Telegram, start a chat with the bot, and send: /start ${verifyToken}`
        : 'Subscription registered. Check your inbox for a verification link.',
    });
  } catch (e) {
    return handleError(e);
  }
}
