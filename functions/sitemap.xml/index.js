export async function onRequestGet(context) {
  return buildSitemapResponse(context, false);
}

export async function onRequestHead(context) {
  return buildSitemapResponse(context, true);
}

async function buildSitemapResponse({ request, env }, headOnly) {
  const origin = new URL(request.url).origin;
  const { ensureDuePostsPublished } = await import('../_shared/publish-due-posts.js');
  await ensureDuePostsPublished(env, origin).catch((err) => {
    console.error('GET /sitemap.xml auto publish error:', err);
  });
  const staticPages = [
    { path: '/', priority: '1.0', category: null },
    { path: '/latest', priority: '0.9', category: null },
    { path: '/jamboree16', priority: '0.8', category: null },
    { path: '/korea', priority: '0.9', category: 'korea' },
    { path: '/apr', priority: '0.9', category: 'apr' },
    { path: '/wosm', priority: '0.9', category: 'wosm' },
    { path: '/wosm-members', priority: '0.8', category: null },
    { path: '/people', priority: '0.9', category: 'people' },
    { path: '/calendar', priority: '0.8', category: null },
    { path: '/glossary', priority: '0.9', category: 'glossary' },
    { path: '/glossary-raw', priority: '0.8', category: 'glossary' },
    // nav 1차 메뉴인데 사이트맵에서 빠져 있었다 (2026-08-26 점검).
    { path: '/memorabilia', priority: '0.8', category: null },
    { path: '/contributors', priority: '0.5', category: null },
    { path: '/editorial-policy', priority: '0.5', category: null },
    { path: '/about', priority: '0.5', category: null },
    { path: '/privacy', priority: '0.3', category: null },
  ];

  let posts = [];
  let staticLastmods = {};
  try {
    const [postResult, lastmodResult, glossaryLastmodResult] = await Promise.all([
      env.DB.prepare(
        `SELECT id, updated_at, publish_at, created_at
           FROM posts
          WHERE published = 1
          ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC`
      ).all(),
      env.DB.prepare(
        `SELECT category, MAX(updated_at) AS updated_at
           FROM posts
          WHERE published = 1
          GROUP BY category`
      ).all(),
      env.DB.prepare(
        `SELECT MAX(COALESCE(updated_at, created_at)) AS updated_at
           FROM glossary_terms`
      ).all(),
    ]);
    posts = postResult.results || [];
    (lastmodResult.results || []).forEach((row) => {
      if (row.category) staticLastmods[row.category] = row.updated_at || null;
    });
    staticLastmods.glossary = (glossaryLastmodResult.results && glossaryLastmodResult.results[0] && glossaryLastmodResult.results[0].updated_at) || null;
    staticLastmods.home = posts.length ? (posts[0].updated_at || posts[0].publish_at || posts[0].created_at || null) : null;
  } catch (err) {
    console.error('GET /sitemap.xml error:', err);
  }

  const urls = staticPages.map((page) => {
    const lastmod = page.category ? staticLastmods[page.category] : staticLastmods.home;
    return xmlUrl(`${origin}${page.path}`, lastmod, page.priority);
  }).concat(posts.map((post) => {
    return xmlUrl(`${origin}/post/${post.id}`, post.updated_at || post.publish_at || post.created_at, '0.8');
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
  const lastmodIso = toIsoOrEmpty(lastmod);
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmodIso ? `<lastmod>${escapeXml(lastmodIso)}</lastmod>` : ''}
    <priority>${priority}</priority>
  </url>`;
}

// `new Date(x).toISOString()` 은 파싱 실패 시 RangeError 를 던진다. 이 호출은
// try/catch 밖이라 DB 의 날짜 문자열 **하나만** 깨져도 사이트맵 전체가 500 이
// 되고, 그러면 407개 URL 이 통째로 색인에서 사라진다. 못 읽는 값은 조용히
// lastmod 만 빼고 나머지 URL 은 살린다 — 없어도 되는 필드다.
function toIsoOrEmpty(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
