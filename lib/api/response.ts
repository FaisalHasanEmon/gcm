// lib/api/response.ts
// Shared response helpers for all API routes.

import { NextResponse } from 'next/server';
import { NotFoundError } from '../db/events';
import { log } from '../logger';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(error: unknown): NextResponse {
  if (error instanceof NotFoundError) return err(error.message, 404);
  log.error('api', 'Unhandled route error', { error: String(error) });
  return err('Internal server error', 500);
}

/** Parse ?page + ?pageSize with safe defaults and max cap. */
export function parsePagination(
  searchParams: URLSearchParams,
  maxSize = 50
): { page: number; pageSize: number; offset: number } {
  const page     = Math.max(1,       parseInt(searchParams.get('page')     ?? '1',  10) || 1);
  const pageSize = Math.min(maxSize, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Parse ?theater= with fallback. */
export function parseTheaterSlug(
  searchParams: URLSearchParams,
  fallback = 'me-iran-israel-us'
): string {
  return searchParams.get('theater') ?? fallback;
}
