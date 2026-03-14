// lib/intelligence/forecasting.ts
// Forecasting signals — v5 §8.
// These are INDICATORS, not predictions. Labeled clearly throughout.
// Four indicator types: escalation_acceleration, widening_geography,
// strategic_asset_targeting, mobilization_signals.

import { sql } from '../db/pool';

export type IndicatorLevel = 'none' | 'low' | 'moderate' | 'elevated' | 'high';

export interface ForecastingIndicator {
  id:          string;           // stable identifier
  label:       string;           // human-readable name
  level:       IndicatorLevel;
  score:       number;           // 0–100
  detail:      string;           // one-line explanation (≤20 words)
  data_points: number;           // evidence count behind this indicator
  disclaimer:  'Indicator – not a prediction';
}

export interface ForecastingReport {
  theater_id:   string;
  theater_slug: string;
  computed_at:  string;
  indicators:   ForecastingIndicator[];
  composite:    number;           // 0–100 composite indicator score
  composite_level: IndicatorLevel;
}

// ── Level thresholds ──────────────────────────────────────────────────────────
function toLevel(score: number): IndicatorLevel {
  if (score >= 80) return 'high';
  if (score >= 60) return 'elevated';
  if (score >= 35) return 'moderate';
  if (score >= 10) return 'low';
  return 'none';
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function computeForecasting(
  theaterId: string,
  theaterSlug: string
): Promise<ForecastingReport> {
  const [acc, geo, asset, mob] = await Promise.all([
    escalationAcceleration(theaterId),
    wideningGeography(theaterId),
    strategicAssetTargeting(theaterId),
    mobilizationSignals(theaterId),
  ]);

  const indicators = [acc, geo, asset, mob];
  const composite  = Math.min(100, Math.round(
    indicators.reduce((sum, ind) => sum + ind.score, 0) / indicators.length
  ));

  return {
    theater_id:      theaterId,
    theater_slug:    theaterSlug,
    computed_at:     new Date().toISOString(),
    indicators,
    composite,
    composite_level: toLevel(composite),
  };
}

// ── 1. Escalation Acceleration ────────────────────────────────────────────────
// Compares escalation_points in 0–12h vs 12–24h window.

async function escalationAcceleration(theaterId: string): Promise<ForecastingIndicator> {
  const rows = await sql<{ recent: number; prior: number }>(`
    SELECT
      COALESCE(SUM(CASE WHEN timestamp_utc >= now() - interval '12 hours' THEN escalation_points ELSE 0 END), 0) AS recent,
      COALESCE(SUM(CASE WHEN timestamp_utc  < now() - interval '12 hours'
                        AND timestamp_utc  >= now() - interval '24 hours' THEN escalation_points ELSE 0 END), 0) AS prior
    FROM events
    WHERE theater_id = $1
      AND confidence != 'unconfirmed'
  `, [theaterId]);

  const { recent, prior } = rows[0] ?? { recent: 0, prior: 0 };
  const priorSafe = prior === 0 ? 1 : prior;
  const acceleration = ((recent - prior) / priorSafe) * 100;

  // Score: 0 = stable/decreasing, 100 = doubled in 12h
  const score = Math.min(100, Math.max(0, Math.round(acceleration)));
  const pct   = Math.round(acceleration);
  const detail = prior === 0
    ? 'No prior 12h activity to compare.'
    : pct > 0
      ? `Escalation points up ${pct}% vs prior 12h window.`
      : `Escalation points down ${Math.abs(pct)}% vs prior 12h window.`;

  return {
    id:          'escalation_acceleration',
    label:       'Escalation Acceleration',
    level:       toLevel(score),
    score,
    detail,
    data_points: Math.round(recent),
    disclaimer:  'Indicator – not a prediction',
  };
}

// ── 2. Widening Geography ─────────────────────────────────────────────────────
// Counts distinct countries active in last 24h vs prior 24h.

async function wideningGeography(theaterId: string): Promise<ForecastingIndicator> {
  const rows = await sql<{ recent_countries: number; prior_countries: number }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN timestamp_utc >= now() - interval '24 hours' THEN country_primary END) AS recent_countries,
      COUNT(DISTINCT CASE WHEN timestamp_utc  < now() - interval '24 hours'
                          AND timestamp_utc  >= now() - interval '48 hours' THEN country_primary END) AS prior_countries
    FROM events
    WHERE theater_id = $1
      AND confidence != 'unconfirmed'
  `, [theaterId]);

  const { recent_countries: r, prior_countries: p } = rows[0] ?? { recent_countries: 0, prior_countries: 0 };
  const newCountries = Math.max(0, r - p);

  // Score: each new country adds 25 pts, capped at 100
  const score = Math.min(100, newCountries * 25);
  const detail = newCountries > 0
    ? `${newCountries} new countr${newCountries > 1 ? 'ies' : 'y'} active vs prior 24h.`
    : `${r} countr${r !== 1 ? 'ies' : 'y'} active; no geographic spread detected.`;

  return {
    id:          'widening_geography',
    label:       'Widening Geography',
    level:       toLevel(score),
    score,
    detail,
    data_points: r,
    disclaimer:  'Indicator – not a prediction',
  };
}

// ── 3. Strategic Asset Targeting ──────────────────────────────────────────────
// Count events with damage_asset matching strategic keywords in last 72h.

const STRATEGIC_KEYWORDS = ['embassy','airport','oil','nuclear','power','port','refinery','pipeline','dam','railway','radar','base'];

async function strategicAssetTargeting(theaterId: string): Promise<ForecastingIndicator> {
  const rows = await sql<{ count: number }>(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE theater_id    = $1
      AND damage_asset IS NOT NULL
      AND timestamp_utc >= now() - interval '72 hours'
      AND confidence    != 'unconfirmed'
      AND (${STRATEGIC_KEYWORDS.map((k, i) => `damage_asset ILIKE $${i + 2}`).join(' OR ')})
  `, [theaterId, ...STRATEGIC_KEYWORDS.map(k => `%${k}%`)]);

  const count = rows[0]?.count ?? 0;
  // 1 attack = 30, 2 = 55, 3 = 75, 4+ = 90+
  const score = Math.min(100, count === 0 ? 0 : Math.round(30 + (count - 1) * 20));
  const detail = count === 0
    ? 'No strategic asset attacks detected in 72h.'
    : `${count} strategic asset attack${count > 1 ? 's' : ''} detected in last 72h.`;

  return {
    id:          'strategic_asset_targeting',
    label:       'Strategic Asset Targeting',
    level:       toLevel(score),
    score,
    detail,
    data_points: count,
    disclaimer:  'Indicator – not a prediction',
  };
}

// ── 4. Mobilization Signals ───────────────────────────────────────────────────
// Count military_movement events + signals in last 72h.

async function mobilizationSignals(theaterId: string): Promise<ForecastingIndicator> {
  const rows = await sql<{ movements: number; signals: number }>(`
    SELECT
      COUNT(CASE WHEN event_type = 'military_movement' AND NOT is_signal THEN 1 END) AS movements,
      COUNT(CASE WHEN is_signal = true THEN 1 END)                                    AS signals
    FROM events
    WHERE theater_id    = $1
      AND timestamp_utc >= now() - interval '72 hours'
  `, [theaterId]);

  const { movements, signals } = rows[0] ?? { movements: 0, signals: 0 };
  const total = movements + signals;
  const score = Math.min(100, total * 15);
  const detail = total === 0
    ? 'No mobilization events detected in 72h.'
    : `${movements} movement event${movements !== 1 ? 's' : ''} and ${signals} unconfirmed signal${signals !== 1 ? 's' : ''} in 72h.`;

  return {
    id:          'mobilization_signals',
    label:       'Mobilization Signals',
    level:       toLevel(score),
    score,
    detail,
    data_points: total,
    disclaimer:  'Indicator – not a prediction',
  };
}
