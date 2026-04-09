import { getViewerKey, isLikelyNonHumanRequest } from './engagement.js';
import { resolveCountryLabelKo } from './country-code-labels.js';

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
  const currentUrl = sanitizeUrl(payload && payload.current_url);
  const referrerHost = deriveReferrerHost(referrer, request.url);
  const utm = deriveUtmFields(currentUrl);
  const geo = deriveRequestGeo(request);
  await ensureSiteVisitColumns(env);

  const visitBucket = String(Math.floor(Date.now() / (VISIT_WINDOW_MINUTES * 60 * 1000)));
  const insert = await env.DB.prepare(
    `INSERT OR IGNORE INTO site_visits (
      viewer_key, path, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, visited_bucket,
      country_code, country_name, city_name, region_code, continent_code, latitude, longitude
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    viewerKey,
    path,
    referrerHost,
    referrer,
    utm.source,
    utm.medium,
    utm.campaign,
    visitBucket,
    geo.country_code,
    geo.country_name,
    geo.city_name,
    geo.region_code,
    geo.continent_code,
    geo.latitude,
    geo.longitude
  ).run();

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
  if (!env || !env.DB) return true;
  const pragma = await env.DB.prepare(`PRAGMA table_info(site_visits)`).all().catch(function () {
    return { results: [] };
  });
  const columns = new Set((pragma.results || []).map(function (row) { return row.name; }));
  const additions = [
    ['country_code', 'TEXT'],
    ['country_name', 'TEXT'],
    ['city_name', 'TEXT'],
    ['region_code', 'TEXT'],
    ['continent_code', 'TEXT'],
    ['latitude', 'REAL'],
    ['longitude', 'REAL'],
  ];
  for (const entry of additions) {
    const columnName = entry[0];
    const sqlType = entry[1];
    if (columns.has(columnName)) continue;
    await env.DB.prepare(`ALTER TABLE site_visits ADD COLUMN ${columnName} ${sqlType}`).run();
  }
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_site_visits_country_code ON site_visits(country_code)`).run().catch(function () {});
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_site_visits_city_name ON site_visits(city_name)`).run().catch(function () {});
  return true;
}

function deriveRequestGeo(request) {
  var cf = request && request.cf && typeof request.cf === 'object' ? request.cf : {};
  var countryCode = sanitizeGeoCode(cf.country, 12);
  return {
    country_code: countryCode,
    country_name: countryCode ? resolveCountryName(countryCode) : null,
    city_name: sanitizeGeoText(cf.city, 120),
    region_code: sanitizeGeoCode(cf.regionCode, 32),
    continent_code: sanitizeGeoCode(cf.continent, 12),
    latitude: sanitizeCoordinate(cf.latitude, -90, 90),
    longitude: sanitizeCoordinate(cf.longitude, -180, 180),
  };
}

function sanitizeGeoText(value, maxLen) {
  var raw = String(value || '').trim();
  if (!raw) return null;
  return raw.slice(0, maxLen || 120);
}

function sanitizeGeoCode(value, maxLen) {
  var raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;
  return raw.slice(0, maxLen || 16);
}

function sanitizeCoordinate(value, min, max) {
  if (value === '' || value == null) return null;
  var num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return Math.round(num * 1000000) / 1000000;
}

function resolveCountryName(countryCode) {
  return resolveCountryLabelKo(countryCode, countryCode);
}
