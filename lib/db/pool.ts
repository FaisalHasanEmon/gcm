// lib/db/pool.ts
// Singleton pg Pool — shared across all API route handlers.
// Next.js hot-reload safe via global caching.
//
// CONNECTION COUNT RATIONALE
// On Vercel serverless each concurrent invocation runs in its own Node process
// and creates its own pool. max=2 means 2 connections per process; at 50
// concurrent functions that is 100 connections — within Postgres's default
// max_connections=100. Use a connection pooler (PgBouncer / Supabase pooler)
// and point DATABASE_URL at the pooler to raise this safely.
//
// SSL POLICY
// We default to ssl: { rejectUnauthorized: true } for all providers.
// Set DATABASE_SSL=false ONLY in local development (never in production).
// Supabase's transaction pooler uses a self-signed CA — set
// DATABASE_SSL_REJECT_UNAUTHORIZED=false if you are not using their session
// pooler with a proper certificate.

import { Pool } from 'pg';
import { log } from '../logger';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildSslConfig(): boolean | { rejectUnauthorized: boolean } {
  // Opt-out for local dev only
  if (process.env.DATABASE_SSL === 'false') return false;
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  return { rejectUnauthorized };
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }
    global.__pgPool = new Pool({
      connectionString:        process.env.DATABASE_URL,
      // Keep max low: each serverless invocation has its own pool instance.
      // Raise this only when running a persistent server with a connection pooler.
      max:                     2,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis: 5_000,
      ssl:                     buildSslConfig(),
    });

    // Set a per-connection statement timeout so a slow spatial query (ST_ClusterDBSCAN
    // over a large event set) cannot block an API response indefinitely.
    // Vercel functions default to 10 s; we allow 8 s for any single query.
    global.__pgPool.on('connect', (client) => {
      client.query("SET statement_timeout = '8000'").catch(err =>
        log.error('pool', 'Failed to set statement_timeout', { error: String(err) })
      );
    });

    global.__pgPool.on('error', (err) => {
      log.error('pool', 'Unexpected pool error', { error: String(err) });
    });
  }
  return global.__pgPool;
}

/** Execute a query and return typed rows. */
export async function sql<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}
