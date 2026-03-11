'use client';
// app/error.tsx
// App Router error boundary — shown when an unhandled exception bubbles up
// from any Server Component or Client Component in the app segment.
//
// Intentionally minimal: shows a terse message without leaking stack traces.
// For more detail see browser console (dev) or Sentry (prod).

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Error already captured by captureError() in server-side code.
    // Log client-side errors separately.
    if (typeof window !== 'undefined') {
      console.error('[GCM client error]', error);
    }
  }, [error]);

  return (
    <div style={{
      minHeight:       '100vh',
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      background:      '#0f172a',
      color:           '#94a3b8',
      fontFamily:      'system-ui, sans-serif',
      padding:         '2rem',
      textAlign:       'center',
    }}>
      <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</p>
      <h1 style={{ color: '#f1f5f9', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        Something went wrong
      </h1>
      <p style={{ marginBottom: '1.5rem', maxWidth: '400px' }}>
        An unexpected error occurred. The team has been notified.
        {error.digest && (
          <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
            Error ref: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        style={{
          background:   '#3b82f6',
          color:        '#fff',
          border:       'none',
          borderRadius: '6px',
          padding:      '0.5rem 1.25rem',
          cursor:       'pointer',
          fontSize:     '0.875rem',
        }}
      >
        Try again
      </button>
    </div>
  );
}
