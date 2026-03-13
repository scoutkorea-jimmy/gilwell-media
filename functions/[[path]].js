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
  const shareMeta = buildShareMetaBlock({
    title: pageMeta.title,
    description: pageMeta.description,
    url: url.origin + (url.pathname === '/' ? '/' : url.pathname),
    imageUrl: getResolvedShareImage(siteMeta, url.origin),
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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
