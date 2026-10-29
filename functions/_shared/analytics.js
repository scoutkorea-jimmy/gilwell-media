import { queryRust } from './rust-server.js';
import { getViewerKey, isLikelyNonHumanRequest } from './engagement.js';
import { resolveCountryLabelKo } from './country-code-labels.js';

const VISIT_WINDOW_MINUTES = 30;

export async function recordSiteVisit(request, env, payload) {
  if (isLikelyNonHumanRequest(request)) return { recorded: false, excluded: 'bot' };
  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return { recorded: false };

  const visitBucket = String(Math.floor(Date.now() / (VISIT_WINDOW_MINUTES * 60 * 1000)));
  const values = [viewerKey, null, null, null, null, null, null, visitBucket, null, null, null, null, null, null, null];
  const rawReferrer = typeof payload?.referrer === 'string' ? payload.referrer : null;
  const rawCurrent = typeof payload?.current_url === 'string' ? payload.current_url : null;
  const hasUnpaired = value => value && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
  const cf = request && request.cf && typeof request.cf === 'object' ? request.cf : {};
  const geoRaw = Object.fromEntries(['country','city','regionCode','continent','latitude','longitude'].map(key => [key, cf[key] ?? null]));
  const safeGeo = Object.values(geoRaw).every(value => value == null || ['string','number','boolean'].includes(typeof value) && !(typeof value === 'string' && hasUnpaired(value)));
  if (!safeGeo) {
    const geo = deriveRequestGeo(request);
    const encode = value => hasUnpaired(value) ? {utf16: Array.from({length:value.length}, (_, i) => value.charCodeAt(i))} : value;
    values.splice(8, 7, ...[geo.country_code,geo.country_name,geo.city_name,geo.region_code,geo.continent_code,geo.latitude,geo.longitude].map(encode));
  }
  const context = { request, env };
  const rawPath = payload && payload.path || null;
  const pathUtf16 = typeof rawPath === 'string' && hasUnpaired(rawPath)
    ? Array.from({length:rawPath.length}, (_, i) => rawPath.charCodeAt(i)) : null;
  const path = pathUtf16 ? null : rawPath;
  if (!hasUnpaired(rawReferrer) && !hasUnpaired(rawCurrent)) {
    const rust = await queryRust(context, 'site-visit-record', {path, path_utf16:pathUtf16, values, geo:safeGeo ? geoRaw : null, urls:{referrer:rawReferrer,current_url:rawCurrent,request_url:request.url}});
    if (!rust.ok) throw new Error('Rust site visit failed');
    return rust.json();
  }
  const referrer = sanitizeUrl(rawReferrer);
  const currentUrl = sanitizeUrl(rawCurrent);
  const utm = deriveUtmFields(currentUrl);
  const encodeUtm = value => hasUnpaired(value) ? {utf16: Array.from({length:value.length}, (_, i) => value.charCodeAt(i))} : value;
  values.splice(2, 5, deriveReferrerHost(referrer, request.url), referrer, encodeUtm(utm.source), encodeUtm(utm.medium), encodeUtm(utm.campaign));
  const rust = await queryRust(context, 'site-visit-record', {path, path_utf16:pathUtf16, values, geo:safeGeo ? geoRaw : null});
  if (!rust.ok) throw new Error('Rust site visit failed');
  return rust.json();
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
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'site-visit-ensure', {});
  if (!response.ok) throw new Error('Rust visit schema setup failed');
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
