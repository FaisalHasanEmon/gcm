#!/usr/bin/env tsx
// scripts/seed.ts
// Inserts reference data: 2 theaters, 30 events, 20 sources, 10 casualty_reports.
// Usage: npx tsx scripts/seed.ts
// Safe to re-run — uses ON CONFLICT DO NOTHING where possible.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Fixed UUIDs so seed is idempotent ────────────────────────────────────────
const T_ME = 'a1000000-0000-0000-0000-000000000001'; // Middle East
const T_EU = 'a1000000-0000-0000-0000-000000000002'; // Eastern Europe

// Pre-assigned event IDs (30)
const E = Array.from({ length: 30 }, (_, i) =>
  `b${String(i + 1).padStart(7, '0')}-0000-0000-0000-000000000000`
);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. THEATERS ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO theaters (theater_id, name, slug, importance_weight)
      VALUES
        ($1, 'Middle East – Iran/Israel/US', 'me-iran-israel-us', 1.5),
        ($2, 'Eastern Europe – Ukraine/Russia', 'eu-ukraine-russia', 1.3)
      ON CONFLICT (slug) DO NOTHING
    `, [T_ME, T_EU]);
    console.log('✓ theaters (2)');

    // ── 2. EVENTS (30) ─────────────────────────────────────────────────────
    // Columns: event_id, theater_id, timestamp_utc, country_primary,
    //          location_name, lon, lat, location_precision,
    //          actors_involved, event_type, severity, confidence,
    //          evidence_type, is_signal, headline, summary_20w,
    //          damage_asset, damage_type, importance_score, escalation_points, tags
    type EventRow = [
      string,   // event_id
      string,   // theater_id
      string,   // timestamp_utc  (interval expression like 'now()-interval \'30 min\'')
      string,   // country_primary
      string,   // location_name
      number,   // lon
      number,   // lat
      string,   // location_precision
      string[], // actors_involved
      string,   // event_type
      string,   // severity
      string,   // confidence
      string,   // evidence_type
      boolean,  // is_signal
      string,   // headline
      string,   // summary_20w
      string | null, // damage_asset
      string | null, // damage_type
      number,   // importance_score
      number,   // escalation_points
      string[], // tags
    ];

    const events: EventRow[] = [
      // ── Middle East (events 0–19) ─────────────────────────────────────────
      [E[0],  T_ME, "now()-interval'30 minutes'", 'Iran',         'Isfahan',            51.677, 32.657, 'approximate', ['IRGC','Unknown'],        'explosion',            'critical', 'confirmed',   'news',     false, 'Large explosion near Isfahan military facility',          'Large explosion reported near Iranian military research facility in Isfahan; cause under investigation.',         'Military research facility', 'explosion', 88, 25, ['iran','explosion','military']],
      [E[1],  T_ME, "now()-interval'55 minutes'", 'Israel',       'Haifa',              34.990, 32.794, 'approximate', ['Hezbollah','IDF'],       'missile_launch',       'critical', 'confirmed',   'news',     false, 'Rocket barrage fired toward Haifa metropolitan area',    'Multiple rockets launched toward Haifa; Iron Dome interceptors activated; no casualties confirmed.',             null, null,                        85, 22, ['israel','rockets','hezbollah']],
      [E[2],  T_ME, "now()-interval'90 minutes'", 'Persian Gulf', 'Strait of Hormuz',   56.250, 26.570, 'approximate', ['USN','IRGC Navy'],      'naval_activity',       'high',     'confirmed',   'ship',     false, 'US destroyer skirmish with IRGC vessels off Hormuz',     'US destroyer engaged in close-proximity incident with IRGC naval vessels near Strait of Hormuz.',                null, null,                        80, 18, ['naval','hormuz','us','iran']],
      [E[3],  T_ME, "now()-interval'2 hours'",    'Syria',        'Aleppo',             37.161, 36.202, 'approximate', ['Unknown'],              'drone_attack',         'high',     'confirmed',   'osint',    false, 'Drone strike near Aleppo northern outskirts',            'Drone strike reported near Aleppo northern outskirts; Syrian Observatory confirmed site impact.',                 'Military vehicle depot', 'fire', 72, 18, ['syria','drone','aleppo']],
      [E[4],  T_ME, "now()-interval'3 hours'",    'Israel',       'Northern Israel',    35.500, 33.100, 'approximate', ['IDF'],                  'airstrike',            'critical', 'confirmed',   'news',     false, 'IDF airstrike targets missile depot near Damascus',      'IDF conducted airstrike on reported Hezbollah missile storage site on Damascus perimeter.',                      'Weapons depot', 'bombed',    90, 26, ['idf','airstrike','damascus']],
      [E[5],  T_ME, "now()-interval'4 hours'",    'Iran',         'Tehran',             51.389, 35.689, 'exact',       ['IRGC'],                 'official_statement',   'medium',   'confirmed',   'official', false, 'IRGC commander threatens proportional military response', 'IRGC commander issued statement warning of proportional military response to recent strikes.',                   null, null,                        55, 10, ['irgc','statement','threat']],
      [E[6],  T_ME, "now()-interval'5 hours'",    'Kuwait',       'Kuwait City',        47.978, 29.368, 'exact',       ['Unknown'],              'infrastructure_damage','high',     'confirmed',   'news',     false, 'US Embassy compound damaged in Kuwait City',             'US Embassy compound in Kuwait City sustained structural damage following nearby explosion.',                      'US Embassy', 'breach',        82, 20, ['embassy','kuwait','damage']],
      [E[7],  T_ME, "now()-interval'6 hours'",    'Syria',        'Damascus',           36.291, 33.510, 'approximate', ['Unknown'],              'airstrike',            'high',     'confirmed',   'news',     false, 'Military base struck near Damascus suburb',              'Syrian military base near Damascus struck by unattributed aerial attack; fire reported at site.',                'Military base', 'bombed',    75, 19, ['syria','airstrike','damascus']],
      [E[8],  T_ME, "now()-interval'7 hours'",    'Israel',       'Northern Israel',    35.300, 33.000, 'approximate', ['Unknown'],              'explosion',            'high',     'confirmed',   'osint',    false, 'Oil depot fire reported in Northern Israel',             'Large fire at oil storage depot in Northern Israel; cause under investigation by Israeli authorities.',           'Oil depot', 'fire',          68, 16, ['israel','fire','infrastructure']],
      [E[9],  T_ME, "now()-interval'8 hours'",    'Syria',        'Damascus Airport',   36.514, 33.411, 'exact',       ['IDF'],                  'airstrike',            'medium',   'likely',      'news',     false, 'Damascus Airport runway reportedly struck',              'Damascus International Airport runway reported hit; flight operations suspended pending damage assessment.',     'Airport runway', 'disabled', 70, 17, ['airport','damascus','runway']],
      [E[10], T_ME, "now()-interval'9 hours'",    'Iran',         'Bandar Abbas',       56.271, 27.183, 'approximate', ['IRGC Navy'],            'naval_activity',       'medium',   'confirmed',   'ship',     false, 'IRGC naval exercise near Bandar Abbas strait access',    'IRGC conducted naval exercise near Bandar Abbas involving fast-attack vessels and minelaying units.',             null, null,                        50, 10, ['iran','naval','bandarabbas']],
      [E[11], T_ME, "now()-interval'10 hours'",   'Lebanon',      'Beirut',             35.495, 33.888, 'exact',       ['Lebanese Government'], 'warning_alert',        'medium',   'confirmed',   'official', false, 'Lebanese PM issues security alert for Beirut capital',   'Lebanese Prime Minister issued security advisory for Beirut citing imminent threat intelligence.',                null, null,                        45,  8, ['lebanon','beirut','alert']],
      [E[12], T_ME, "now()-interval'12 hours'",   'Israel',       'Tel Aviv',           34.781, 32.085, 'exact',       ['IDF'],                  'military_movement',    'high',     'confirmed',   'news',     false, 'IDF armored brigade deploys to northern border',         'IDF armored brigade deployed to northern border; officials cite heightened defensive readiness posture.',        null, null,                        65, 14, ['idf','mobilization','north']],
      [E[13], T_ME, "now()-interval'14 hours'",   'Iran',         'Natanz',             51.730, 33.724, 'approximate', ['AEOI'],                 'official_statement',   'low',      'likely',      'news',     false, 'Iran reports technical progress at Natanz facility',     'Iranian atomic agency reported technical progress at Natanz enrichment facility; IAEA review requested.',        null, null,                        40,  7, ['iran','nuclear','natanz']],
      [E[14], T_ME, "now()-interval'16 hours'",   'Turkey',       'Ankara',             32.854, 39.919, 'exact',       ['Turkish MFA'],          'official_statement',   'low',      'confirmed',   'official', false, 'Turkey calls for de-escalation through diplomatic channels','Turkish Foreign Ministry called for de-escalation and offered to mediate between parties.',                     null, null,                        30,  4, ['turkey','diplomacy','deescalation']],
      [E[15], T_ME, "now()-interval'18 hours'",   'Iraq',         'Baghdad',            44.361, 33.341, 'approximate', ['PMF'],                  'military_movement',    'medium',   'likely',      'news',     false, 'Pro-Iran militia units mobilize near Baghdad',            'Pro-Iran Shia militia units reported mobilizing near Baghdad perimeter; not independently corroborated.',        null, null,                        55, 12, ['iraq','militia','mobilization']],
      [E[16], T_ME, "now()-interval'20 hours'",   'Israel',       'Gaza',               34.465, 31.510, 'approximate', ['IDF'],                  'airstrike',            'critical', 'confirmed',   'news',     false, 'IDF strikes weapons storage sites in northern Gaza',     'IDF conducted precision strikes on reported weapons storage sites in northern Gaza Strip.',                      'Weapons storage', 'bombed',  80, 22, ['idf','gaza','airstrike']],
      [E[17], T_ME, "now()-interval'22 hours'",   'Iran',         'Persian Gulf',       54.000, 27.000, 'approximate', ['IRGC Navy'],            'naval_activity',       'medium',   'confirmed',   'ship',     false, 'Iran detains commercial vessel in Persian Gulf waters',  'IRGC detained commercial vessel in international waters citing safety inspection protocol.',                     null, null,                        70, 16, ['iran','naval','seizure']],
      [E[18], T_ME, "now()-interval'24 hours'",   'United States','Bahrain, Fifth Fleet',50.587, 26.217, 'approximate', ['USN'],                 'military_movement',    'low',      'confirmed',   'official', false, 'USS Eisenhower repositions to Eastern Mediterranean',    'USS Eisenhower carrier strike group repositioned from Red Sea to Eastern Mediterranean on standing orders.',    null, null,                        60, 12, ['us','navy','carrier','repositioning']],
      [E[19], T_ME, "now()-interval'36 hours'",   'Iran',         'Isfahan',            51.677, 32.657, 'approximate', ['Unknown'],              'explosion',            'medium',   'unconfirmed', 'news',     true,  'Unconfirmed secondary explosion near Isfahan complex',   'Social media reports of secondary explosion near Isfahan site; not corroborated by any verified source.',       null, null,                        35,  8, ['iran','signal','unconfirmed']],

      // ── Eastern Europe (events 20–29) ────────────────────────────────────
      [E[20], T_EU, "now()-interval'2 hours'",    'Ukraine',      'Kyiv',               30.523, 50.450, 'exact',       ['Russian Armed Forces'], 'missile_launch',       'critical', 'confirmed',   'news',     false, 'Ballistic missile strike hits Kyiv energy infrastructure','Russian ballistic missile struck Kyiv energy infrastructure; widespread power outages reported.',                'Power grid', 'disabled',     88, 24, ['ukraine','kyiv','missile','infrastructure']],
      [E[21], T_EU, "now()-interval'4 hours'",    'Ukraine',      'Kharkiv',            36.230, 49.993, 'approximate', ['Russian Armed Forces'], 'drone_attack',         'high',     'confirmed',   'news',     false, 'Drone swarm attack on Kharkiv industrial district',      'Drone swarm attack on Kharkiv industrial zone; two manufacturing facilities reported on fire.',                 'Industrial facility', 'fire', 75, 19, ['ukraine','kharkiv','drone']],
      [E[22], T_EU, "now()-interval'6 hours'",    'Ukraine',      'Zaporizhzhia',       35.139, 47.839, 'approximate', ['IAEA'],                 'warning_alert',        'medium',   'confirmed',   'official', false, 'IAEA raises safety concern at Zaporizhzhia nuclear plant','IAEA issued elevated concern notice regarding Zaporizhzhia nuclear plant safety amid nearby shelling reports.',  'Nuclear plant', 'breach',    70, 15, ['ukraine','nuclear','zaporizhzhia','iaea']],
      [E[23], T_EU, "now()-interval'8 hours'",    'Russia',       'Belgorod',           36.587, 50.601, 'approximate', ['Russian Armed Forces'], 'military_movement',    'medium',   'likely',      'osint',    false, 'Russian armored units regroup near Belgorod border',     'Satellite imagery indicates Russian armored unit repositioning near Belgorod oblast border region.',            null, null,                        58, 12, ['russia','belgorod','mobilization']],
      [E[24], T_EU, "now()-interval'10 hours'",   'Ukraine',      'Odesa',              30.724, 46.482, 'approximate', ['Russian Armed Forces'], 'missile_launch',       'high',     'confirmed',   'news',     false, 'Russian missile strike hits Odesa port grain storage',   'Cruise missile struck Odesa port grain storage facility; export operations suspended until assessment.',        'Port infrastructure', 'bombed',72, 17, ['ukraine','odesa','port','infrastructure']],
      [E[25], T_EU, "now()-interval'12 hours'",   'Ukraine',      'Avdiivka',           37.750, 48.140, 'approximate', ['Ukrainian Armed Forces'],'military_movement',   'medium',   'confirmed',   'news',     false, 'Ukrainian forces advance near Avdiivka following preparation','Ukrainian forces reported advancing near Avdiivka following sustained artillery preparation phase.',               null, null,                        62, 13, ['ukraine','avdiivka','counteroffensive']],
      [E[26], T_EU, "now()-interval'14 hours'",   'Poland',       'Warsaw',             21.012, 52.229, 'exact',       ['NATO'],                 'official_statement',   'low',      'confirmed',   'official', false, 'NATO activates additional eastern flank air defense',    'NATO Secretary General confirmed activation of additional air defense assets across eastern member states.',    null, null,                        45,  7, ['nato','poland','airdefense']],
      [E[27], T_EU, "now()-interval'16 hours'",   'Ukraine',      'Mykolaiv',           31.994, 46.975, 'approximate', ['Russian Armed Forces'], 'airstrike',            'high',     'confirmed',   'news',     false, 'Airstrike targets Mykolaiv shipyard facility',           'Russian airstrike targeted Mykolaiv shipyard; structural damage reported; no immediate casualty count.',        'Shipyard', 'bombed',          72, 18, ['ukraine','mykolaiv','shipyard']],
      [E[28], T_EU, "now()-interval'20 hours'",   'Moldova',      'Transnistria',       29.605, 47.163, 'approximate', ['Unknown'],              'military_movement',    'medium',   'unconfirmed', 'news',     true,  'Reports of troop movement in Transnistria region',       'Unverified reports of military movement in breakaway Transnistria region; Moldovan government monitoring.',     null, null,                        40,  9, ['moldova','transnistria','signal']],
      [E[29], T_EU, "now()-interval'24 hours'",   'Ukraine',      'Dnipro',             35.046, 48.464, 'approximate', ['Russian Armed Forces'], 'missile_launch',       'high',     'confirmed',   'news',     false, 'Missile strike on Dnipro rail logistics hub',            'Russian missile strike on Dnipro rail logistics hub; rail services suspended on eastern routes.',               'Rail hub', 'disabled',        76, 20, ['ukraine','dnipro','rail','infrastructure']],
    ];

    for (const ev of events) {
      const [eid, tid, tsExpr, country, loc, lon, lat, prec,
             actors, etype, sev, conf, evid, sig,
             headline, sum20, dasset, dtype, iscore, epoints, tags] = ev;

      await client.query(`
        INSERT INTO events (
          event_id, theater_id, timestamp_utc,
          country_primary, location_name, geom, location_precision,
          actors_involved, event_type, severity, confidence,
          evidence_type, is_signal, headline, summary_20w,
          damage_asset, damage_type, importance_score, escalation_points, tags
        )
        VALUES (
          $1, $2, ${tsExpr},
          $3, $4,
          ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
          $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (event_id) DO NOTHING
      `, [
        eid, tid,
        country, loc, lon, lat, prec,
        actors, etype, sev, conf, evid, sig,
        headline, sum20, dasset, dtype, iscore, epoints, tags,
      ]);
    }
    console.log(`✓ events (${events.length})`);

    // ── 3. EVENT SOURCES (20) ──────────────────────────────────────────────
    // Columns: event_id, publisher, url, published_time_expr, source_type, reliability_tier
    type SourceRow = [string, string, string, string, string, string];
    const sources: SourceRow[] = [
      [E[0],  'Reuters',           'https://reuters.com/world/middle-east/isfahan-explosion',  "now()-interval'35 minutes'",  'news',     'tier1'],
      [E[0],  'BBC World',         'https://bbc.com/news/world-middle-east/isfahan',           "now()-interval'32 minutes'",  'news',     'tier1'],
      [E[1],  'AP News',           'https://apnews.com/article/haifa-rockets-iron-dome',       "now()-interval'58 minutes'",  'news',     'tier1'],
      [E[1],  'BBC World',         'https://bbc.com/news/world-middle-east/haifa-rockets',     "now()-interval'54 minutes'",  'news',     'tier1'],
      [E[2],  'US Navy NAVCENT',   'https://navcent.navy.mil/press/hormuz-incident',           "now()-interval'95 minutes'",  'official', 'tier1'],
      [E[2],  'Reuters',           'https://reuters.com/world/hormuz-skirmish',                "now()-interval'92 minutes'",  'news',     'tier1'],
      [E[3],  'Syrian Observatory','https://syriahr.com/en/aleppo-drone-2024',                 "now()-interval'125 minutes'", 'osint',    'tier2'],
      [E[4],  'Al Jazeera',        'https://aljazeera.com/news/idf-strike-damascus',           "now()-interval'185 minutes'", 'news',     'tier1'],
      [E[4],  'AP News',           'https://apnews.com/article/idf-damascus-strike',           "now()-interval'180 minutes'", 'news',     'tier1'],
      [E[5],  'IRNA',              'https://irna.ir/news/irgc-statement-response',             "now()-interval'245 minutes'", 'official', 'tier2'],
      [E[6],  'Reuters',           'https://reuters.com/world/middle-east/kuwait-embassy',     "now()-interval'310 minutes'", 'news',     'tier1'],
      [E[7],  'Al Jazeera',        'https://aljazeera.com/news/damascus-military-base',        "now()-interval'370 minutes'", 'news',     'tier1'],
      [E[8],  'Haaretz',           'https://haaretz.com/israel-news/oil-depot-fire',           "now()-interval'425 minutes'", 'news',     'tier2'],
      [E[9],  'AFP',               'https://afp.com/en/node/damascus-airport-strike',          "now()-interval'490 minutes'", 'news',     'tier1'],
      [E[12], 'Haaretz',           'https://haaretz.com/israel-news/idf-north-deployment',    "now()-interval'730 minutes'", 'news',     'tier2'],
      [E[16], 'Al Jazeera',        'https://aljazeera.com/news/idf-gaza-strikes',              "now()-interval'1205 minutes'",'news',     'tier1'],
      [E[20], 'Reuters',           'https://reuters.com/world/europe/kyiv-missile-strike',     "now()-interval'125 minutes'", 'news',     'tier1'],
      [E[20], 'BBC World',         'https://bbc.com/news/world-europe/kyiv-attack',            "now()-interval'122 minutes'", 'news',     'tier1'],
      [E[21], 'Ukrinform',         'https://ukrinform.ua/rubric-ato/kharkiv-drone-attack',     "now()-interval'245 minutes'", 'news',     'tier2'],
      [E[22], 'IAEA',              'https://iaea.org/newscenter/zaporizhzhia-concern',         "now()-interval'365 minutes'", 'official', 'tier1'],
    ];

    for (const [eid, pub, url, tsExpr, stype, tier] of sources) {
      await client.query(`
        INSERT INTO event_sources (event_id, publisher, url, published_time, source_type, reliability_tier)
        VALUES ($1, $2, $3, ${tsExpr}, $4, $5)
        ON CONFLICT DO NOTHING
      `, [eid, pub, url, stype, tier]);
    }
    console.log(`✓ event_sources (${sources.length})`);

    // ── 4. CASUALTY REPORTS (10) ──────────────────────────────────────────
    // period_start_expr, period_end_expr, country, killed, injured,
    // civ_killed, civ_injured, mil_killed, mil_injured, conf, sources_json
    type CasRow = [
      string, string, string, // theater_id, period_start_expr, period_end_expr
      string,                  // country
      number | null, number | null, // killed, injured
      number | null, number | null, // civilian_killed, civilian_injured
      number | null, number | null, // military_killed, military_injured
      string,                  // confidence
      string,                  // sources JSONB
    ];

    const casualties: CasRow[] = [
      // ME — last 24h per country
      [T_ME, "now()-interval'24 hours'", 'now()', 'Israel',
        12, 43, 4, 18, 8, 25, 'confirmed',
        '[{"publisher":"Reuters","url":"https://reuters.com/israel-casualties"},{"publisher":"AP","url":"https://apnews.com/israel-cas"}]'],

      [T_ME, "now()-interval'24 hours'", 'now()', 'Iran',
        28, 81, 12, 35, 16, 46, 'confirmed',
        '[{"publisher":"Reuters","url":"https://reuters.com/iran-casualties"},{"publisher":"Al Jazeera","url":"https://aljazeera.com/iran-cas"}]'],

      [T_ME, "now()-interval'24 hours'", 'now()', 'Lebanon',
        6, 15, 3, 8, 3, 7, 'likely',
        '[{"publisher":"AFP","url":"https://afp.com/lebanon-casualties"}]'],

      [T_ME, "now()-interval'24 hours'", 'now()', 'Syria',
        4, 11, 2, 5, 2, 6, 'likely',
        '[{"publisher":"Syrian Observatory","url":"https://syriahr.com/casualties"}]'],

      // ME — last 72h cumulative
      [T_ME, "now()-interval'72 hours'", 'now()', 'Israel',
        31, 98, 10, 42, 21, 56, 'confirmed',
        '[{"publisher":"Reuters","url":"https://reuters.com/israel-72h"},{"publisher":"AP","url":"https://apnews.com/israel-72h"}]'],

      [T_ME, "now()-interval'72 hours'", 'now()', 'Iran',
        54, 162, 20, 67, 34, 95, 'confirmed',
        '[{"publisher":"Reuters","url":"https://reuters.com/iran-72h"}]'],

      [T_ME, "now()-interval'168 hours'", 'now()', 'Lebanon',
        18, 44, 9, 22, 9, 22, 'likely',
        '[{"publisher":"AFP","url":"https://afp.com/lebanon-7d"}]'],

      // EU — last 24h
      [T_EU, "now()-interval'24 hours'", 'now()', 'Ukraine',
        22, 67, 14, 38, 8, 29, 'confirmed',
        '[{"publisher":"Reuters","url":"https://reuters.com/ukraine-casualties"},{"publisher":"BBC","url":"https://bbc.com/ukraine-cas"}]'],

      [T_EU, "now()-interval'72 hours'", 'now()', 'Ukraine',
        61, 184, 38, 102, 23, 82, 'confirmed',
        '[{"publisher":"Reuters","url":"https://reuters.com/ukraine-72h"},{"publisher":"AP","url":"https://apnews.com/ukraine-72h"}]'],

      [T_EU, "now()-interval'168 hours'", 'now()', 'Russia',
        18, 52, 0, 0, 18, 52, 'likely',
        '[{"publisher":"Reuters","url":"https://reuters.com/russia-casualties"}]'],
    ];

    for (const [tid, ps, pe, country,
      killed, injured, ck, ci, mk, mi, conf, srcs] of casualties) {
      await client.query(`
        INSERT INTO casualty_reports (
          theater_id, period_start, period_end, country,
          killed, injured, civilian_killed, civilian_injured,
          military_killed, military_injured, confidence, sources
        )
        VALUES ($1, ${ps}, ${pe}, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (theater_id, period_start, period_end, country) DO NOTHING
      `, [tid, country, killed, injured, ck, ci, mk, mi, conf, srcs]);
    }
    console.log(`✓ casualty_reports (${casualties.length})`);

    await client.query('COMMIT');
    console.log('\n✅  Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
