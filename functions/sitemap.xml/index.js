export async function onRequestGet(context) {
  return buildSitemapResponse(context, false);
}

export async function onRequestHead(context) {
  return buildSitemapResponse(context, true);
}

async function buildSitemapResponse({ request, env }, headOnly) {
  const origin = new URL(request.url).origin;
  const staticPages = [
    { path: '/', priority: '1.0', category: null },
    { path: '/latest', priority: '0.9', category: null },
    { path: '/korea', priority: '0.9', category: 'korea' },
    { path: '/apr', priority: '0.9', category: 'apr' },
    { path: '/wosm', priority: '0.9', category: 'wosm' },
    { path: '/people', priority: '0.9', category: 'people' },
    { path: '/glossary', priority: '0.9', category: 'glossary' },
    { path: '/ai-guide.html', priority: '0.4', category: null },
    { path: '/contributors.html', priority: '0.5', category: null },
  ];

  let posts = [];
  let staticLastmods = {};
  try {
    const [postResult, lastmodResult] = await Promise.all([
      env.DB.prepare(
        `SELECT id, updated_at
           FROM posts
          WHERE published = 1
          ORDER BY created_at DESC`
      ).all(),
      env.DB.prepare(
        `SELECT category, MAX(updated_at) AS updated_at
           FROM posts
          WHERE published = 1
          GROUP BY category`
      ).all(),
    ]);
    posts = postResult.results || [];
    (lastmodResult.results || []).forEach((row) => {
      if (row.category) staticLastmods[row.category] = row.updated_at || null;
    });
    staticLastmods.home = posts.length ? (posts[0].updated_at || null) : null;
  } catch (err) {
    console.error('GET /sitemap.xml error:', err);
  }

  const urls = staticPages.map((page) => {
    const lastmod = page.category ? staticLastmods[page.category] : staticLastmods.home;
    return xmlUrl(`${origin}${page.path}`, lastmod, page.priority);
  }).concat(posts.map((post) => {
    return xmlUrl(`${origin}/post/${post.id}`, post.updated_at, '0.8');
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(headOnly ? null : xml, {
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
