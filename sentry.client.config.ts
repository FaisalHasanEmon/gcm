// sentry.client.config.ts
// Sentry browser SDK initialisation — loaded by Next.js on the client.
//
// This file is auto-discovered by Next.js via the @sentry/nextjs integration.
// It runs once when the browser bundle loads.
//
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Skip initialisation when DSN is absent (local dev, CI).
if (dsn) {
  Sentry.init({
    dsn,

    // Capture 10 % of transactions for performance monitoring.
    // Raise to 1.0 during initial launch to catch perf regressions early,
    // then lower once baseline is established.
    tracesSampleRate: 0.1,

    // Replay 5 % of sessions, 100 % of sessions with an error.
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,

    // Sentry environment tag — matches Vercel's VERCEL_ENV ('production',
    // 'preview', 'development').
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',

    // Release is set by the Sentry Vercel integration automatically.
    // If deploying outside Vercel, set NEXT_PUBLIC_SENTRY_RELEASE.
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Attach user/IP data so error reports are actionable.
    sendDefaultPii: false, // PII off by default; enable per-event if needed

    integrations: [
      Sentry.replayIntegration({
        // Mask all text and media to avoid capturing sensitive content.
        maskAllText:   true,
        blockAllMedia: true,
      }),
    ],
  });
}
