// app/api/admin/subscribers/route.ts
// GET  /api/admin/subscribers           — list subscribers with delivery stats
// DELETE /api/admin/subscribers/:id     — force-remove a subscriber
//
// Protected by ADMIN_SECRET.
//
// Query params (GET):
//   ?channel=email|telegram|sms|push   — filter by channel
//   ?verified=true|false               — filter by verification state
//   ?unsubscribed=true|false           — default: false (active only)
//   ?limit=50                          — max 200
//   ?offset=0

import { NextRequest } from 'next/server';
import { sql }         from '@/lib/db/pool';
import { log }         from '@/lib/logger';

export const dynamic = 'force-dynamic';

function authCheck(req: NextRequest): Response | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return Response.json({ error: 'Admin endpoint not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    log.warn('admin/subscribers', 'Unauthorized access attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const denied = authCheck(req);
  if (denied) return denied;

  const sp           = req.nextUrl.searchParams;
  const channel      = sp.get('channel');
  const verifiedRaw  = sp.get('verified');
  const unsubRaw     = sp.get('unsubscribed') ?? 'false';
  const limit        = Math.min(200, Math.max(1, parseInt(sp.get('limit')  ?? '50',  10) || 50));
  const offset       = Math.max(0,               parseInt(sp.get('offset') ?? '0',   10) || 0);

  const ALLOWED_CHANNELS = new Set(['email', 'telegram', 'sms', 'push']);

  const clauses: string[]  = [];
  const params:  unknown[] = [];
  let   p = 1;

  if (channel && ALLOWED_CHANNELS.has(channel)) {
    clauses.push(`s.channel = $${p++}`);
    params.push(channel);
  }
  if (verifiedRaw === 'true' || verifiedRaw === 'false') {
    clauses.push(`s.verified = $${p++}`);
    params.push(verifiedRaw === 'true');
  }
  if (unsubRaw === 'true' || unsubRaw === 'false') {
    clauses.push(`s.unsubscribed = $${p++}`);
    params.push(unsubRaw === 'true');
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  try {
    const [rows, countRows] = await Promise.all([
      sql<{
        subscriber_id: string;
        channel:       string;
        // Address is masked to protect PII — show domain for email, partial for others
        address_masked: string;
        theaters:      string[] | null;
        countries:     string[] | null;
        event_types:   string[] | null;
        min_severity:  string;
        frequency:     string;
        verified:      boolean;
        unsubscribed:  boolean;
        created_at:    string;
        total_sent:    string;
        total_failed:  string;
        last_sent_at:  string | null;
      }>(`
        SELECT
          s.subscriber_id,
          s.channel,
          CASE
            WHEN s.channel = 'email'
              THEN regexp_replace(s.address, '^[^@]+', '***')
            ELSE left(s.address, 4) || '…'
          END                          AS address_masked,
          s.theaters,
          s.countries,
          s.event_types,
          s.min_severity,
          s.frequency,
          s.verified,
          s.unsubscribed,
          s.created_at,
          COUNT(dl.log_id) FILTER (WHERE dl.status = 'sent')   AS total_sent,
          COUNT(dl.log_id) FILTER (WHERE dl.status = 'failed') AS total_failed,
          MAX(dl.dispatched_at)                                 AS last_sent_at
        FROM subscribers s
        LEFT JOIN alert_dispatch_log dl ON dl.subscriber_id = s.subscriber_id
        ${where}
        GROUP BY s.subscriber_id
        ORDER BY s.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),

      sql<{ total: string }>(`
        SELECT COUNT(*) AS total FROM subscribers s ${where}
      `, params),
    ]);

    return Response.json({
      data:       rows,
      pagination: { limit, offset, total: parseInt(countRows[0]?.total ?? '0', 10) },
      ts:         new Date().toISOString(),
    });
  } catch (e) {
    log.error('admin/subscribers', 'Failed to fetch subscribers', { error: String(e) });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const denied = authCheck(req);
  if (denied) return denied;

  const sp  = req.nextUrl.searchParams;
  const id  = sp.get('id');

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return Response.json({ error: 'Valid subscriber_id required as ?id= param' }, { status: 400 });
  }

  try {
    const rows = await sql<{ subscriber_id: string }>(`
      DELETE FROM subscribers WHERE subscriber_id = $1 RETURNING subscriber_id
    `, [id]);

    if (rows.length === 0) {
      return Response.json({ error: 'Subscriber not found' }, { status: 404 });
    }

    log.info('admin/subscribers', 'Subscriber deleted by admin', { subscriber_id: id });
    return Response.json({ ok: true, deleted: id });
  } catch (e) {
    log.error('admin/subscribers', 'Delete failed', { error: String(e) });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/subscribers?id=<uuid>
// Body (all fields optional):
//   { suspended?: boolean, consecutive_failures?: number,
//     min_severity?: string, frequency?: string }
//
// Primary use-case: clear suspended=false after a transient SMTP outage so
// the subscriber resumes without the operator needing direct DB access.
export async function PATCH(req: NextRequest): Promise<Response> {
  const denied = authCheck(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const id = sp.get('id');

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return Response.json({ error: 'Valid subscriber_id required as ?id= param' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ALLOWED_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
  const ALLOWED_FREQS      = new Set(['instant', 'hourly', 'daily']);

  const setClauses: string[] = [];
  const params: unknown[]    = [id]; // $1 = subscriber_id
  let   p = 2;

  if (typeof body.suspended === 'boolean') {
    setClauses.push(`suspended = $${p++}`);
    params.push(body.suspended);
    // When clearing suspension, also reset the failure counter
    if (!body.suspended && !('consecutive_failures' in body)) {
      setClauses.push(`consecutive_failures = 0`);
    }
  }

  if (typeof body.consecutive_failures === 'number' && body.consecutive_failures >= 0) {
    setClauses.push(`consecutive_failures = $${p++}`);
    params.push(Math.floor(body.consecutive_failures));
  }

  if (typeof body.min_severity === 'string' && ALLOWED_SEVERITIES.has(body.min_severity)) {
    setClauses.push(`min_severity = $${p++}`);
    params.push(body.min_severity);
  }

  if (typeof body.frequency === 'string' && ALLOWED_FREQS.has(body.frequency)) {
    setClauses.push(`frequency = $${p++}`);
    params.push(body.frequency);
  }

  if (setClauses.length === 0) {
    return Response.json({ error: 'No valid fields to update. Allowed: suspended, consecutive_failures, min_severity, frequency' }, { status: 400 });
  }

  try {
    const rows = await sql<{ subscriber_id: string; suspended: boolean; consecutive_failures: number }>(`
      UPDATE subscribers
      SET ${setClauses.join(', ')}
      WHERE subscriber_id = $1
      RETURNING subscriber_id, suspended, consecutive_failures
    `, params);

    if (rows.length === 0) {
      return Response.json({ error: 'Subscriber not found' }, { status: 404 });
    }

    log.info('admin/subscribers', 'Subscriber updated by admin', { subscriber_id: id, changes: Object.keys(body) });
    return Response.json({ ok: true, subscriber: rows[0] });
  } catch (e) {
    log.error('admin/subscribers', 'Patch failed', { error: String(e) });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
