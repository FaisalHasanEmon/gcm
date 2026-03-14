// lib/intelligence/geocoder.ts
// Geocodes location_name to lat/lon for PostGIS storage.
// Uses Mapbox Geocoding API if token present; falls back to a built-in
// city-coordinate lookup table for the most common conflict locations.

import { captureError } from '../errors';

export interface GeoPoint { lat: number; lon: number; precision: 'exact' | 'approximate' | 'region'; }

// ── Fast local lookup (no API call needed for common locations) ───────────────
const KNOWN_LOCATIONS: Record<string, GeoPoint> = {
  // Middle East
  'isfahan':       { lat: 32.657,  lon: 51.677,  precision: 'approximate' },
  'tehran':        { lat: 35.689,  lon: 51.389,  precision: 'exact'       },
  'haifa':         { lat: 32.794,  lon: 34.990,  precision: 'approximate' },
  'tel aviv':      { lat: 32.085,  lon: 34.781,  precision: 'exact'       },
  'jerusalem':     { lat: 31.768,  lon: 35.214,  precision: 'exact'       },
  'beirut':        { lat: 33.888,  lon: 35.495,  precision: 'exact'       },
  'damascus':      { lat: 33.510,  lon: 36.291,  precision: 'exact'       },
  'aleppo':        { lat: 36.202,  lon: 37.161,  precision: 'approximate' },
  'baghdad':       { lat: 33.341,  lon: 44.361,  precision: 'exact'       },
  'basra':         { lat: 30.508,  lon: 47.783,  precision: 'approximate' },
  'erbil':         { lat: 36.191,  lon: 44.009,  precision: 'approximate' },
  'mosul':         { lat: 36.340,  lon: 43.130,  precision: 'approximate' },
  'amman':         { lat: 31.956,  lon: 35.945,  precision: 'exact'       },
  'kabul':         { lat: 34.528,  lon: 69.172,  precision: 'exact'       },
  'sanaa':         { lat: 15.369,  lon: 44.191,  precision: 'exact'       },
  'aden':          { lat: 12.779,  lon: 45.036,  precision: 'approximate' },
  'kuwait city':   { lat: 29.368,  lon: 47.978,  precision: 'exact'       },
  'manama':        { lat: 26.217,  lon: 50.587,  precision: 'exact'       },
  'doha':          { lat: 25.286,  lon: 51.533,  precision: 'exact'       },
  'abu dhabi':     { lat: 24.453,  lon: 54.377,  precision: 'exact'       },
  'riyadh':        { lat: 24.688,  lon: 46.723,  precision: 'exact'       },
  'hormuz':        { lat: 26.570,  lon: 56.250,  precision: 'approximate' },
  'strait of hormuz': { lat: 26.570, lon: 56.250, precision: 'approximate' },
  'persian gulf':  { lat: 27.000,  lon: 54.000,  precision: 'region'      },
  'red sea':       { lat: 20.000,  lon: 38.000,  precision: 'region'      },
  'natanz':        { lat: 33.724,  lon: 51.730,  precision: 'approximate' },
  'bandar abbas':  { lat: 27.183,  lon: 56.271,  precision: 'approximate' },
  'ankara':        { lat: 39.919,  lon: 32.854,  precision: 'exact'       },
  'istanbul':      { lat: 41.015,  lon: 28.980,  precision: 'exact'       },
  'northern israel': { lat: 33.100, lon: 35.500, precision: 'region'     },
  'southern lebanon': { lat: 33.270, lon: 35.520, precision: 'region'    },
  'west bank':     { lat: 32.000,  lon: 35.250,  precision: 'region'      },
  'gaza':          { lat: 31.510,  lon: 34.465,  precision: 'approximate' },

  // Eastern Europe
  'kyiv':          { lat: 50.450,  lon: 30.523,  precision: 'exact'       },
  'kharkiv':       { lat: 49.993,  lon: 36.230,  precision: 'approximate' },
  'kherson':       { lat: 46.636,  lon: 32.617,  precision: 'approximate' },
  'odesa':         { lat: 46.482,  lon: 30.724,  precision: 'approximate' },
  'mariupol':      { lat: 47.096,  lon: 37.543,  precision: 'approximate' },
  'zaporizhzhia':  { lat: 47.839,  lon: 35.139,  precision: 'approximate' },
  'lviv':          { lat: 49.840,  lon: 24.023,  precision: 'exact'       },
  'mykolaiv':      { lat: 46.975,  lon: 31.994,  precision: 'approximate' },
  'dnipro':        { lat: 48.464,  lon: 35.046,  precision: 'approximate' },
  'avdiivka':      { lat: 48.140,  lon: 37.750,  precision: 'approximate' },
  'moscow':        { lat: 55.751,  lon: 37.618,  precision: 'exact'       },
  'belgorod':      { lat: 50.601,  lon: 36.587,  precision: 'approximate' },
  'crimea':        { lat: 45.301,  lon: 34.003,  precision: 'region'      },
  'warsaw':        { lat: 52.229,  lon: 21.012,  precision: 'exact'       },
  'transnistria':  { lat: 47.163,  lon: 29.605,  precision: 'region'      },
};

/**
 * Geocode a location string to lat/lon.
 * 1. Try local lookup (instant, no API)
 * 2. Fall back to Mapbox Geocoding API if NEXT_PUBLIC_MAPBOX_TOKEN is set
 * 3. Return null if nothing found
 */
export async function geocodeLocation(
  locationName: string | null | undefined
): Promise<GeoPoint | null> {
  if (!locationName?.trim()) return null;

  // 1. Exact local lookup (case-insensitive)
  const key = locationName.toLowerCase().trim();
  if (KNOWN_LOCATIONS[key]) return KNOWN_LOCATIONS[key];

  // 2. Partial match (longest key that is a substring)
  const partial = Object.entries(KNOWN_LOCATIONS)
    .filter(([k]) => key.includes(k) || k.includes(key))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (partial) return { ...partial[1], precision: 'approximate' };

  // 3. Mapbox API (optional)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (mapboxToken) {
    return geocodeMapbox(locationName, mapboxToken);
  }

  return null;
}

async function geocodeMapbox(query: string, token: string): Promise<GeoPoint | null> {
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const [lon, lat] = data.features?.[0]?.center ?? [null, null];
    if (lon == null || lat == null) return null;
    return { lat, lon, precision: 'approximate' };
  } catch (err) {
    captureError('geocoder', err, { query });
    return null;
  }
}
