// lib/scoring/confidence.ts
// Confidence tier rules — v5 §5.1

import type { Confidence, SourceTier } from '../types';

// ── Publisher tier registry ───────────────────────────────────────────────────
export const TIER1_PUBLISHERS = new Set([
  'reuters', 'ap', 'ap news', 'associated press',
  'bbc', 'bbc world', 'bbc news',
  'afp', 'agence france-presse',
  'the guardian', 'new york times', 'nyt',
  'washington post', 'financial times', 'ft',
  'al jazeera', 'bloomberg', 'dpa',
  'us navy navcent', 'iaea', 'nato',          // official tier1 bodies
]);

export const TIER2_PUBLISHERS = new Set([
  'haaretz', 'times of israel', 'jerusalem post', 'ynet',
  'irna', 'press tv', 'tasnim', 'mehr news',
  'sputnik', 'tass', 'rt',
  'ukrinform', 'kyiv post', 'kyiv independent',
  'al arabiya', 'middle east eye', 'naharnet', 'the national',
  'syrian observatory', 'sohr',
]);

export function classifyPublisher(publisher: string): SourceTier {
  const lower = publisher.toLowerCase().trim();
  if (TIER1_PUBLISHERS.has(lower)) return 'tier1';
  if (TIER2_PUBLISHERS.has(lower)) return 'tier2';
  return 'tier3';
}

interface SourceInfo {
  tier:       SourceTier;
  sourceType: string;  // 'news' | 'official' | 'osint'
  isOfficialActor?: boolean; // official statement from a primary conflict actor
}

/**
 * Compute confidence from a set of sources — v5 §5.1 rules.
 *
 * Confirmed:
 *   - ≥2 independent Tier1 sources, OR
 *   - 1 official statement from primary actor, OR
 *   - 1 Tier1 + satellite/flight/ship corroboration
 *
 * Likely:
 *   - 1 Tier1 source, OR
 *   - ≥2 consistent Tier2 sources, OR
 *   - OSINT corroborated (no Tier1 yet)
 *
 * Unconfirmed:
 *   - single Tier2/Tier3, vague, or social-only
 */
export function computeConfidence(
  sources: SourceInfo[],
  hasStrongCorroboration: boolean,  // satellite/flight/ship evidence
  isSignal: boolean
): Confidence {
  if (isSignal) return 'unconfirmed';

  const t1Count       = sources.filter(s => s.tier === 'tier1').length;
  const t2Count       = sources.filter(s => s.tier === 'tier2').length;
  const hasOfficial   = sources.some(s => s.isOfficialActor === true);
  const hasOsint      = sources.some(s => s.sourceType === 'osint');

  if (t1Count >= 2)                            return 'confirmed';
  if (hasOfficial)                             return 'confirmed';
  if (t1Count >= 1 && hasStrongCorroboration)  return 'confirmed';
  if (t1Count >= 1)                            return 'likely';
  if (t2Count >= 2)                            return 'likely';
  if (hasOsint && t2Count >= 1)               return 'likely';

  return 'unconfirmed';
}
