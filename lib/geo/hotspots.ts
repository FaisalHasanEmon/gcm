// lib/geo/hotspots.ts
// PostGIS hotspot clustering using ST_ClusterDBSCAN — v5 §5 + §6

import { sql } from '../db/pool';
import type { Hotspot, Severity } from '../types';

const CLUSTER_RADIUS_M = 50_000;  // 50 km — configurable
const MIN_CLUSTER_SIZE = 1;

export async function computeHotspots(
  theaterId: string,
  rangeHours: number,
  limit = 8
): Promise<Hotspot[]> {
  const rows = await sql<{
    cluster_id:    number;
    location_name: string;
    lat:           string;
    lon:           string;
    event_count:   string;
    sev_rank:      string;
  }>(`
    WITH pre_clustered AS (
      -- Cap input rows before the spatial window function.
      -- ST_ClusterDBSCAN is O(n log n); without a LIMIT a high-volume theater
      -- with thousands of events will hit the 8s statement_timeout.
      -- 500 rows covers all realistic operational scenarios comfortably.
      SELECT
        event_id,
        location_name,
        ST_Y(geom::geometry) AS lat,
        ST_X(geom::geometry) AS lon,
        severity
      FROM events
      WHERE theater_id      = $1
        AND timestamp_utc   >= now() - interval '${rangeHours} hours'
        AND geom             IS NOT NULL
        AND confidence       IN ('confirmed', 'likely')
      ORDER BY importance_score DESC, timestamp_utc DESC
      LIMIT 500
    ),
    clustered AS (
      SELECT
        event_id,
        location_name,
        lat,
        lon,
        severity,
        ST_ClusterDBSCAN(ST_SetSRID(ST_MakePoint(lon, lat), 4326), $3, $4)
          OVER ()                                         AS cluster_id
      FROM pre_clustered
    ),
    aggregated AS (
      SELECT
        cluster_id,
        MODE() WITHIN GROUP (ORDER BY location_name)      AS location_name,
        AVG(lat)                                           AS lat,
        AVG(lon)                                           AS lon,
        COUNT(*)                                           AS event_count,
        MAX(CASE severity
          WHEN 'critical' THEN 4
          WHEN 'high'     THEN 3
          WHEN 'medium'   THEN 2
          ELSE 1
        END)                                               AS sev_rank
      FROM clustered
      WHERE cluster_id IS NOT NULL
      GROUP BY cluster_id
    )
    SELECT
      cluster_id,
      COALESCE(location_name, 'Unknown area')     AS location_name,
      ROUND(lat::numeric, 4)                       AS lat,
      ROUND(lon::numeric, 4)                       AS lon,
      event_count,
      sev_rank
    FROM aggregated
    ORDER BY event_count DESC
    LIMIT $2
  `, [theaterId, limit, CLUSTER_RADIUS_M, MIN_CLUSTER_SIZE]);

  const SEV_MAP: Record<string, Severity> = { '4': 'critical', '3': 'high', '2': 'medium', '1': 'low' };

  return rows.map(r => ({
    cluster_id:    r.cluster_id,
    location_name: r.location_name,
    lat:           parseFloat(r.lat),
    lon:           parseFloat(r.lon),
    event_count:   parseInt(r.event_count, 10),
    max_severity:  SEV_MAP[r.sev_rank] ?? 'low',
  }));
}
