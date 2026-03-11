// workers/ingest.ts
// Main ingestion worker — runs every 5 minutes via the scheduler.
//
// Pipeline per feed item:
//   1. Fetch RSS feeds → raw_items (skip known content_hash)
//   2. LLM event extraction (§9.1)
//   3. Geocode location_name → PostGIS point
//   4. Deduplication (40km / 60min window, §5.2)
//      → merge sources into existing event, OR
//      → insert new event
//   5. AI importance scoring (§9.2)
//   6. Compute final hybrid score + escalation_points (§5.3–5.4)
//   7. Update job_runs log

import * as dotenv from 'dotenv';
dotenv.config();

import { sql } from '../lib/db/pool';
import { FEEDS, fetchFeedItems } from './feeds';
import { callLlm, parseLlmJson } from './llm';
import { buildExtractionPrompt, buildScoringPrompt } from './prompts';
import { classifyPublisher, computeConfidence } from '../lib/scoring/confidence';
import { computeDeterministicScore, computeFinalScore, computeEscalationPoints } from '../lib/scoring/deterministic';
import { geocodeLocation } from '../lib/intelligence/geocoder';
import { findDuplicate, mergeIntoExisting } from '../lib/intelligence/dedupe';
import { dispatchInstantAlert } from './alerts';
import { log } from '../lib/logger';
import { captureError } from '../lib/errors';
import type { EventType, Severity, Confidence, EvidenceType } from '../lib/types';

// Module-level shutdown flag — set by SIGTERM handler, checked in runIngestion feed loop.
let _shuttingDown = false;

const VALID_EVENT_TYPES = new Set<EventType>([
  'airstrike','missile_launch','drone_attack','military_movement','naval_activity',
  'official_statement','warning_alert','explosion','infrastructure_damage','casualty_update','other',
]);
const VALID_SEVERITIES  = new Set<Severity>(['critical','high','medium','low']);
const VALID_CONFIDENCES = new Set<Confidence>(['confirmed','likely','unconfirmed']);
const VALID_EVIDENCE    = new Set<EvidenceType>(['news','official','osint','satellite','flight','ship','mixed']);

interface ExtractedEvent {
  no_event?:       boolean;
  timestamp_utc?:  string | null;
  country_primary?: string;
  location_name?:  string;
  actors_involved?: string[];
  event_type?:     string;
  severity?:       string;
  confidence?:     string;
  evidence_type?:  string;
  headline?:       string;
  summary_20w?:    string;
  damage_asset?:   string;
  damage_type?:    string;
  tags?:           string[];
}

interface AiScore { ai_importance: number; reason: string; }

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runIngestion(): Promise<void> {
  let jobId: string;
  try {
    jobId = await startJobRun('ingestion');
  } catch (e) {
    if (e instanceof AlreadyRunningError) {
      log.info('ingest', e.message);
      return;
    }
    throw e;
  }

  let itemsFetched = 0, eventsCreated = 0, eventsUpdated = 0;
  let llmErrors = 0, geocodingFailed = 0;
  let errorText: string | undefined;

  try {
    // Load theater slug → id map
    const theaters = await sql<{ slug: string; theater_id: string; name: string }>(`
      SELECT slug, theater_id, name FROM theaters WHERE is_active = true
    `);
    const theaterMap = Object.fromEntries(theaters.map(t => [t.slug, t]));

    for (const feed of FEEDS) {
      if (_shuttingDown) {
        log.info('ingest', 'Shutdown requested — stopping before next feed');
        break;
      }
      const theater = theaterMap[feed.theater];
      if (!theater) continue;

      const items = await fetchFeedItems(feed, 25);
      itemsFetched += items.length;

      for (const item of items) {
        if (_shuttingDown) {
          log.info('ingest', 'Shutdown requested — stopping feed loop early');
          break;
        }
        try {
          const { result, llmError, geocodeFailed: gf } = await processItem(item, theater.theater_id, theater.name);
          if (result === 'created') eventsCreated++;
          else if (result === 'merged') eventsUpdated++;
          if (llmError)  llmErrors++;
          if (gf)        geocodingFailed++;
        } catch (err) {
          log.error('ingest', 'Item processing failed', { title: item.title?.slice(0, 60), feed: item.feedUrl, error: String(err) });
        }
      }
    }

    await finishJobRun(jobId, 'ok', itemsFetched, eventsCreated, eventsUpdated, undefined, llmErrors, geocodingFailed);
    log.info('ingest', 'Run complete', { fetched: itemsFetched, created: eventsCreated, merged: eventsUpdated });
  } catch (err) {
    errorText = String(err);
    await finishJobRun(jobId, 'error', itemsFetched, eventsCreated, eventsUpdated, errorText, llmErrors, geocodingFailed);
    log.error('ingest', 'Fatal error', { error: String(err) });
  }
}

