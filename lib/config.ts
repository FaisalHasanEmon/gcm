// lib/config.ts
// Runtime configuration validator.
//
// Checks that required and strongly-recommended environment variables are
// present and plausible. Called from:
//   - GET /api/health  — so operators see warnings immediately on first deploy
//   - scripts/validate-env.ts  — can be run locally before deploy
//
// Philosophy:
//   REQUIRED  — app will not function correctly without these; health returns
//               degraded status and logs an error.
//   RECOMMENDED — feature will silently degrade; health returns a warning list
//               but still 200 (these are not outage-level).
//   PLACEHOLDER — variable is set but still contains the example/default value;
//               almost certainly a misconfiguration.

export interface ConfigWarning {
  level:   'error' | 'warn';
  key:     string;
  message: string;
}

// Known placeholder values that indicate the operator forgot to fill them in
const PLACEHOLDER_PATTERNS = [
  'example.com',
  'your-domain',
  'sk-...',
  'sk-ant-...',
  'yourpassword',
  'your@example.com',
  'ACxxxxxxxx',
];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

export function validateConfig(): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // ── Required ────────────────────────────────────────────────────────────────

  if (!process.env.DATABASE_URL) {
    warnings.push({
      level:   'error',
      key:     'DATABASE_URL',
      message: 'Not set — database connections will fail.',
    });
  }

  if (!process.env.CRON_SECRET) {
    warnings.push({
      level:   'error',
      key:     'CRON_SECRET',
      message: 'Not set — all cron routes will return 503 and never run.',
    });
  }

  if (!process.env.ADMIN_SECRET) {
    warnings.push({
      level:   'warn',
      key:     'ADMIN_SECRET',
      message: 'Not set — /api/admin/job-runs and /api/admin/monitor will return 503.',
    });
  }

  // ── App URL ─────────────────────────────────────────────────────────────────

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    warnings.push({
      level:   'warn',
      key:     'NEXT_PUBLIC_APP_URL',
      message: 'Not set — unsubscribe links, sitemap, and OG tags will use the placeholder domain "gcm.example.com".',
    });
  } else if (isPlaceholder(appUrl) || appUrl === 'https://gcm.example.com') {
    warnings.push({
      level:   'warn',
      key:     'NEXT_PUBLIC_APP_URL',
      message: `Set to placeholder value "${appUrl}" — update to your real deployment URL.`,
    });
  }

  // ── AI providers ─────────────────────────────────────────────────────────────

  const hasOpenAI     = !!process.env.OPENAI_API_KEY     && !isPlaceholder(process.env.OPENAI_API_KEY);
  const hasAnthropic  = !!process.env.ANTHROPIC_API_KEY  && !isPlaceholder(process.env.ANTHROPIC_API_KEY);

  if (!hasOpenAI && !hasAnthropic) {
    warnings.push({
      level:   'error',
      key:     'OPENAI_API_KEY / ANTHROPIC_API_KEY',
      message: 'Neither AI provider key is set — LLM extraction and brief generation will fail on every run.',
    });
  }

  // ── Notifications ─────────────────────────────────────────────────────────────

  const hasSmtp = !!process.env.SMTP_HOST && !isPlaceholder(process.env.SMTP_HOST ?? '');
  if (!hasSmtp) {
    warnings.push({
      level:   'warn',
      key:     'SMTP_HOST',
      message: 'Not configured — email alerts and verification emails will be silently skipped.',
    });
  }

  const hasTelegram = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!hasTelegram) {
    warnings.push({
      level:   'warn',
      key:     'TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET',
      message: 'Not configured — Telegram alerts and webhook will be disabled.',
    });
  }

  // ── Observability ─────────────────────────────────────────────────────────────

  const hasSentry = !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!hasSentry) {
    warnings.push({
      level:   'warn',
      key:     'SENTRY_DSN',
      message: 'Not set — errors will be logged but not reported to Sentry.',
    });
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────────

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    warnings.push({
      level:   'warn',
      key:     'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN',
      message: 'Not set — rate limiting falls back to per-instance in-memory counters (not coordinated across Edge instances).',
    });
  }

  return warnings;
}

/**
 * Returns true if there are any error-level config problems that indicate
 * the app cannot function correctly.
 */
export function hasConfigErrors(warnings: ConfigWarning[]): boolean {
  return warnings.some(w => w.level === 'error');
}
