// workers/prompts.ts
// v5 §9 LLM prompt pack — exact templates, used verbatim by the ingestion worker.

/** v5 §9.1 — Event extraction → structured JSON */
export function buildExtractionPrompt(reportText: string): {
  system: string;
  user: string;
} {
  return {
    system: `You are a neutral geopolitical intelligence analyst. Extract ONLY verifiable conflict events. No speculation.`,
    user: `From the report below, return ONLY valid JSON with:
timestamp_utc (ISO 8601 or null),
country_primary,
location_name,
actors_involved (array),
event_type (airstrike, missile_launch, drone_attack, military_movement, naval_activity, official_statement, warning_alert, explosion, infrastructure_damage, casualty_update, other),
severity (critical/high/medium/low),
confidence (confirmed/likely/unconfirmed),
evidence_type (news/official/osint/satellite/flight/ship/mixed),
headline (<=12 words),
summary_20w (<=20 words, neutral, include location if known),
damage_asset (optional: string or null),
damage_type (optional: string or null),
tags (array of strings).

If the report contains NO conflict event, return ONLY: {"no_event": true}
Do NOT wrap the JSON in markdown. Return raw JSON only.

REPORT:
${reportText}`,
  };
}

/** v5 §9.2 — AI geopolitical importance scoring (0–100) */
export function buildScoringPrompt(
  theaterName: string,
  eventJson: object
): { system: string; user: string } {
  return {
    system: `You are a neutral geopolitical analyst.`,
    user: `Score the strategic importance of this event (0-100) for the specified theater.
Consider escalation risk, strategic assets, cross-border implications, major power involvement, civilian impact.
Return ONLY JSON: {"ai_importance": number, "reason": "<=18 words"}.

THEATER: ${theaterName}
EVENT_JSON:
${JSON.stringify(eventJson, null, 2)}`,
  };
}

/** v5 §9.3 — Strategic analysis brief (every 6–12h) */
export function buildAnalysisPrompt(
  theaterName: string,
  topEventsJson: object[],
  previousBrief?: string
): { system: string; user: string } {
  return {
    system: `You are a neutral analyst. No speculation. Cite sources by publisher names only (no URLs).`,
    user: `Write a strategic brief for theater ${theaterName}.
Rules:
- 3–5 bullets max
- each bullet <= 20 words
- include confidence tag (Confirmed/Likely/Unconfirmed) at end
- include "What changed since last brief" as 1 bullet if previous_brief provided

INPUT:
top_events_json: ${JSON.stringify(topEventsJson, null, 2)}
${previousBrief ? `previous_brief: ${previousBrief}` : ''}

Return ONLY bullets (plain text lines starting with "-").`,
  };
}
