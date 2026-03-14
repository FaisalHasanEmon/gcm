// import type { NextConfig } from 'next';

// // ── CORS ──────────────────────────────────────────────────────────────────────
// // Read-only API endpoints (/api/dashboard, /api/timeline, etc.) are consumed
// // by the Next.js frontend (same-origin) and potentially by external dashboards
// // or mobile apps. We therefore allow cross-origin GETs from any origin while
// // keeping mutation endpoints (POST /api/subscribe, etc.) protected by the
// // origin check in middleware.ts.
// //
// // NEXT_PUBLIC_ALLOWED_ORIGINS can hold a comma-separated list of exact origins
// // to allow. If unset, we default to allow-all ('*') for GET/HEAD/OPTIONS —
// // safe because all mutation routes require same-origin or Telegram's header.
// function buildCorsHeaders(): { key: string; value: string }[] {
//   const allowedOrigins = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? '*';
//   return [
//     { key: 'Access-Control-Allow-Origin',  value: allowedOrigins },
//     { key: 'Access-Control-Allow-Methods', value: 'GET, HEAD, OPTIONS' },
//     { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
//     { key: 'Access-Control-Max-Age',       value: '86400' },
//   ];
// }

// const SECURITY_HEADERS = [
//   { key: 'X-Frame-Options',           value: 'DENY' },
//   { key: 'X-Content-Type-Options',    value: 'nosniff' },
//   { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
//   { key: 'X-DNS-Prefetch-Control',    value: 'on' },
//   { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
//   // Content-Security-Policy is set per-request in middleware.ts with a fresh
//   // nonce, replacing the static 'unsafe-inline' that was here previously.
//   // Do not add a static CSP here — it would override middleware's nonce-based one.
// ];

// const nextConfig: NextConfig = {
//   // Required for @sentry/nextjs v8 instrumentation hook in Next.js 14.
//   // (Next.js 15 enables this by default.)
//   experimental: {
//     instrumentationHook: true,
//   },

//   // Exclude worker files from Next.js compilation
//   webpack(config) {
//     config.externals = [...(config.externals ?? []), 'pg-native'];
//     return config;
//   },
//   async headers() {
//     return [
//       // Security headers on all routes
//       { source: '/(.*)', headers: SECURITY_HEADERS },
//       // CORS headers on all read API routes
//       { source: '/api/(.*)', headers: buildCorsHeaders() },
//     ];
//   },
// };

// export default nextConfig;

const buildCorsHeaders = () => {
const allowedOrigins = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? '*';
return [
{ key: 'Access-Control-Allow-Origin', value: allowedOrigins },
{ key: 'Access-Control-Allow-Methods', value: 'GET, HEAD, OPTIONS' },
{ key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
{ key: 'Access-Control-Max-Age', value: '86400' },
];
};

const SECURITY_HEADERS = [
{ key: 'X-Frame-Options', value: 'DENY' },
{ key: 'X-Content-Type-Options', value: 'nosniff' },
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
{ key: 'X-DNS-Prefetch-Control', value: 'on' },
{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
experimental: {
instrumentationHook: true,
},

webpack(config) {
config.externals = [...(config.externals ?? []), 'pg-native'];
return config;
},

async headers() {
return [
{ source: '/(.*)', headers: SECURITY_HEADERS },
{ source: '/api/(.*)', headers: buildCorsHeaders() },
];
},
};

module.exports = nextConfig;

