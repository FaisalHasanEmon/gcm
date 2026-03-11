// sentry.edge.config.ts
// Sentry Edge Runtime SDK initialisation — loaded by Next.js middleware and
// Edge API routes (e.g. middleware.ts).
//
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? 'development',
    release:     process.env.SENTRY_RELEASE,
  });
}
