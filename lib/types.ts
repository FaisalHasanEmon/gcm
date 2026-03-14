// lib/types.ts
// Canonical type definitions used across API routes, lib, and components.

// ── Enums / union types ───────────────────────────────────────────────────────
export type Severity      = 'critical' | 'high' | 'medium' | 'low';
export type Confidence    = 'confirmed' | 'likely' | 'unconfirmed';
export type EvidenceType  = 'news' | 'official' | 'osint' | 'satellite' | 'flight' | 'ship' | 'mixed';
export type SourceTier    = 'tier1' | 'tier2' | 'tier3';
export type SourceType    = 'news' | 'official' | 'osint';
export type EventType =
  | 'airstrike' | 'missile_launch' | 'drone_attack' | 'military_movement'
  | 'naval_activity' | 'official_statement' | 'warning_alert' | 'explosion'
  | 'infrastructure_damage' | 'casualty_update' | 'other';
export type EscalationLevel = 'Low' | 'Medium' | 'High';
export type TrendLabel      = 'Increasing' | 'Stable' | 'Decreasing';
export type WpiCategory     = 'Low Risk' | 'Elevated' | 'High' | 'Critical';
export type AlertChannel    = 'email' | 'telegram' | 'sms' | 'push';
export type AlertFrequency  = 'instant' | 'hourly' | 'daily';
export type JobStatus       = 'running' | 'ok' | 'error' | 'partial';

// ── Database row types ────────────────────────────────────────────────────────
export interface Theater {
  theater_id:        string;
  name:              string;
  slug:              string;
  importance_weight: number;
  is_active:         boolean;
  created_at:        string;
}

export interface ConflictEvent {
  event_id:          string;
  theater_id:        string;
  created_at:        string;
  updated_at:        string;
  timestamp_utc:     string;
  country_primary:   string;
  location_name:     string | null;
  lat:               number | null;   // extracted from geom by API
  lon:               number | null;   // extracted from geom by API
  location_precision: 'exact' | 'approximate' | 'region' | 'unknown';
  actors_involved:   string[];
  event_type:        EventType;
  severity:          Severity;
  confidence:        Confidence;
  evidence_type:     EvidenceType;
  is_signal:         boolean;
  headline:          string | null;
  summary_20w:       string;
  tags:              string[];
  damage_asset:      string | null;
  damage_type:       string | null;
  importance_score:  number;
  escalation_points: number;
  // Joined fields
  sources_count?:    number;
  sources?:          EventSource[];
}

export interface EventSource {
  source_id:        string;
  event_id:         string;
  publisher:        string;
  url:              string;
  published_time:   string | null;
  source_type:      SourceType;
  reliability_tier: SourceTier;
}

export interface CasualtyReport {
  report_id:        string;
  theater_id:       string;
  period_start:     string;
  period_end:       string;
  country:          string;
  killed:           number | null;
  injured:          number | null;
  civilian_killed:  number | null;
  civilian_injured: number | null;
  military_killed:  number | null;
  military_injured: number | null;
  confidence:       Confidence;
  sources:          { publisher: string; url?: string }[];
}

export interface CasualtySummary {
  country:         string;
  killed:          number;
  injured:         number;
  civilian_killed: number;
  military_killed: number;
  confidence:      Confidence;
}

// ── Intelligence output types ─────────────────────────────────────────────────
export interface EscalationData {
  score:            number;        // 0–100
  level:            EscalationLevel;
  trend:            TrendLabel;
  points_72h:       number;        // raw 72h rolling sum
  points_24h:       number;        // last 24h points
  points_prev_24h:  number;        // prior 24h points (for trend calc)
}

export interface GciData {
  gci_score:             number;   // 0–100
  active_theaters_count: number;
  theaters_summary:      { slug: string; name: string; score: number }[];
  computed_at:           string;
}

export interface WpiData {
  score:       number;             // 0–100
  category:    WpiCategory;
  top_drivers: string[];           // top 3 contributing factors
  methodology: string;             // shown in UI
  computed_at: string;
}

export interface Hotspot {
  cluster_id:    number;
  location_name: string;
  lat:           number;
  lon:           number;
  event_count:   number;
  max_severity:  Severity;
}

export interface RegionSummary {
  country:    string;
  bullets:    string[];
  key_events: ConflictEvent[];
}

export interface AnalysisBrief {
  bullets:      string[];
  generated_at: string;
  theater_slug: string;
}

export interface DailySummary {
  date:            string;         // YYYY-MM-DD
  total_incidents: number;
  by_type:         Record<string, number>;
  top_events:      ConflictEvent[];
}

// ── API response shapes ───────────────────────────────────────────────────────
export interface PaginationMeta {
  page:     number;
  pageSize: number;
  total:    number;
}

export interface CursorMeta {
  cursor:    string | null;  // event_id of last item
  cursor_ts: string | null;  // timestamp_utc of last item
  hasMore:   boolean;
}

export interface DashboardPayload {
  theater:       Theater;
  escalation:    EscalationData;
  gci:           GciData;
  breaking:      ConflictEvent | null;
  developments:  ConflictEvent[];
  casualties:    CasualtySummary[];
  damage:        ConflictEvent[];
  timeline:      ConflictEvent[];
  hotspots:      Hotspot[];
  regions:       RegionSummary[];
  analysis:      AnalysisBrief | null;
  daily_summary: DailySummary;
  generated_at:  string;
}