// ── Per-item pipeline ─────────────────────────────────────────────────────────

async function processItem(
  item:       { title: string; url: string; publishedTime: string|null; content: string; contentHash: string; feedUrl: string; publisher: string; theater: string },
  theaterId:  string,
  theaterName: string
): Promise<{ result: 'created' | 'merged' | 'skipped'; llmError?: boolean; geocodeFailed?: boolean }> {

  // 1. Dedup raw_items by content_hash
  const existing = await sql<{ raw_id: string }>(`
    SELECT raw_id FROM raw_items WHERE content_hash = $1 LIMIT 1
  `, [item.contentHash]);
  if (existing.length > 0) return { result: 'skipped' };

  // 2. Store raw item
  await sql(`
    INSERT INTO raw_items (theater_id, source_name, feed_url, title, url, published_time, content, content_hash, processed)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)
    ON CONFLICT (content_hash) DO NOTHING
  `, [theaterId, item.publisher, item.feedUrl, item.title, item.url, item.publishedTime, item.content, item.contentHash]);

  // 3. AI extraction
  const extractPrompt = buildExtractionPrompt(item.content);
  let extracted: ExtractedEvent | null = null;
  let extractionFailed = false;
  try {
    const llmResult = await callLlm(extractPrompt);
    extracted = parseLlmJson<ExtractedEvent>(llmResult.text);
  } catch (extractErr) {
    captureError('ingest', extractErr, { stage: 'ai_extraction', title: item.title?.slice(0, 60) });
    extractionFailed = true;
  }

  // Treat any of these as "no usable event":
  //   - LLM threw (network error, rate limit, timeout)
  //   - null/undefined parse result
  //   - explicit {no_event: true}
  //   - empty object (LLM returned {})
  const hasContent = extracted && !extracted.no_event && Object.keys(extracted).length > 1;
  if (!hasContent) {
    await sql(`UPDATE raw_items SET processed=true WHERE content_hash=$1`, [item.contentHash]);
    return { result: 'skipped', llmError: extractionFailed };
  }

  // 4. Validate + coerce extracted fields
  const eventType  = VALID_EVENT_TYPES.has(extracted.event_type as EventType)
    ? extracted.event_type as EventType : 'other';
  const severity   = VALID_SEVERITIES.has(extracted.severity as Severity)
    ? extracted.severity as Severity   : 'low';
  const evidenceType = VALID_EVIDENCE.has(extracted.evidence_type as EvidenceType)
    ? extracted.evidence_type as EvidenceType : 'news';

  if (!extracted.country_primary || !extracted.summary_20w) return { result: 'skipped' };

  // 5. Geocode
  const geo = await geocodeLocation(extracted.location_name);
  const geocodeFailed = extracted.location_name?.trim() && !geo;

  // 6. Classify publisher tier + compute initial confidence
  const tier = classifyPublisher(item.publisher);
  const isOfficial = evidenceType === 'official';
  const hasStrongCorroboration = ['satellite','flight','ship'].includes(evidenceType);
  const confidence = computeConfidence(
    [{ tier, sourceType: evidenceType, isOfficialActor: isOfficial }],
    hasStrongCorroboration,
    false
  );

  const timestampUtc = extracted.timestamp_utc ?? item.publishedTime ?? new Date().toISOString();

  // 7. Dedup check
  if (geo) {
    const dupId = await findDuplicate({
      theater_id:    theaterId,
      event_type:    eventType,
      timestamp_utc: timestampUtc,
      lat:           geo.lat,
      lon:           geo.lon,
    });
    if (dupId) {
      await mergeIntoExisting(dupId, [{
        publisher:        item.publisher,
        url:              item.url,
        published_time:   item.publishedTime,
        source_type:      evidenceType,
        reliability_tier: tier,
      }]);
      await sql(`UPDATE raw_items SET processed=true WHERE content_hash=$1`, [item.contentHash]);
      return { result: 'merged' };
    }
  }

  // 8. AI importance score
  let aiImportance: number | null = null;
  let llmErrorOccurred = false;
  try {
    const scorePrompt = buildScoringPrompt(theaterName, {
      event_type: eventType, severity, country_primary: extracted.country_primary,
      headline:   extracted.headline, summary_20w: extracted.summary_20w,
      damage_asset: extracted.damage_asset,
    });
    const scoreResult = await callLlm(scorePrompt);
    const scoreJson   = parseLlmJson<AiScore>(scoreResult.text);
    if (scoreJson?.ai_importance != null) {
      aiImportance = Math.min(100, Math.max(0, Math.round(Number(scoreJson.ai_importance))));
    }
  } catch (scoreErr) { captureError('ingest', scoreErr, { stage: 'ai_scoring', eventType, severity }); llmErrorOccurred = true; }

  // 9. Compute final scores
  const deterministic = computeDeterministicScore({
    severity, event_type: eventType, confidence, timestamp_utc: timestampUtc,
    actors_involved: extracted.actors_involved,
    damage_asset:    extracted.damage_asset,
  });
  const finalScore       = computeFinalScore(deterministic, aiImportance);
  const escalationPoints = computeEscalationPoints({ severity, event_type: eventType, confidence, damage_asset: extracted.damage_asset });

  // 10. Insert event — lat/lon are passed as bound parameters ($5/$6) rather than
  //     interpolated into the SQL string, eliminating any injection surface from
  //     the geocoder response. Remaining params shift up by 2 when geo is present.
  const rows = await sql<{ event_id: string }>(
    geo
      ? `INSERT INTO events (
           theater_id, timestamp_utc, country_primary, location_name,
           geom, location_precision, actors_involved, event_type,
           severity, confidence, evidence_type, is_signal,
           headline, summary_20w, tags, damage_asset, damage_type,
           importance_score, escalation_points
         ) VALUES (
           $1,$2,$3,$4,
           ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8,$9,
           $10,$11,$12,false,
           $13,$14,$15,$16,$17,
           $18,$19
         ) RETURNING event_id`
      : `INSERT INTO events (
           theater_id, timestamp_utc, country_primary, location_name,
           geom, location_precision, actors_involved, event_type,
           severity, confidence, evidence_type, is_signal,
           headline, summary_20w, tags, damage_asset, damage_type,
           importance_score, escalation_points
         ) VALUES (
           $1,$2,$3,$4,
           NULL,$5,$6,$7,
           $8,$9,$10,false,
           $11,$12,$13,$14,$15,
           $16,$17
         ) RETURNING event_id`,
    geo
      ? [
          theaterId,
          timestampUtc,
          extracted.country_primary,
          extracted.location_name ?? null,
          geo.lon,                        // $5 — longitude (ST_MakePoint takes lon,lat)
          geo.lat,                        // $6 — latitude
          geo.precision,                  // $7
          extracted.actors_involved ?? [], // $8
          eventType,                      // $9
          severity,                       // $10
          confidence,                     // $11
          evidenceType,                   // $12
          extracted.headline    ?? null,  // $13
          extracted.summary_20w,          // $14
          extracted.tags        ?? [],    // $15
          extracted.damage_asset ?? null, // $16
          extracted.damage_type  ?? null, // $17
          finalScore,                     // $18
          escalationPoints,               // $19
        ]
      : [
          theaterId,
          timestampUtc,
          extracted.country_primary,
          extracted.location_name ?? null,
          'unknown',                      // $5 — location_precision
          extracted.actors_involved ?? [], // $6
          eventType,                      // $7
          severity,                       // $8
          confidence,                     // $9
          evidenceType,                   // $10
          extracted.headline    ?? null,  // $11
          extracted.summary_20w,          // $12
          extracted.tags        ?? [],    // $13
          extracted.damage_asset ?? null, // $14
          extracted.damage_type  ?? null, // $15
          finalScore,                     // $16
          escalationPoints,               // $17
        ]
  );

  const eventId = rows[0]?.event_id;
  if (!eventId) return { result: 'skipped' };

  // 11. Insert source
  await sql(`
    INSERT INTO event_sources (event_id, publisher, url, published_time, source_type, reliability_tier)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT DO NOTHING
  `, [eventId, item.publisher, item.url, item.publishedTime, evidenceType, tier]);

  await sql(`UPDATE raw_items SET processed=true WHERE content_hash=$1`, [item.contentHash]);

  // 12. Dispatch instant alerts — fire-and-forget, non-fatal
  // Only for confirmed/likely events; unconfirmed signals are never dispatched.
  if (confidence !== 'unconfirmed') {
    dispatchInstantAlert(eventId).catch(err =>
      log.warn('ingest', 'Instant alert dispatch failed', { event_id: eventId, error: String(err) })
    );
  }

  return { result: 'created', llmError: llmErrorOccurred || extractionFailed, geocodeFailed: !!geocodeFailed };
}

