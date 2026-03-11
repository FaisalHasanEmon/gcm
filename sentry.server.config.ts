// sentry.server.config.ts
// Sentry Node.js SDK initialisation — loaded by Next.js on the server.
//
// This file is auto-discovered by Next.js via the @sentry/nextjs integration.
// It runs once when the server process starts (or on each cold-start on Vercel).
//
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // 10 % of server transactions sampled for performance monitoring.
    tracesSampleRate: 0.1,

    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release:     process.env.SENTRY_RELEASE,

    // Suppress noisy 4xx errors from being reported as Sentry issues —
    // they are expected (bad user input, missing routes).
    // Only capture 5xx and unhandled promise rejections.
    beforeSend(event) {
      const status = event.contexts?.response?.status_code as number | undefined;
      if (status && status >= 400 && status < 500) return null;
      return event;
    },

    // Automatically instrument Next.js API routes and server components.
    integrations: [
      Sentry.prismaIntegration
        ? undefined  // exclude if Prisma not used
        : undefined,
    ].filter(Boolean) as Sentry.Integration[],
  });
}
