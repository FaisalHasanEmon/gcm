// app/sitemap.xml/route.ts
// Serves /sitemap.xml for the public-facing pages.

import { sql } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 h

export async function GET(): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gcm.example.com';
  const now  = new Date().toISOString().split('T')[0];

  // Fetch active theater slugs for per-theater page URLs
  let slugs: string[] = [];
  try {
    const rows = await sql<{ slug: string }>(
      `SELECT slug FROM theaters WHERE is_active = true ORDER BY slug`,
      []
    );
    slugs = rows.map(r => r.slug);
  } catch {
    // Non-fatal — return sitemap with static pages only
  }

  const staticPages = ['/', '/breaking', '/escalation', '/map', '/casualties', '/timeline', '/subscribe'];
  const theaterUrls = slugs.flatMap(slug =>
    staticPages.map(p => `${base}${p}?theater=${slug}`)
  );
  const allUrls = [
    ...staticPages.map(p => `${base}${p}`),
    ...theaterUrls,
  ];

  const urlEntries = allUrls
    .map(url => `  <url><loc>${url}</loc><lastmod>${now}</lastmod></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
