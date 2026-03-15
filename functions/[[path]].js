import { buildShareMetaBlock, getResolvedShareImage, getSitePageKey, loadSiteMeta } from './_shared/site-meta.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pageKey = getSitePageKey(url.pathname);

  const response = await context.next();
  if (!pageKey) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const siteMeta = await loadSiteMeta(env);
  const pageMeta = siteMeta.pages[pageKey] || siteMeta.pages.home;
  const canonicalPath = getCanonicalPath(url.pathname, pageKey);
  const itemListElements = await loadPageItemList(env, url.origin, pageKey);
  const shareMeta = buildShareMetaBlock({
    pageKey,
    title: pageMeta.title,
    description: pageMeta.description,
    url: url.origin + canonicalPath,
    imageUrl: getResolvedShareImage(siteMeta, url.origin),
    googleVerification: siteMeta.google_verification,
    naverVerification: siteMeta.naver_verification,
    itemListElements,
  });

  const updated = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageMeta.title)}</title>`)
    .replace('<!-- SHARE_META -->', shareMeta);

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  return new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getCanonicalPath(pathname, pageKey) {
  if (pathname === '/index.html' || pathname === '/') return '/';
  if (pageKey === 'latest') return '/latest';
  if (pageKey === 'korea') return '/korea';
  if (pageKey === 'apr') return '/apr';
  if (pageKey === 'wosm') return '/wosm';
  if (pageKey === 'people') return '/people';
  if (pageKey === 'glossary') return '/glossary';
  return pathname;
}

async function loadPageItemList(env, origin, pageKey) {
  if (!['home', 'latest', 'korea', 'apr', 'wosm', 'people', 'glossary'].includes(pageKey)) return [];
  try {
    const category = pageKey === 'home' || pageKey === 'latest' ? null : pageKey;
    const query = category
      ? `SELECT id, title FROM posts WHERE published = 1 AND category = ? ORDER BY created_at DESC LIMIT 10`
      : pageKey === 'latest'
        ? `SELECT id, title FROM posts WHERE published = 1 AND datetime(created_at) >= datetime('now', '-30 days') ORDER BY created_at DESC LIMIT 10`
        : `SELECT id, title FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 10`;
    const result = category
      ? await env.DB.prepare(query).bind(category).all()
      : await env.DB.prepare(query).all();
    return (result.results || []).map((item) => ({
      url: `${origin}/post/${item.id}`,
      title: item.title || `post-${item.id}`,
    }));
  } catch {
    return [];
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
