// lib/scoring/wpi.ts
// War Probability Indicator — v5 §5.6
// RISK INDICATOR ONLY — NOT A PREDICTION. Label must appear in UI.

import { sql } from '../db/pool';
import type { WpiData, WpiCategory } from '../types';

// Configurable weight model — must sum to 1.0
const WEIGHTS = {
  escalationTrend:      0.25,
  engagementFrequency:  0.25,
  strategicAssets:      0.20,
  mobilizationSignals:  0.15,
  rhetoricIntensity:    0.15,
} as const;

// Normalization denominators (configurable)
const MAX_ENGAGEMENTS_24H  = 10;
const MAX_STRATEGIC_72H    = 5;
const MAX_MOBILIZATIONS_72H = 8;
const MAX_RHETORIC_SCORE   = 50;

export function toCategory(score: number): WpiCategory {
  if (score <= 30) return 'Low Risk';
  if (score <= 60) return 'Elevated';
  if (score <= 80) return 'High';
  return 'Critical';
}

export async function computeWpi(theaterId: string): Promise<WpiData> {
  // All 5 sub-queries are independent — run them in parallel to cut latency
  // from ~5 × round-trip time down to ~1 × round-trip time.
  const [
    trendRows,
    engRow,
    assetRow,
    mobRow,
    rhRow,
  ] = await Promise.all([
    // 1. Escalation trend score (48h split into current/previous 24h)
    sql<{ period: string; pts: string }>(`
      SELECT
        CASE WHEN timestamp_utc >= now() - interval '24 hours' THEN 'current' ELSE 'previous' END AS period,
        SUM(escalation_points) AS pts
      FROM events
      WHERE theater_id = $1
        AND timestamp_utc >= now() - interval '48 hours'
        AND confidence IN ('confirmed', 'likely')
      GROUP BY period
    `, [theaterId]),

    // 2. Direct engagement frequency (24h)
    sql<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt
      FROM events
      WHERE theater_id = $1
        AND timestamp_utc >= now() - interval '24 hours'
        AND event_type IN ('airstrike', 'missile_launch', 'drone_attack', 'naval_activity', 'explosion')
        AND confidence IN ('confirmed', 'likely')
    `, [theaterId]),

    // 3. Strategic asset attacks (72h)
    sql<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt
      FROM events
      WHERE theater_id = $1
        AND timestamp_utc >= now() - interval '72 hours'
        AND damage_asset IS NOT NULL
        AND (
          lower(damage_asset) LIKE '%embassy%'  OR
          lower(damage_asset) LIKE '%airport%'  OR
          lower(damage_asset) LIKE '%oil%'      OR
          lower(damage_asset) LIKE '%nuclear%'  OR
          lower(damage_asset) LIKE '%pipeline%' OR
          lower(damage_asset) LIKE '%power%'    OR
          lower(damage_asset) LIKE '%port%'
        )
        AND confidence IN ('confirmed', 'likely')
    `, [theaterId]),

    // 4. Mobilization signals (72h)
    sql<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt FROM events
      WHERE theater_id = $1
        AND timestamp_utc >= now() - interval '72 hours'
        AND event_type = 'military_movement'
        AND confidence IN ('confirmed', 'likely')
    `, [theaterId]),

    // 5. Rhetoric intensity (72h official_statements, weighted by severity)
    sql<{ score: string }>(`
      SELECT COALESCE(SUM(
        CASE severity
          WHEN 'critical' THEN 10
          WHEN 'high'     THEN 6
          WHEN 'medium'   THEN 3
          ELSE 1
        END
      ), 0) AS score
      FROM events
      WHERE theater_id = $1
        AND timestamp_utc >= now() - interval '72 hours'
        AND event_type = 'official_statement'
    `, [theaterId]),
  ]);

  const cur24  = parseInt(trendRows.find(r => r.period === 'current')?.pts  ?? '0', 10);
  const prev24 = parseInt(trendRows.find(r => r.period === 'previous')?.pts ?? '0', 10);
  const trendScore = prev24 > 0
    ? Math.min(100, Math.max(0, 50 + ((cur24 - prev24) / prev24) * 50))
    : (cur24 > 0 ? 60 : 30);

  const engScore      = Math.min(100, (parseInt(engRow[0]?.cnt   ?? '0', 10) / MAX_ENGAGEMENTS_24H)   * 100);
  const assetScore    = Math.min(100, (parseInt(assetRow[0]?.cnt ?? '0', 10) / MAX_STRATEGIC_72H)      * 100);
  const mobScore      = Math.min(100, (parseInt(mobRow[0]?.cnt   ?? '0', 10) / MAX_MOBILIZATIONS_72H) * 100);
  const rhetoricScore = Math.min(100, (parseInt(rhRow[0]?.score  ?? '0', 10) / MAX_RHETORIC_SCORE)    * 100);

  const composite = Math.round(
    trendScore    * WEIGHTS.escalationTrend    +
    engScore      * WEIGHTS.engagementFrequency +
    assetScore    * WEIGHTS.strategicAssets    +
    mobScore      * WEIGHTS.mobilizationSignals +
    rhetoricScore * WEIGHTS.rhetoricIntensity
  );

  const drivers = [
    { label: 'Escalation trend',            score: trendScore    },
    { label: 'Direct engagement frequency', score: engScore      },
    { label: 'Strategic asset attacks',     score: assetScore    },
    { label: 'Mobilization signals',        score: mobScore      },
    { label: 'Rhetoric intensity',          score: rhetoricScore },
  ].sort((a, b) => b.score - a.score).slice(0, 3).map(d => d.label);

  return {
    score:       Math.min(100, composite),
    category:    toCategory(composite),
    top_drivers: drivers,
    methodology:
      'Risk indicator — NOT a prediction. ' +
      'Weighted model: escalation trend (25%), engagement frequency (25%), ' +
      'strategic asset attacks (20%), mobilization signals (15%), rhetoric intensity (15%). ' +
      'For situational awareness only.',
    computed_at: new Date().toISOString(),
  };
}