// ── Job run helpers ───────────────────────────────────────────────────────────

// Thrown when a concurrent instance of the same job is already running.
// Callers should exit cleanly rather than log an error.
class AlreadyRunningError extends Error {
  constructor(jobName: string) { super(`${jobName} already running — skipping concurrent invocation`); }
}

async function startJobRun(jobName: string): Promise<string> {
  // Guard against concurrent Vercel cron invocations (possible during deploys
  // or when a previous run is still in flight). If a 'running' row exists for
  // this job that started within the last 4 minutes, skip this invocation.
  const active = await sql<{ job_id: string }>(`
    SELECT job_id FROM job_runs
    WHERE job_name = $1
      AND status   = 'running'
      AND started_at > now() - interval '4 minutes'
    LIMIT 1
  `, [jobName]);

  if (active.length > 0) {
    throw new AlreadyRunningError(jobName);
  }

  const rows = await sql<{ job_id: string }>(`
    INSERT INTO job_runs (job_name, status) VALUES ($1,'running') RETURNING job_id
  `, [jobName]);
  return rows[0].job_id;
}

async function finishJobRun(
  jobId:           string,
  status:          'ok' | 'error' | 'partial',
  itemsFetched:    number,
  eventsCreated:   number,
  eventsUpdated:   number,
  error?:          string,
  llmErrors?:      number,
  geocodingFailed?: number
): Promise<void> {
  await sql(`
    UPDATE job_runs
    SET finished_at=now(), status=$2, items_fetched=$3,
        events_created=$4, events_updated=$5, error=$6,
        llm_errors=$7, geocoding_failed=$8
    WHERE job_id=$1
  `, [jobId, status, itemsFetched, eventsCreated, eventsUpdated, error ?? null,
      llmErrors ?? null, geocodingFailed ?? null]);
}

// ── CLI entry (npx tsx workers/ingest.ts) ─────────────────────────────────────
if (process.argv[1]?.endsWith('ingest.ts') || process.argv[1]?.endsWith('ingest.js')) {
  // Graceful shutdown: on SIGTERM (sent by Vercel/Docker before force-kill),
  // allow the current item pipeline to finish but don't start new work.
  process.on('SIGTERM', () => {
    log.info('ingest', 'SIGTERM received — will stop after current item');
    _shuttingDown = true;
  });
  process.on('SIGINT', () => {
    log.info('ingest', 'SIGINT received — stopping');
    process.exit(0);
  });

  runIngestion().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
