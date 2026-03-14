// lib/db/timeframe.ts
// Parses the ?range= query param used by all list endpoints.

export type RangeParam = '1h' | '6h' | '24h' | '72h' | '96h' | '7d' | '30d';

const RANGE_TO_HOURS: Record<string, number> = {
  '1h':  1,
  '6h':  6,
  '24h': 24,
  '72h': 72,
  '96h': 96,
  '7d':  168,
  '30d': 720,
};

/**
 * Parse ?range= param to hours integer.
 * Falls back to defaultRange if value is unrecognized.
 */
export function parseRange(
  range: string | null | undefined,
  defaultRange: RangeParam = '24h'
): number {
  const hours = RANGE_TO_HOURS[range ?? ''];
  return hours ?? RANGE_TO_HOURS[defaultRange];
}

/**
 * Convert hours to a Postgres interval expression suitable for inline SQL.
 * e.g. rangeToInterval(72) → "72 hours"
 * IMPORTANT: Only call with values from parseRange() — not with user input directly.
 */
export function rangeToInterval(hours: number): string {
  return `${hours} hours`;
}

/** Inline SQL timestamp threshold. */
export function rangeToSqlThreshold(hours: number): string {
  return `now() - interval '${hours} hours'`;
}
