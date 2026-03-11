// workers/brief.ts
// AI strategic analysis brief generator — v5 §9.3.
// Runs every 6 hours; stores results in analysis_briefs table.
// Each brief: 3–5 bullets ≤20 words, confidence tag, publisher citations.

import * as dotenv from 'dotenv';
dotenv.config();

import { sql } from '../lib/db/pool';
import { callLlm, parseLlmJson } from './llm';
import { buildAnalysisPrompt } from './prompts';
import { log } from '../lib/logger';

export interface AnalysisBriefRow {
  brief_id:    string;
  theater_id:  string;
  theater_slug: string;
  bullets:     string[];
  sources:     string[];
  generated_at: string;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runBriefGeneration(): Promise<void> {
  const jobId = await startJobRun('brief_generation');
  try {
    const theaters = await sql<{ theater_id: string; slug: string; name: string }>(`
      SELECT theater_id, slug, name FROM theaters WHERE is_active = true
    `);

    for (const theater of theaters) {
      await generateBriefForTheater(theater.theater_id, theater.slug, theater.name);
    }

    await finishJobRun(jobId, 'ok');
    log.info('brief', 'Brief generation complete');
  } catch (err) {
    await finishJobRun(jobId, 'error', String(err));
    log.error('brief', 'Fatal error', { error: String(err) });
  }
}

async function generateBriefForTheater(
  theaterId:   string,
  theaterSlug: string,
  theaterName: string
): Promise<void> {
  // Top 10 events by importance in last 24h
  const topEvents = await sql<{
    event_id: string; headline: string; summary_20w: string;
    severity: string; confidence: string; event_type: string;
    country_primary: string; importance_score: number; publisher: string;
  }>(`
    SELECT
      e.event_id, e.headline, e.summary_20w, e.severity,
      e.confidence, e.event_type, e.country_primary, e.importance_score,
      (SELECT es.publisher FROM event_sources es WHERE es.event_id = e.event_id ORDER BY es.reliability_tier LIMIT 1) as publisher
    FROM events e
    WHERE e.theater_id     = $1
      AND e.timestamp_utc >= now() - interval '24 hours'
      AND e.confidence    != 'unconfirmed'
    ORDER BY e.importance_score DESC
    LIMIT 10
  `, [theaterId]);

  if (topEvents.length === 0) {
    log.info('brief', 'No events — skipping theater', { theater: theaterSlug });
    return;
  }

  // Get previous brief for "what changed" bullet
  const prevBriefRows = await sql<{ bullets: string[] }>(`
    SELECT bullets FROM analysis_briefs
    WHERE theater_id = $1
    ORDER BY generated_at DESC
    LIMIT 1
  `, [theaterId]);
  const previousBrief = prevBriefRows[0]?.bullets?.join('\n') ?? undefined;

  // Build prompt and call LLM
  const prompt = buildAnalysisPrompt(theaterName, topEvents, previousBrief);
  const result = await callLlm(prompt);

  // Parse bullets (lines starting with "-" or "•")
  const bullets = result.text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('•'))
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);  // max 5 bullets

  if (bullets.length === 0) {
    log.warn('brief', 'LLM returned no bullets', { theater: theaterSlug });
    return;
  }

  // Extract unique publisher citations from top events
  const sources = [...new Set(topEvents.map(e => e.publisher).filter(Boolean))];

  // Store brief
  await sql(`
    INSERT INTO analysis_briefs (theater_id, bullets, sources)
    VALUES ($1, $2, $3)
  `, [theaterId, JSON.stringify(bullets), JSON.stringify(sources)]);

  log.info('brief', 'Brief generated', { theater: theaterSlug, bullets: bullets.length });
}

// ── Job run helpers (reuse pattern from ingest.ts) ────────────────────────────

async function startJobRun(jobName: string): Promise<string> {
  const rows = await sql<{ job_id: string }>(`
    INSERT INTO job_runs (job_name, status) VALUES ($1,'running') RETURNING job_id
  `, [jobName]);
  return rows[0].job_id;
}

async function finishJobRun(jobId: string, status: 'ok'|'error', error?: string): Promise<void> {
  await sql(`
    UPDATE job_runs SET finished_at=now(), status=$2, error=$3 WHERE job_id=$1
  `, [jobId, status, error ?? null]);
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('brief.ts') || process.argv[1]?.endsWith('brief.js')) {
  process.on('SIGTERM', () => { /* allow current brief to finish */ });
  process.on('SIGINT',  () => process.exit(0));
  runBriefGeneration().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
