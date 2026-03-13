export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const staticPages = [
    { path: '/', priority: '1.0' },
    { path: '/korea.html', priority: '0.9' },
    { path: '/apr.html', priority: '0.9' },
    { path: '/worm.html', priority: '0.9' },
    { path: '/people.html', priority: '0.9' },
    { path: '/contributors.html', priority: '0.5' },
  ];

  let posts = [];
  try {
    const result = await env.DB.prepare(
      `SELECT id, updated_at
         FROM posts
        WHERE published = 1
        ORDER BY created_at DESC`
    ).all();
    posts = result.results || [];
  } catch (err) {
    console.error('GET /sitemap.xml error:', err);
  }

  const urls = staticPages.map((page) => {
    return xmlUrl(`${origin}${page.path}`, null, page.priority);
  }).concat(posts.map((post) => {
    return xmlUrl(`${origin}/post/${post.id}`, post.updated_at, '0.8');
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function xmlUrl(loc, lastmod, priority) {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${escapeXml(new Date(lastmod).toISOString())}</lastmod>` : ''}
    <priority>${priority}</priority>
  </url>`;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
