// lib/scoring/gci.ts
// Global Conflict Index — v5 §5.5

import { sql } from '../db/pool';
import { normalizeToScore } from './escalation';
import type { GciData } from '../types';

// ── Pure math helpers (exported for unit testing) ─────────────────────────────

/** Weighted average of per-theater scores, or 0 if no theaters. */
export function computeWeightedAvg(
  theaters: Array<{ score: number; weight: number }>
): number {
  const totalWeight = theaters.reduce((s, t) => s + t.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = theaters.reduce((s, t) => s + t.score * t.weight, 0);
  return weightedSum / totalWeight;
}

/**
 * Spread factor — +5 per theater above Medium threshold (score > 30),
 * capped at 20. Ensures GCI rises when multiple theaters escalate simultaneously.
 */
export function computeSpreadFactor(
  theaters: Array<{ score: number }>
): number {
  const aboveMedium = theaters.filter(t => t.score > 30).length;
  return Math.min(20, aboveMedium * 5);
}

/** Final GCI score = weighted avg + spread factor, capped at 100. */
export function computeGciScore(
  theaters: Array<{ score: number; weight: number }>
): number {
  const avg    = computeWeightedAvg(theaters);
  const spread = computeSpreadFactor(theaters);
  return Math.min(100, Math.round(avg + spread));
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GCI = weighted average of per-theater escalation scores + spread factor.
 *
 * Spread factor: +5 per theater above Medium threshold (score > 30), capped at 20.
 * This ensures GCI rises as more theaters activate simultaneously.
 */
export async function computeGci(): Promise<GciData> {
  const theaters = await sql<{
    theater_id:       string;
    name:             string;
    slug:             string;
    importance_weight: string;
    rolling_pts:      string;
  }>(`
    SELECT
      t.theater_id,
      t.name,
      t.slug,
      t.importance_weight,
      COALESCE(SUM(e.escalation_points), 0) AS rolling_pts
    FROM theaters t
    LEFT JOIN events e
      ON e.theater_id = t.theater_id
      AND e.timestamp_utc >= now() - interval '72 hours'
      AND e.confidence IN ('confirmed', 'likely')
    WHERE t.is_active = true
    GROUP BY t.theater_id, t.name, t.slug, t.importance_weight
  `);

  if (theaters.length === 0) {
    return { gci_score: 0, active_theaters_count: 0, theaters_summary: [], computed_at: new Date().toISOString() };
  }

  const scored = theaters.map(t => ({
    slug:   t.slug,
    name:   t.name,
    score:  normalizeToScore(parseInt(t.rolling_pts, 10)),
    weight: parseFloat(t.importance_weight),
  }));

  return {
    gci_score:             computeGciScore(scored),
    active_theaters_count: theaters.length,
    theaters_summary:      scored.map(t => ({ slug: t.slug, name: t.name, score: t.score })),
    computed_at:           new Date().toISOString(),
  };
}
