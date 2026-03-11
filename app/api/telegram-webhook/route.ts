// app/api/telegram-webhook/route.ts
// Receives updates from Telegram Bot API.
// Register webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook
//   { "url": "https://your-domain.com/api/telegram-webhook" }
//
// Handles:
//   /start <verify_token>  → verifies subscriber
//   /stop                  → unsubscribes

import { NextRequest } from 'next/server';
import { processTelegramUpdate } from '@/workers/alerts';
import { sql } from '@/lib/db/pool';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  // TELEGRAM_WEBHOOK_SECRET must always be set in production.
  // If absent, reject all requests to prevent unauthenticated webhook calls.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    log.error('telegram-webhook', 'TELEGRAM_WEBHOOK_SECRET is not set — rejecting all requests');
    return Response.json({ ok: false, error: 'Webhook not configured' }, { status: 503 });
  }

  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== expectedSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await req.json();
    await processTelegramUpdate(body);

    // Handle /stop command
    const text   = body?.message?.text as string | undefined;
    const chatId = String(body?.message?.chat?.id ?? '');
    if (text === '/stop' && chatId) {
      await sql(`
        UPDATE subscribers SET unsubscribed=true
        WHERE channel='telegram' AND address=$1
      `, [chatId]);
    }

    return Response.json({ ok: true });
  } catch (e) {
    log.error('telegram-webhook', 'Update processing failed', { error: String(e) });
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
