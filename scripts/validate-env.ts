#!/usr/bin/env tsx
// scripts/validate-env.ts
// Validates all required and recommended environment variables before deploy.
//
// Usage:
//   npx tsx scripts/validate-env.ts       — check current environment
//   npm run validate-env                  — same via package.json alias
//
// Exits 0 when no errors (warnings are printed but don't fail).
// Exits 1 when any error-level misconfiguration is found.
//
// Add to CI / Vercel prebuild to catch missing secrets before they reach prod:
//   "prebuild": "npx tsx scripts/validate-env.ts && npx tsx scripts/migrate.ts"

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { validateConfig, hasConfigErrors } from '../lib/config.ts';

const warnings = validateConfig();

if (warnings.length === 0) {
  console.log('✅  All environment variables look good.\n');
  process.exit(0);
}

const errors = warnings.filter(w => w.level === 'error');
const warns  = warnings.filter(w => w.level === 'warn');

console.log('\n── GCM Environment Check ───────────────────────────────');

if (errors.length > 0) {
  console.log(`\n🔴  ${errors.length} error${errors.length > 1 ? 's' : ''} (deployment will be broken):`);
  for (const e of errors) {
    console.log(`   ✗ ${e.key}: ${e.message}`);
  }
}

if (warns.length > 0) {
  console.log(`\n🟡  ${warns.length} warning${warns.length > 1 ? 's' : ''} (features will degrade gracefully):`);
  for (const w of warns) {
    console.log(`   ⚠ ${w.key}: ${w.message}`);
  }
}

console.log('\n────────────────────────────────────────────────────────\n');

if (hasConfigErrors(warnings)) {
  console.error('❌  Fix errors above before deploying.\n');
  process.exit(1);
} else {
  console.log('✅  No blocking errors. Warnings above are non-critical.\n');
  process.exit(0);
}
