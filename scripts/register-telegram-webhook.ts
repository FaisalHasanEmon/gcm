#!/usr/bin/env tsx
// scripts/register-telegram-webhook.ts
// One-time setup: registers your deployed URL with Telegram's Bot API so
// the bot can receive messages and verify subscriber tokens.
//
// Run once after every domain change. Safe to re-run — Telegram replaces
// any previously registered webhook.
//
// Usage:
//   npx tsx scripts/register-telegram-webhook.ts
//
// Required env vars (set in .env.local or pass inline):
//   TELEGRAM_BOT_TOKEN      — from @BotFather
//   TELEGRAM_WEBHOOK_SECRET — any random string; must match Vercel env var
//   NEXT_PUBLIC_APP_URL     — your deployed domain, e.g. https://gcm.vercel.app
//
// What this does:
//   POST https://api.telegram.org/bot<TOKEN>/setWebhook
//     { url, secret_token, allowed_updates, drop_pending_updates }
//
// After running, send /start to your bot in Telegram to confirm it responds.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function registerWebhook(): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const secret  = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL;

  const missing: string[] = [];
  if (!token)  missing.push('TELEGRAM_BOT_TOKEN');
  if (!secret) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (!appUrl) missing.push('NEXT_PUBLIC_APP_URL');

  if (missing.length > 0) {
    console.error(`\n❌  Missing required env vars: ${missing.join(', ')}`);
    console.error('    Set them in .env.local or export them before running.\n');
    process.exit(1);
  }

  const webhookUrl = `${appUrl!.replace(/\/$/, '')}/api/telegram-webhook`;

  console.log('\n── Registering Telegram Webhook ─────────────────────────');
  console.log(`   Bot token : ${token!.slice(0, 10)}…`);
  console.log(`   Webhook   : ${webhookUrl}`);
  console.log(`   Secret    : ${secret!.slice(0, 6)}…`);
  console.log('─────────────────────────────────────────────────────────\n');

  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;

  const res = await fetch(apiUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url:                  webhookUrl,
      secret_token:         secret,
      // Only receive message updates — ignore inline queries, channel posts, etc.
      allowed_updates:      ['message'],
      // Drop any queued updates that arrived while the webhook was unregistered.
      // This prevents a burst of stale /start commands on re-registration.
      drop_pending_updates: true,
    }),
  });

  const body = await res.json() as { ok: boolean; description?: string; result?: unknown };

  if (!res.ok || !body.ok) {
    console.error('❌  Telegram API error:');
    console.error('   ', body.description ?? JSON.stringify(body));
    process.exit(1);
  }

  console.log('✅  Webhook registered successfully.');
  console.log('\nNext steps:');
  console.log('  1. Open Telegram and send /start to your bot.');
  console.log('  2. The bot should reply — if it doesn\'t, check Vercel function logs.');
  console.log('  3. Subscribers can now verify via the /start <token> flow.\n');
}

// Verify current webhook status after registration
async function getWebhookInfo(token: string): Promise<void> {
  const res  = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const body = await res.json() as { ok: boolean; result?: Record<string, unknown> };
  if (body.ok && body.result) {
    const r = body.result;
    console.log('── Current webhook info ──────────────────────────────────');
    console.log(`   URL              : ${r['url'] ?? '(none)'}`);
    console.log(`   Pending updates  : ${r['pending_update_count'] ?? 0}`);
    console.log(`   Last error       : ${r['last_error_message'] ?? 'none'}`);
    console.log('─────────────────────────────────────────────────────────\n');
  }
}

registerWebhook()
  .then(() => getWebhookInfo(process.env.TELEGRAM_BOT_TOKEN!))
  .catch(err => { console.error('Fatal:', err); process.exit(1); });
