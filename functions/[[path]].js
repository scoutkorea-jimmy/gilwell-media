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
  const [translationStrings, publicRuntime] = await Promise.all([
    loadTranslationStrings(env),
    loadPublicRuntime(env),
  ]);
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
  const baseResponse = new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return applyTranslationBootstrap(baseResponse, translationStrings, publicRuntime);
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
      ? `SELECT id, title FROM posts WHERE published = 1 AND category = ? ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10`
      : pageKey === 'latest'
        ? `SELECT id, title FROM posts WHERE published = 1 AND datetime(COALESCE(publish_at, created_at)) >= datetime('now', '-30 days') ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10`
        : `SELECT id, title FROM posts WHERE published = 1 ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10`;
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

async function loadTranslationStrings(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'translations'`).first();
    const parsed = row ? JSON.parse(row.value || '{}') : {};
    return parsed && typeof parsed === 'object' ? (parsed.strings || {}) : {};
  } catch {
    return {};
  }
}

function applyTranslationBootstrap(response, strings, runtime) {
  const safeStrings = strings && typeof strings === 'object' ? strings : {};
  const safeRuntime = runtime && typeof runtime === 'object' ? runtime : {};
  const bootstrap = `<script>window.GW_BOOT_CUSTOM_STRINGS=${serializeForInlineScript(safeStrings)};window.GW_BOOT_RUNTIME=${serializeForInlineScript(safeRuntime)};window.GW_KAKAO_JS_KEY=${serializeForInlineScript(String(safeRuntime.kakao_js_key || ''))};</script>`;
  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(bootstrap, { html: true });
      }
    })
    .on('[data-i18n]', {
      element(element) {
        const key = element.getAttribute('data-i18n');
        if (!key) return;
        const entry = safeStrings[key];
        if (!entry || typeof entry.ko === 'undefined') return;
        element.setInnerContent(String(entry.ko), {
          html: false,
        });
      }
    })
    .transform(response);
}

async function loadPublicRuntime(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'public_runtime'`).first();
    const parsed = row ? JSON.parse(row.value || '{}') : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
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

function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
