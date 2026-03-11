// workers/feeds.ts
// RSS/Atom feed sources for each theater. Fetched every 5 minutes by the ingestion worker.
//
// Fetch optimisation:
//   - Sends If-None-Match / If-Modified-Since headers when cached values exist
//   - Records ETag + Last-Modified on every successful fetch in feed_fetch_log
//   - Skips feeds fetched within MIN_FETCH_INTERVAL_S (default 240 s / 4 min)
//     so that a back-to-back ingest run (e.g. retry after crash) doesn't burn
//     LLM budget re-processing content that hasn't changed
//   - Increments error_count on consecutive fetch failures; resets on success

import { sql } from '../lib/db/pool';
import { log } from '../lib/logger';

export interface FeedConfig {
  name:       string;       // display name
  url:        string;       // RSS/Atom URL
  theater:    string;       // theater slug
  publisher:  string;       // publisher name (matched against tier registry)
}

export const FEEDS: FeedConfig[] = [
  // ── Middle East feeds ─────────────────────────────────────────────────────
  { name: 'Reuters World',       publisher: 'Reuters',          theater: 'me-iran-israel-us', url: 'https://feeds.reuters.com/Reuters/worldNews' },
  { name: 'BBC Middle East',     publisher: 'BBC',              theater: 'me-iran-israel-us', url: 'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml' },
  { name: 'Al Jazeera English',  publisher: 'Al Jazeera',       theater: 'me-iran-israel-us', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'Times of Israel',     publisher: 'Times of Israel',  theater: 'me-iran-israel-us', url: 'https://www.timesofisrael.com/feed/' },
  { name: 'Haaretz',             publisher: 'Haaretz',          theater: 'me-iran-israel-us', url: 'https://www.haaretz.com/cmlink/1.628765' },
  { name: 'AP News World',       publisher: 'AP',               theater: 'me-iran-israel-us', url: 'https://rsshub.app/apnews/topics/world-news' },
  { name: 'Middle East Eye',     publisher: 'Middle East Eye',  theater: 'me-iran-israel-us', url: 'https://www.middleeasteye.net/rss' },
  { name: 'The National (UAE)',  publisher: 'The National',     theater: 'me-iran-israel-us', url: 'https://www.thenationalnews.com/rss' },

  // ── Eastern Europe feeds ──────────────────────────────────────────────────
  { name: 'Reuters Europe',      publisher: 'Reuters',          theater: 'eu-ukraine-russia', url: 'https://feeds.reuters.com/Reuters/domesticNews' },
  { name: 'BBC Ukraine',         publisher: 'BBC',              theater: 'eu-ukraine-russia', url: 'http://feeds.bbci.co.uk/news/world/europe/rss.xml' },
  { name: 'Ukrinform',           publisher: 'Ukrinform',        theater: 'eu-ukraine-russia', url: 'https://www.ukrinform.ua/rss/block-lastnews' },
  { name: 'Kyiv Independent',    publisher: 'Kyiv Independent', theater: 'eu-ukraine-russia', url: 'https://kyivindependent.com/rss' },
];

export interface FeedItem {
  title:         string;
  url:           string;
  publishedTime: string | null;
  content:       string;
  contentHash:   string;
  feedName:      string;
  feedUrl:       string;
  publisher:     string;
  theater:       string;
}

// Skip re-fetching a feed that was successfully fetched within this window.
// Slightly less than the 5-minute cron interval to allow for clock skew.
const MIN_FETCH_INTERVAL_S = parseInt(process.env.MIN_FEED_FETCH_INTERVAL_S ?? '240', 10);

