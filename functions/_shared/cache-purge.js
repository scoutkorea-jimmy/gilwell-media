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
  const zoneId = String(env && env.CF_ZONE_ID || '').trim();
  const apiToken = String(env && env.CF_PURGE_API_TOKEN || '').trim();
  if (!zoneId || !apiToken) {
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
