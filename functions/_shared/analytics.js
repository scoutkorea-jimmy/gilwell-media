import { getViewerKey, isLikelyNonHumanRequest } from './engagement.js';

const VISIT_WINDOW_MINUTES = 30;

export async function recordSiteVisit(request, env, payload) {
  if (isLikelyNonHumanRequest(request)) return { recorded: false, excluded: 'bot' };
  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return { recorded: false };

  const path = sanitizePath(payload && payload.path);
  if (!path || path.startsWith('/api/') || path === '/admin.html' || path === '/admin') {
    return { recorded: false };
  }

  const referrer = sanitizeUrl(payload && payload.referrer);
  const referrerHost = deriveReferrerHost(referrer, request.url);

  const visitBucket = String(Math.floor(Date.now() / (VISIT_WINDOW_MINUTES * 60 * 1000)));
  const insert = await env.DB.prepare(
    `INSERT OR IGNORE INTO site_visits (viewer_key, path, referrer_host, referrer_url, visited_bucket)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(viewerKey, path, referrerHost, referrer, visitBucket).run();

  return { recorded: !!insert.meta?.changes, viewer_key: viewerKey };
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
