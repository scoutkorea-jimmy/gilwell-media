import { getViewerKey, isLikelyNonHumanRequest } from './engagement.js';

const VISIT_WINDOW_MINUTES = 30;

export async function recordSiteVisit(request, env, payload) {
  if (isLikelyNonHumanRequest(request)) return { recorded: false, excluded: 'bot' };
  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return { recorded: false };
  await ensureSiteVisitColumns(env);

  const path = sanitizePath(payload && payload.path);
  if (!path || path.startsWith('/api/') || path === '/admin.html' || path === '/admin') {
    return { recorded: false };
  }

  const referrer = sanitizeUrl(payload && payload.referrer);
  const currentUrl = sanitizeUrl(payload && payload.current_url);
  const referrerHost = deriveReferrerHost(referrer, request.url);
  const utm = deriveUtmFields(currentUrl);

  const visitBucket = String(Math.floor(Date.now() / (VISIT_WINDOW_MINUTES * 60 * 1000)));
  const insert = await env.DB.prepare(
    `INSERT OR IGNORE INTO site_visits (viewer_key, path, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, visited_bucket)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(viewerKey, path, referrerHost, referrer, utm.source, utm.medium, utm.campaign, visitBucket).run();

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

function deriveUtmFields(currentUrl) {
  if (!currentUrl) return { source: null, medium: null, campaign: null };
  try {
    const parsed = new URL(currentUrl);
    return {
      source: sanitizeUtmValue(parsed.searchParams.get('utm_source')),
      medium: sanitizeUtmValue(parsed.searchParams.get('utm_medium')),
      campaign: sanitizeUtmValue(parsed.searchParams.get('utm_campaign')),
    };
  } catch (_) {
    return { source: null, medium: null, campaign: null };
  }
}

function sanitizeUtmValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? normalized.slice(0, 80) : null;
}

export async function ensureSiteVisitColumns(env) {
  await ensureSiteVisitColumn(env, 'utm_source');
  await ensureSiteVisitColumn(env, 'utm_medium');
  await ensureSiteVisitColumn(env, 'utm_campaign');
}

async function ensureSiteVisitColumn(env, columnName) {
  try {
    await env.DB.prepare(`SELECT ${columnName} FROM site_visits LIMIT 1`).first();
  } catch (err) {
    const message = String(err && err.message || err || '');
    if (message.indexOf('no such column') === -1) throw err;
    await env.DB.prepare(`ALTER TABLE site_visits ADD COLUMN ${columnName} TEXT`).run();
  }
}
