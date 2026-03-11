// app/api/unsubscribe/route.ts
// POST /api/unsubscribe — programmatic unsubscribe
// Body: { token: string } OR { address: string, channel: string }
//
// GET /api/unsubscribe?token=<unsub_token> — one-click unsubscribe
// RFC 8058 requires email clients to be able to unsubscribe with a GET request
// when the List-Unsubscribe-Post header is present. Many clients (Gmail, Apple
// Mail) send a GET to the List-Unsubscribe URL rather than a POST.

import { NextRequest } from 'next/server';
import { ok, err, handleError } from '@/lib/api/response';
import { getPool } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) {
    return Response.redirect(new URL('/subscribe?error=missing_token', req.url));
  }

  try {
    const pool   = getPool();
    const result = await pool.query(
      `UPDATE subscribers SET unsubscribed = true WHERE unsub_token = $1 RETURNING subscriber_id`,
      [token]
    );
    if (result.rowCount === 0) {
      // Already unsubscribed or token invalid — still redirect to success so
      // email clients that retry don't show an error to the user.
      return Response.redirect(new URL('/subscribe?unsubscribed=1', req.url));
    }
    return Response.redirect(new URL('/subscribe?unsubscribed=1', req.url));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json() as
      | { token: string }
      | { address: string; channel: string };

    const pool = getPool();

    if ('token' in body && body.token) {
      const result = await pool.query(
        `UPDATE subscribers SET unsubscribed = true WHERE unsub_token = $1 RETURNING subscriber_id`,
        [body.token]
      );
      if (result.rowCount === 0) return err('Token not found or already unsubscribed', 404);
    } else if ('address' in body) {
      const result = await pool.query(
        `UPDATE subscribers SET unsubscribed = true WHERE address = $1 AND channel = $2 AND unsubscribed = false`,
        [(body as any).address, (body as any).channel]
      );
      if (result.rowCount === 0) return err('Subscription not found', 404);
    } else {
      return err('Provide token or address+channel', 400);
    }

    return ok({ ok: true, message: 'Unsubscribed successfully.' });
  } catch (e) {
    return handleError(e);
  }
}
