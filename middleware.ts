// middleware.ts
// Next.js Edge Middleware — runs before every matched request.
//
// Responsibilities:
//   1. CORS preflight   — OPTIONS → 204 with correct Allow headers
//   2. Bot filtering    — block known scan/scrape user-agents
//   3. Origin check     — POST/PUT/PATCH/DELETE must come from allowed origins
//   4. Rate limiting    — per-IP sliding-window via Upstash Redis (or in-memory
//                         fallback when UPSTASH_REDIS_REST_URL is not set)
//
// LIMITS (all configurable via env):
//   /api/subscribe        →  5  req / 60s  (tight — prevent email flood)
//   /api/unsubscribe      →  10 req / 60s
//   /api/verify           →  10 req / 60s
//   /api/telegram-webhook →  60 req / 60s  (Telegram can burst)
//   /api/cron/*           →  guarded by CRON_SECRET in the route itself
//   all other /api/*      →  120 req / 60s per IP
//
// ── Redis-backed rate limiting (production) ───────────────────────────────────
// Set these two env vars in Vercel (Project → Settings → Environment Variables)
// to enable cross-region consistent rate limiting via Upstash:
//
//   UPSTASH_REDIS_REST_URL   = https://<your-db>.upstash.io
//   UPSTASH_REDIS_REST_TOKEN = <token from Upstash console>
//
// Without these vars the middleware falls back to in-memory counters which work
// correctly for single-region / single-instance deployments but reset on cold
// start and do not coordinate across concurrent Edge function instances.
//
// UPSTASH_RL_ENABLED=false disables Redis entirely (useful in CI / local dev).

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes }                from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const WINDOW_SEC    = 60;
const WINDOW_MS     = WINDOW_SEC * 1000;
const CLEANUP_EVERY = 500;

// Path-prefix → max requests per window
const ROUTE_LIMITS: [string, number][] = [
  ['/api/subscribe',          5],
  ['/api/unsubscribe',        10],
  ['/api/verify',             10],
  ['/api/telegram-webhook',   60],
];
const DEFAULT_LIMIT = 120;

// ── Bot user-agent blocklist ──────────────────────────────────────────────────

const BOT_PATTERNS = [
  'sqlmap', 'nikto', 'masscan', 'zgrab', 'nuclei',
  'python-requests', 'go-http-client',
  'scrapy', 'nmap', 'dirbuster', 'wfuzz',
];

// ── In-memory fallback store ──────────────────────────────────────────────────
// Used when Upstash env vars are absent. Works per warm-instance.

interface Entry { count: number; windowStart: number }
const localStore = new Map<string, Entry>();
let requestsSinceClean = 0;

function localIsRateLimited(key: string, limit: number): boolean {
  const now   = Date.now();
  const entry = localStore.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    localStore.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > limit) return true;

  requestsSinceClean++;
  if (requestsSinceClean >= CLEANUP_EVERY) {
    requestsSinceClean = 0;
    for (const [k, v] of localStore.entries()) {
      if (now - v.windowStart >= WINDOW_MS * 2) localStore.delete(k);
    }
  }
  return false;
}

// ── Upstash Redis rate limiter ────────────────────────────────────────────────
// Uses Upstash's HTTP REST API directly — no npm package needed in Edge Runtime.
// Pattern: INCR key; EXPIRE key on first increment; check count against limit.

