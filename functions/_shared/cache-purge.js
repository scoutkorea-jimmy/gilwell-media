const DEFAULT_CONTENT_URLS = [
  '/',
  '/latest',
  '/korea',
  '/apr',
  '/wosm',
  '/people',
  '/glossary',
  '/wosm-members',
  '/rss.xml',
  '/sitemap.xml',
  '/api/home',
  '/api/stats',
  '/api/settings/hero',
  '/api/settings/home-lead',
  '/api/posts?page=1',
  '/api/posts?page=1&limit=16',
  '/api/posts/popular',
];

export function buildContentPurgeUrls(origin, options = {}) {
  const safeOrigin = String(origin || '').replace(/\/+$/, '');
  if (!safeOrigin) return [];
  const postId = Number(options.postId || 0);
  const postIds = Array.isArray(options.postIds) ? options.postIds : [];
  const categories = Array.isArray(options.categories) ? options.categories : [];
  const urls = new Set(DEFAULT_CONTENT_URLS.map((path) => safeOrigin + path));
  categories
    .map((value) => normalizeCategoryPath(value))
    .filter(Boolean)
    .forEach((category) => {
      urls.add(`${safeOrigin}/${category}`);
      urls.add(`${safeOrigin}/api/posts?page=1&category=${category}`);
      urls.add(`${safeOrigin}/api/posts?page=1&limit=16&category=${category}`);
    });
  const allPostIds = postIds.concat(postId > 0 ? [postId] : []);
  allPostIds
    .map((value) => Number(value || 0))
    .filter((value, index, arr) => value > 0 && arr.indexOf(value) === index)
    .forEach((value) => {
      urls.add(`${safeOrigin}/post/${value}`);
      urls.add(`${safeOrigin}/api/posts/${value}`);
    });
  return Array.from(urls);
}

export async function purgeContentCache(env, origin, options = {}) {
  // `CF_ZONE_ID` / `CF_PURGE_API_TOKEN`이 우선, 없으면 범용 Cloudflare 바인딩
  // (`CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN`)로 폴백. 사용자가 cache-purge
  // 전용 시크릿을 별도로 등록하지 않았더라도 이미 배포된 범용 API 토큰 +
  // 계정에 설정된 zone ID만 있으면 퍼지가 돌아가도록.
  const zoneId = String((env && (env.CF_ZONE_ID || env.CLOUDFLARE_ZONE_ID)) || '').trim();
  const apiToken = String((env && (env.CF_PURGE_API_TOKEN || env.CLOUDFLARE_API_TOKEN)) || '').trim();
  if (!zoneId || !apiToken) {
    // 관리자가 기사를 수정했는데 공개 페이지가 stale로 남는 회귀가 조용히
    // 스킵되지 않도록, 토큰 부재 시에도 log는 남겨서 진단 가능하게.
    if (!env || !env.__PURGE_WARNED__) {
      try { console.warn('[cache-purge] skipped — missing zone_id or api_token (CF_ZONE_ID / CLOUDFLARE_ZONE_ID and CF_PURGE_API_TOKEN / CLOUDFLARE_API_TOKEN)'); } catch (_) {}
      if (env) env.__PURGE_WARNED__ = true;
    }
    return { skipped: true, reason: 'missing-credentials' };
  }
  const files = buildContentPurgeUrls(origin, options);
  if (!files.length) return { skipped: true, reason: 'missing-files' };
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ files }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const message = data && Array.isArray(data.errors) && data.errors.length
      ? String(data.errors[0].message || 'cache purge failed')
      : `cache purge failed (${response.status})`;
    throw new Error(message);
  }
  return { success: true, files };
}

function normalizeCategoryPath(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'worm') return 'wosm';
  return normalized;
}
