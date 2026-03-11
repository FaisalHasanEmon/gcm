import type { Metadata } from 'next';
import { headers }       from 'next/headers';
import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gcm.example.com';

export const metadata: Metadata = {
  title:       'GCM – Global Conflict Monitor',
  description: 'Real-time multi-theater conflict tracking. Confidence-labeled. Source-cited.',
  metadataBase: new URL(APP_URL),
  openGraph: {
    type:        'website',
    siteName:    'Global Conflict Monitor',
    title:       'GCM – Global Conflict Monitor',
    description: 'Real-time multi-theater conflict tracking. Confidence-labeled. Source-cited.',
    url:         APP_URL,
    images:      [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Global Conflict Monitor' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'GCM – Global Conflict Monitor',
    description: 'Real-time multi-theater conflict tracking. Confidence-labeled. Source-cited.',
    images:      ['/og-image.png'],
  },
  icons: { icon: '/favicon.ico' },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the per-request CSP nonce set by middleware.ts.
  // Next.js forwards request headers to Server Components via the headers() API.
  // The nonce is applied to <script> and <style> tags so browsers accept
  // them under a strict CSP (no 'unsafe-inline' required).
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" nonce={nonce} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" nonce={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
