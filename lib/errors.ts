// lib/errors.ts
// Centralised error reporting for GCM.
//
// INTEGRATION: Sentry (https://sentry.io)
// Install:  npm install @sentry/nextjs
// Init:     Run `npx @sentry/wizard@latest -i nextjs` which creates:
//             sentry.client.config.ts, sentry.server.config.ts,
//             sentry.edge.config.ts, instrumentation.ts
//           Set SENTRY_DSN in Vercel env vars.
//
// This module provides a thin capture() wrapper that:
//   - Is a no-op when SENTRY_DSN is not set (zero overhead in dev / CI)
//   - Attaches a `context` tag so every error is grouped by subsystem
//     (ingest, llm, geocoder, alerts, brief, api)
//   - Passes arbitrary key-value extras for richer event pages
//   - Also calls log.error() so the error always appears in structured logs
//     regardless of whether Sentry is wired up
//
// Usage:
//   import { captureError } from '@/lib/errors';
//
//   // In a catch block:
//   captureError('llm', err, { provider: 'openai', attempt: 2 });
//
//   // For soft/expected failures that still warrant visibility:
//   captureError('geocoder', new Error('Mapbox returned 429'), { location: 'Kharkiv' });

import { log } from './logger';

type Extra = Record<string, unknown>;

/**
 * Capture an error for external tracking and structured logging.
 *
 * @param context  Subsystem label — used as a Sentry tag and log service name.
 * @param error    The caught value (Error, string, or unknown).
 * @param extra    Optional key-value pairs attached to the Sentry event.
 */
export function captureError(context: string, error: unknown, extra?: Extra): void {
  const message = error instanceof Error ? error.message : String(error);

  // Always emit a structured log entry first — visible even without Sentry.
  log.error(context, message, { ...extra });

  // Sentry capture — only when DSN is configured.
  if (!process.env.SENTRY_DSN) return;

  // Lazy-import to avoid pulling Sentry into bundle when DSN is absent.
  // @sentry/nextjs re-exports everything from @sentry/node on the server.
  import('@sentry/nextjs')
    .then(Sentry => {
      Sentry.withScope(scope => {
        scope.setTag('context', context);
        if (extra) {
          for (const [k, v] of Object.entries(extra)) {
            scope.setExtra(k, v);
          }
        }
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage(message, 'error');
        }
      });
    })
    .catch(() => {
      // If @sentry/nextjs is not installed the import will fail — that is fine.
      // Error was already logged above; this is a best-effort capture.
    });
}

/**
 * Wrap an async function with automatic error capture.
 * The original error is re-thrown after capture so callers still handle it.
 *
 * Usage:
 *   const result = await withErrorCapture('geocoder', () => geocodeMapbox(name, token));
 */
export async function withErrorCapture<T>(
  context: string,
  fn:      () => Promise<T>,
  extra?:  Extra
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    captureError(context, err, extra);
    throw err;
  }
}
