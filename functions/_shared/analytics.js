import { getViewerKey } from './engagement.js';

const VISIT_WINDOW_MINUTES = 30;

export async function recordSiteVisit(request, env, payload) {
  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return { recorded: false };

  const path = sanitizePath(payload && payload.path);
  if (!path || path.startsWith('/api/') || path === '/admin.html') {
    return { recorded: false };
  }

  const referrer = sanitizeUrl(payload && payload.referrer);
  const referrerHost = deriveReferrerHost(referrer, request.url);

  const existing = await env.DB.prepare(
    `SELECT 1
       FROM site_visits
      WHERE viewer_key = ?
        AND path = ?
        AND visited_at > datetime('now', '-${VISIT_WINDOW_MINUTES} minutes')
      LIMIT 1`
  ).bind(viewerKey, path).first();

  if (existing) return { recorded: false, viewer_key: viewerKey };

  await env.DB.prepare(
    `INSERT INTO site_visits (viewer_key, path, referrer_host, referrer_url)
     VALUES (?, ?, ?, ?)`
  ).bind(viewerKey, path, referrerHost, referrer).run();

  return { recorded: true, viewer_key: viewerKey };
}

export function sanitizePath(path) {
  const value = String(path || '').trim();
  if (!value || value[0] !== '/' || value.length > 260) return '';
  return value.replace(/[?#].*$/, '');
}

export function sanitizeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch (_) {
    return null;
  }
  return null;
}

export function deriveReferrerHost(referrerUrl, requestUrl) {
  if (!referrerUrl) return 'direct';
  try {
    const ref = new URL(referrerUrl);
    const current = new URL(requestUrl);
    if (ref.host === current.host) return 'internal';
    return ref.host.toLowerCase();
  } catch (_) {
    return 'unknown';
  }
}
