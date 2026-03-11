// app/api/verify/route.ts
import { NextRequest } from 'next/server';
import { verifySubscriberToken } from '@/workers/alerts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token || token.length < 32) {
    return Response.redirect(new URL('/subscribe?error=invalid_token', req.url));
  }

  try {
    const ok = await verifySubscriberToken(token);
    if (ok) {
      return Response.redirect(new URL('/subscribe?verified=1', req.url));
    } else {
      return Response.redirect(new URL('/subscribe?error=expired', req.url));
    }
  } catch {
    return Response.redirect(new URL('/subscribe?error=server_error', req.url));
  }
}
