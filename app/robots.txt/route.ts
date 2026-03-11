// app/robots.txt/route.ts
// Serves /robots.txt — allows crawlers on public pages, blocks API/cron.

export const dynamic = 'force-static';

export function GET(): Response {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gcm.example.com'}/sitemap.xml`,
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
