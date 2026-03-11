// instrumentation.ts
// Next.js instrumentation hook — required by @sentry/nextjs v8+ to register
// the SDK on both server and edge runtimes via a single entry point.
//
// This file must be placed at the root of the project (alongside next.config.ts).
// It is auto-discovered by Next.js when `experimental.instrumentationHook` is
// enabled in next.config.ts (enabled by default in Next.js 15; opt-in in 14).
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
