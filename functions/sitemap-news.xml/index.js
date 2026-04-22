/**
 * Gilwell Media · /sitemap-news.xml
 *
 * Google News-compatible sitemap scoped to the most recent 48 hours of
 * published articles (hard cap 1000 entries). Separate from the general
 * /sitemap.xml because Google News + AI news retrieval systems only
 * ingest URLs from a sitemap that uses the news:news schema.
 */

export async function onRequestGet(context) {
  return buildNewsSitemapResponse(context, false);
}

export async function onRequestHead(context) {
  return buildNewsSitemapResponse(context, true);
}

async function buildNewsSitemapResponse({ request, env }, headOnly) {
  const origin = new URL(request.url).origin;
  const { ensureDuePostsPublished } = await import('../_shared/publish-due-posts.js');
  await ensureDuePostsPublished(env, origin).catch((err) => {
    console.error('GET /sitemap-news.xml auto publish error:', err);
  });

  let posts = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT id, title, category, publish_at, created_at, updated_at
         FROM posts
         WHERE published = 1
           AND COALESCE(publish_at, created_at) <= datetime('now')
           AND COALESCE(publish_at, created_at) >= datetime('now', '-2 days')
         ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC
         LIMIT 1000`
    ).all();
    posts = rs.results || [];
  } catch (err) {
    console.error('GET /sitemap-news.xml query error:', err);
  }

  const body = renderNewsSitemap(origin, posts);

  const headers = {
    'Content-Type': 'application/xml; charset=UTF-8',
    // Keep fresh — news sitemaps are only useful if indexed promptly.
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  };

  if (headOnly) {
    return new Response(null, { headers });
  }
  return new Response(body, { headers });
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIso(dateStr) {
  if (!dateStr) return '';
  const normalized = String(dateStr).replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function categoryLabel(cat) {
  // Google News genre suggestion. Not strictly required but helps the
  // news index classify content.
  const slug = String(cat || '').toLowerCase();
  if (slug === 'korea')  return 'Korea Scouts';
  if (slug === 'apr')    return 'Asia-Pacific Scouts';
  if (slug === 'wosm')   return 'World Organization of the Scout Movement';
  if (slug === 'people') return 'Scout People';
  return 'Scouting News';
}

function renderNewsSitemap(origin, posts) {
  const rows = posts.map((p) => {
    const loc = `${origin}/post/${p.id}`;
    const pubDate = toIso(p.publish_at || p.created_at);
    const title = xmlEscape(p.title || '');
    const section = xmlEscape(categoryLabel(p.category));
    return [
      '  <url>',
      `    <loc>${xmlEscape(loc)}</loc>`,
      '    <news:news>',
      '      <news:publication>',
      '        <news:name>BP미디어</news:name>',
      '        <news:language>ko</news:language>',
      '      </news:publication>',
      `      <news:publication_date>${xmlEscape(pubDate)}</news:publication_date>`,
      `      <news:title>${title}</news:title>`,
      section ? `      <news:genres>${section}</news:genres>` : '',
      '    </news:news>',
      '  </url>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${rows}
</urlset>
`;
}
