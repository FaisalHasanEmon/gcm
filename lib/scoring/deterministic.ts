// lib/scoring/deterministic.ts
// Deterministic event importance scoring — v5 §5.3
// Also computes escalation_points — v5 §5.4

import type { Severity, EventType, Confidence } from '../types';

// ── Score tables ──────────────────────────────────────────────────────────────
const SEVERITY_PTS: Record<Severity, number> = {
  critical: 40,
  high:     25,
  medium:   12,
  low:       4,
};

const EVENT_TYPE_BOOST: Record<EventType, number> = {
  airstrike:            18,
  missile_launch:       20,
  drone_attack:         15,
  military_movement:     8,
  naval_activity:       10,
  official_statement:    5,
  warning_alert:         6,
  explosion:            16,
  infrastructure_damage: 14,
  casualty_update:       12,
  other:                  2,
};

const CONFIDENCE_PTS: Record<Confidence, number> = {
  confirmed:    10,
  likely:        5,
  unconfirmed:   0,
};

const STRATEGIC_ASSET_KEYWORDS = [
  'embassy', 'airport', 'oil', 'nuclear', 'power grid',
  'port', 'refinery', 'pipeline', 'dam', 'railway', 'radar',
];

const MAJOR_ACTOR_PATTERNS = [
  /\bUS\b/i, /\bUSA\b/i, /\bUnited States\b/i, /\bNATO\b/i,
  /\bRussia\b/i, /\bChina\b/i, /\bIDF\b/i, /\bIRGC\b/i,
  /\bIsrael\b/i, /\bIran\b/i,
];

interface ScoringInput {
  severity:        Severity;
  event_type:      EventType;
  confidence:      Confidence;
  timestamp_utc:   string;
  actors_involved?: string[];
  damage_asset?:   string | null;
}

/**
 * Compute deterministic importance score (0–100).
 * Components: severity + type boost + confidence + recency decay + actor boost + infrastructure boost.
 */
export function computeDeterministicScore(e: ScoringInput): number {
  const sev    = SEVERITY_PTS[e.severity]    ?? 0;
  const type   = EVENT_TYPE_BOOST[e.event_type] ?? 0;
  const conf   = CONFIDENCE_PTS[e.confidence]   ?? 0;

  // Recency: max 15 pts, linear decay over 24h (0 pts at ≥24h)
  const ageH   = (Date.now() - new Date(e.timestamp_utc).getTime()) / 3_600_000;
  const recency = Math.max(0, 15 - (ageH / 24) * 15);

  // Actor boost: major power involved
  const actorStr   = (e.actors_involved ?? []).join(' ');
  const actorBoost = MAJOR_ACTOR_PATTERNS.some(re => re.test(actorStr)) ? 8 : 0;

  // Infrastructure damage boost
  const assetStr   = (e.damage_asset ?? '').toLowerCase();
  const infraBoost = STRATEGIC_ASSET_KEYWORDS.some(k => assetStr.includes(k)) ? 10 : 0;

  return Math.min(100, Math.round(sev + type + conf + recency + actorBoost + infraBoost));
}

/**
 * Final hybrid score — v5 §5.3.
 * score = 0.6 * deterministic + 0.4 * ai_importance
 * Falls back to deterministic-only if AI score unavailable.
 */
export function computeFinalScore(
  deterministic: number,
  aiImportance: number | null,
  weights = { det: 0.6, ai: 0.4 }
): number {
  if (aiImportance === null) return deterministic;
  return Math.min(100, Math.round(weights.det * deterministic + weights.ai * aiImportance));
}

/**
 * Compute escalation_points per event — v5 §5.4.
 * severity_points + type_points + confidence_points + damage_points
 */
export function computeEscalationPoints(e: {
  severity:    Severity;
  event_type:  EventType;
  confidence:  Confidence;
  damage_asset?: string | null;
}): number {
  const sev  = SEVERITY_PTS[e.severity]          ?? 0;
  const type = EVENT_TYPE_BOOST[e.event_type]    ?? 0;
  const conf = CONFIDENCE_PTS[e.confidence]      ?? 0;
  const dmg  = (e.damage_asset?.length ?? 0) > 0 ? 8 : 0;
  return Math.min(60, sev + type + conf + dmg);
}
