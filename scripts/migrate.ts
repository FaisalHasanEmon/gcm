#!/usr/bin/env tsx
// scripts/migrate.ts
// Runs all SQL migrations in order. Safe to re-run (idempotent).
//
// Usage:
//   npm run db:migrate          — apply pending migrations
//   npm run db:status           — list applied/pending without executing
//   npx tsx scripts/migrate.ts --dry-run
//
// This script runs automatically as part of `npm run build` via the `prebuild`
// hook in package.json, so every Vercel deployment applies pending migrations
// before the Next.js build starts.
//
// ── Vercel deployment flow ────────────────────────────────────────────────────
//   1. Vercel runs: npm run build
//   2. `prebuild` fires first: npx tsx scripts/migrate.ts
//   3. Migrations apply if any are pending; idempotent if all applied already.
//   4. Next.js build proceeds.
//
// ── Local development ─────────────────────────────────────────────────────────
//   cp .env.example .env.local   # fill in DATABASE_URL
//   npm run db:migrate
//   npm run dev

import { Pool }   from 'pg';
import * as fs    from 'fs';
import * as path  from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();                          // fallback to .env

const DRY_RUN        = process.argv.includes('--dry-run');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function migrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // On Vercel preview builds DATABASE_URL may not be set if the DB is only
    // attached to production. Skip gracefully rather than failing the build.
    if (process.env.VERCEL_ENV === 'preview') {
      console.log('⚠  DATABASE_URL not set — skipping migrations on preview build.');
      process.exit(0);
    }
    console.error('❌  DATABASE_URL not set. Add it to .env.local or Vercel environment variables.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' },
    // Short timeout — migrations run at build time, not in a hot path.
    connectionTimeoutMillis: 10_000,
  });

  try {
    // Create tracking table (idempotent)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL      PRIMARY KEY,
        filename   TEXT        NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await pool.query<{ filename: string }>(
      'SELECT filename FROM _migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const pending = files.filter(f => !appliedSet.has(f));
    const already = files.filter(f =>  appliedSet.has(f));

    // Always print a status summary — useful in Vercel build logs
    console.log(`\n── GCM Migrations ──────────────────────────────────`);
    console.log(`   Applied : ${already.length}`);
    console.log(`   Pending : ${pending.length}`);
    if (DRY_RUN) {
      console.log(`   Mode    : dry-run (no changes will be made)`);
    }
    console.log(`────────────────────────────────────────────────────`);

    for (const file of already) {
      console.log(`  ✓ ${file}`);
    }

    if (pending.length === 0) {
      console.log('\n✅  Nothing to migrate — all migrations already applied.\n');
      return;
    }

    for (const file of pending) {
      if (DRY_RUN) {
        console.log(`  ○ ${file}  (would apply)`);
        continue;
      }
      const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  → ${file} …`);
      const t0 = Date.now();
      await pool.query(sqlText);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log(`  ✓ ${file}  (${Date.now() - t0} ms)`);
    }

    if (!DRY_RUN) {
      console.log(`\n✅  ${pending.length} migration${pending.length === 1 ? '' : 's'} applied.\n`);
    }
  } catch (err) {
    console.error('\n❌  Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
