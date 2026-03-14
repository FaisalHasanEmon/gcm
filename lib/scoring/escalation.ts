// lib/scoring/escalation.ts
// Escalation score computation — v5 §5.4

import { sql } from '../db/pool';
import type { EscalationData, EscalationLevel, TrendLabel } from '../types';

/** Configurable max 72h points benchmark (score=100 at this value) */
const MAX_POINTS_72H = 500;

export function normalizeToScore(rollingPoints: number): number {
  return Math.min(100, Math.round((rollingPoints / MAX_POINTS_72H) * 100));
}

export function toLevel(score: number): EscalationLevel {
  if (score <= 30) return 'Low';
  if (score <= 60) return 'Medium';
  return 'High';
}

export function toTrend(pts24h: number, ptsPrev24h: number): TrendLabel {
  if (ptsPrev24h === 0) return pts24h > 0 ? 'Increasing' : 'Stable';
  const delta = (pts24h - ptsPrev24h) / ptsPrev24h;
  if (delta > 0.10)  return 'Increasing';
  if (delta < -0.10) return 'Decreasing';
  return 'Stable';
}

/**
 * Compute full escalation data for a theater.
 */
export async function computeEscalation(theaterId: string): Promise<EscalationData> {
  // 72h rolling sum (for score)
  const [r72] = await sql<{ pts: string }>(`
    SELECT COALESCE(SUM(escalation_points), 0) AS pts
    FROM events
    WHERE theater_id = $1
      AND timestamp_utc >= now() - interval '72 hours'
      AND confidence IN ('confirmed', 'likely')
  `, [theaterId]);

  // 24h vs prior 24h (for trend)
  const trendRows = await sql<{ period: string; pts: string }>(`
    SELECT
      CASE
        WHEN timestamp_utc >= now() - interval '24 hours' THEN 'current'
        ELSE 'previous'
      END AS period,
      SUM(escalation_points) AS pts
    FROM events
    WHERE theater_id = $1
      AND timestamp_utc >= now() - interval '48 hours'
      AND confidence IN ('confirmed', 'likely')
    GROUP BY period
  `, [theaterId]);

  const pts72h    = parseInt(r72?.pts ?? '0', 10);
  const pts24h    = parseInt(trendRows.find(r => r.period === 'current')?.pts  ?? '0', 10);
  const ptsPrev   = parseInt(trendRows.find(r => r.period === 'previous')?.pts ?? '0', 10);
  const score     = normalizeToScore(pts72h);

  return {
    score,
    level:           toLevel(score),
    trend:           toTrend(pts24h, ptsPrev),
    points_72h:      pts72h,
    points_24h:      pts24h,
    points_prev_24h: ptsPrev,
  };
}

/** Hourly time-series for /escalation page chart. */
export async function escalationTimeSeries(theaterId: string): Promise<
  { hour: string; points: number }[]
> {
  const rows = await sql<{ hour: string; points: string }>(`
    SELECT
      date_trunc('hour', timestamp_utc) AS hour,
      SUM(escalation_points)            AS points
    FROM events
    WHERE theater_id = $1
      AND timestamp_utc >= now() - interval '72 hours'
      AND confidence IN ('confirmed', 'likely')
    GROUP BY hour
    ORDER BY hour ASC
  `, [theaterId]);

  return rows.map(r => ({ hour: r.hour, points: parseInt(r.points, 10) }));
}
