import { queryRust } from '../_shared/rust-server.js';
import { SCOUT_TOPICS } from '../topics/[slug].js';

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
    ...SCOUT_TOPICS.map(topic => ({ path: `/topics/${topic.slug}`, priority: '0.8', category: null })),
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

  try {
    const rendered = await queryRust({ request, env }, 'sitemap', { origin, pages: staticPages });
    if (rendered.ok) {
      const xml = await rendered.text();
      return new Response(headOnly ? null : xml, { headers: { 'Content-Type': 'application/xml; charset=UTF-8', 'Cache-Control': 'public, max-age=3600' } });
    }
  } catch (error) {
    console.error('GET /sitemap.xml Rust render error:', error);
  }

  return new Response(headOnly ? null : 'Sitemap temporarily unavailable', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store', 'Retry-After': '300' },
  });
}