/** Fetch and parse all items from a single RSS feed. Returns up to maxItems items. */
export async function fetchFeedItems(feed: FeedConfig, maxItems = 30): Promise<FeedItem[]> {
  const { createHash } = await import('crypto');

  // ── Check feed_fetch_log for recent successful fetch ──────────────────────
  let cachedEtag: string | null        = null;
  let cachedLastModified: string | null = null;

  try {
    const cached = await sql<{
      last_fetched: string;
      etag:         string | null;
      last_modified: string | null;
    }>(`
      SELECT last_fetched, etag, last_modified
      FROM feed_fetch_log
      WHERE feed_url = $1
      LIMIT 1
    `, [feed.url]);

    if (cached.length > 0) {
      const ageSeconds = (Date.now() - new Date(cached[0].last_fetched).getTime()) / 1000;
      if (ageSeconds < MIN_FETCH_INTERVAL_S) {
        log.info('feeds', 'Skipping recently fetched feed', {
          feed: feed.name, age_s: Math.round(ageSeconds), min_s: MIN_FETCH_INTERVAL_S,
        });
        return [];
      }
      cachedEtag         = cached[0].etag;
      cachedLastModified = cached[0].last_modified;
    }
  } catch {
    // If feed_fetch_log doesn't exist yet (pre-migration), continue without cache
  }

  // ── Fetch with conditional GET headers ────────────────────────────────────
  const headers: Record<string, string> = {
    'User-Agent': 'GCM-Ingestion/1.0 (conflict intelligence monitor)',
  };
  if (cachedEtag)         headers['If-None-Match']     = cachedEtag;
  if (cachedLastModified) headers['If-Modified-Since'] = cachedLastModified;

  let xmlText: string;
  let newEtag: string | null = null;
  let newLastModified: string | null = null;

  try {
    const res = await fetch(feed.url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });

    // 304 Not Modified — nothing new since last fetch
    if (res.status === 304) {
      log.info('feeds', 'Feed not modified (304)', { feed: feed.name });
      await updateFeedLog(feed.url, null, null, 0).catch(() => {});
      return [];
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    newEtag         = res.headers.get('etag');
    newLastModified = res.headers.get('last-modified');
    xmlText = await res.text();

    // Record successful fetch
    await updateFeedLog(feed.url, newEtag, newLastModified, 0).catch(() => {});
  } catch (err) {
    log.warn('feeds', 'Failed to fetch feed', { feed: feed.name, url: feed.url, error: String(err) });
    // Increment error count
    await sql(`
      INSERT INTO feed_fetch_log (feed_url, last_fetched, error_count, last_error)
      VALUES ($1, now(), 1, $2)
      ON CONFLICT (feed_url) DO UPDATE
        SET error_count = feed_fetch_log.error_count + 1,
            last_error  = $2,
            last_fetched = now()
    `, [feed.url, String(err)]).catch(() => {});
    return [];
  }

  const items = parseRss(xmlText, feed, maxItems, createHash);

  // Update item count in log
  await sql(`
    UPDATE feed_fetch_log SET item_count = $2 WHERE feed_url = $1
  `, [feed.url, items.length]).catch(() => {});

  return items;
}

async function updateFeedLog(
  feedUrl:      string,
  etag:         string | null,
  lastModified: string | null,
  errorCount:   number,
): Promise<void> {
  await sql(`
    INSERT INTO feed_fetch_log (feed_url, last_fetched, etag, last_modified, error_count)
    VALUES ($1, now(), $2, $3, $4)
    ON CONFLICT (feed_url) DO UPDATE
      SET last_fetched  = now(),
          etag          = COALESCE($2, feed_fetch_log.etag),
          last_modified = COALESCE($3, feed_fetch_log.last_modified),
          error_count   = $4,
          last_error    = NULL
  `, [feedUrl, etag, lastModified, errorCount]);
}

// ── RSS/Atom parser ───────────────────────────────────────────────────────────

function parseRss(
  xml:        string,
  feed:       FeedConfig,
  maxItems:   number,
  createHash: (alg: string) => any,
): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRx    = /<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi;
  const tagRx     = (tag: string) => new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const cdataRx   = /<!--\[CDATA\[([\s\S]*?)\]\]-->/i;
  const cdataRx2  = /<!\[CDATA\[([\s\S]*?)\]\]>/i;
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);

  const extractTag = (chunk: string, tag: string): string => {
    const m = tagRx(tag).exec(chunk);
    if (!m) return '';
    const cd = cdataRx.exec(m[1]) ?? cdataRx2.exec(m[1]);
    return cd ? cd[1].trim() : m[1].trim();
  };

  let match: RegExpExecArray | null;
  while ((match = itemRx.exec(xml)) !== null && items.length < maxItems) {
    const chunk   = match[0];
    const title   = stripHtml(extractTag(chunk, 'title'));
    const link    = extractTag(chunk, 'link') || extractTag(chunk, 'id') || '';
    const pubDate = extractTag(chunk, 'pubDate') || extractTag(chunk, 'published') || extractTag(chunk, 'updated');
    const desc    = stripHtml(extractTag(chunk, 'description') || extractTag(chunk, 'content') || extractTag(chunk, 'summary'));
    if (!title && !desc) continue;

    const content     = `${title} ${desc}`.slice(0, 3000);
    const contentHash = createHash('sha256').update(link + content).digest('hex');
    let publishedTime: string | null = null;
    try { publishedTime = pubDate ? new Date(pubDate).toISOString() : null; } catch {}

    items.push({
      title, url: link, publishedTime, content, contentHash,
      feedName: feed.name, feedUrl: feed.url,
      publisher: feed.publisher, theater: feed.theater,
    });
  }
  return items;
}