async function redisIsRateLimited(
  key: string,
  limit: number,
  url: string,
  token: string,
): Promise<boolean> {
  try {
    const incrResp = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!incrResp.ok) return false; // fail open — don't block on Redis error

    const { result: count } = await incrResp.json() as { result: number };

    // On the first request set the TTL so the window expires automatically.
    if (count === 1) {
      fetch(`${url}/expire/${encodeURIComponent(key)}/${WINDOW_SEC}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* non-fatal */ });
    }

    return count > limit;
  } catch {
    // Network or parse error — fail open so Redis outage never blocks users.
    return false;
  }
}

// ── Combined rate-limit entry point ──────────────────────────────────────────

async function isRateLimited(ip: string, path: string): Promise<boolean> {
  let limit = DEFAULT_LIMIT;
  for (const [prefix, cap] of ROUTE_LIMITS) {
    if (path.startsWith(prefix)) { limit = cap; break; }
  }

  const routeKey = ROUTE_LIMITS.find(([p]) => path.startsWith(p))?.[0] ?? 'default';
  const key      = `gcm:rl:${ip}:${routeKey}`;

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const useRedis   = process.env.UPSTASH_RL_ENABLED !== 'false' && !!redisUrl && !!redisToken;

  if (useRedis) {
    return redisIsRateLimited(key, limit, redisUrl!, redisToken!);
  }
  return localIsRateLimited(key, limit);
}

// ── Allowed origins for mutation requests ─────────────────────────────────────

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // server-to-server calls have no Origin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (appUrl && origin === appUrl) return true;
  // Allow localhost for dev
  if (origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}


// ── CSP nonce ─────────────────────────────────────────────────────────────────
// A fresh random nonce is generated per request and injected into:
//   - The Content-Security-Policy response header (replaces 'unsafe-inline')
//   - The x-nonce response header so app/layout.tsx can forward it to <script>
//     and <style> tags via the Next.js `headers()` server function.
//
// This hardens the CSP by removing blanket 'unsafe-inline' while still
// allowing Next.js hydration scripts (which receive the matching nonce).

function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

function buildCspWithNonce(nonce: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://unpkg.com https://cdnjs.cloudflare.com`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.mapbox.com",
    `connect-src 'self' https://*.mapbox.com https://api.openai.com https://api.anthropic.com${appUrl ? ' ' + appUrl : ''}`,
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Handle CORS preflight before any other check — OPTIONS must return 204
  // immediately so browsers can complete the preflight handshake.
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age':       '86400',
      },
    });
  }

  // For non-API page routes: just attach nonce (skip all API-specific checks)
  if (!pathname.startsWith('/api/')) {
    const nonce    = generateNonce();
    const response = NextResponse.next({ request: { headers: req.headers } });
    response.headers.set('x-nonce', nonce);
    response.headers.set('Content-Security-Policy', buildCspWithNonce(nonce));
    return response;
  }

  // Cron routes are protected by CRON_SECRET inside the route handler itself —
  // don't apply IP rate limiting (Vercel's scheduler has a fixed IP range).
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  const ua      = req.headers.get('user-agent') ?? '';
  const uaLower = ua.toLowerCase();

  // 1. Bot filtering
  for (const pattern of BOT_PATTERNS) {
    if (uaLower.includes(pattern)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // 2. Origin check for mutation methods
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = req.headers.get('origin');
    // Telegram webhook is called by Telegram's servers with no Origin header;
    // it is protected by x-telegram-bot-api-secret-token in the route handler.
    if (!pathname.startsWith('/api/telegram-webhook') && !isAllowedOrigin(origin)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // 3. Rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';

  const limited = await isRateLimited(ip, pathname);
  if (limited) {
    const routeLimit = ROUTE_LIMITS.find(([p]) => pathname.startsWith(p))?.[1] ?? DEFAULT_LIMIT;
    return new NextResponse('Too Many Requests', {
      status:  429,
      headers: {
        'Retry-After':        String(WINDOW_SEC),
        'X-RateLimit-Limit':  String(routeLimit),
        'X-RateLimit-Window': String(WINDOW_SEC),
        'Content-Type':       'text/plain',
      },
    });
  }

  const nonce    = generateNonce();
  const response = NextResponse.next({
    request: { headers: req.headers },
  });
  // Forward nonce to the page — app/layout.tsx reads x-nonce from headers()
  // to inject it into <script nonce={}> and <style nonce={}>
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', buildCspWithNonce(nonce));
  return response;
}

export const config = {
  // Match API routes (rate limiting + nonce) and all page routes (nonce only).
  // Exclude _next/static, _next/image, and favicon to avoid unnecessary work.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
