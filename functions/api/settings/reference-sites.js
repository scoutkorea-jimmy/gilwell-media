import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const SETTING_KEY = 'reference_sites';
const REV_KEY = 'reference_sites_rev';
const MAX_ITEMS = 200;
const ALLOWED_FEDERATIONS = ['Africa', 'Arab', 'Asia-Pacific', 'European', 'Interamerican', 'Unclassified'];

export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'reference-sites', 'view'); if (__gate) return __gate;

  try {
    const [row, revRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(SETTING_KEY).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(REV_KEY).first(),
    ]);
    const items = parseReferenceSites(row && row.value);
    const revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json({ items, revision });
  } catch (err) {
    console.error('GET /api/settings/reference-sites error:', err);
    return json({ items: [], revision: 0 });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'reference-sites', 'write'); if (__gate) return __gate;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const ifRevision = body && body.if_revision;
  const items = sanitizeReferenceSites(body && body.items);

  try {
    const [revRow, prevRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(REV_KEY).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(SETTING_KEY).first(),
    ]);
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }

    const nextRev = currentRev + 1;
    await Promise.all([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(SETTING_KEY, JSON.stringify(items)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(REV_KEY, String(nextRev)).run(),
    ]);
    await recordSettingChange(env, {
      key: SETTING_KEY,
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/reference-sites',
      message: '기사 참고 사이트 설정 변경',
      details: { revision: nextRev, count: items.length },
    });
    return json({ items, revision: nextRev });
  } catch (err) {
    console.error('PUT /api/settings/reference-sites error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function parseReferenceSites(raw) {
  if (!raw) return [];
  try {
    return sanitizeReferenceSites(JSON.parse(raw));
  } catch (_) {
    return [];
  }
}

function sanitizeReferenceSites(raw) {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .slice(0, MAX_ITEMS)
    .map((item) => sanitizeReferenceSiteItem(item))
    .filter((item) => item.name || item.url || item.summary);
}

function sanitizeReferenceSiteItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    name: cleanText(source.name, 120),
    url: cleanUrl(source.url, 400),
    summary: cleanText(source.summary, 1000),
    related_federations: sanitizeFederations(source.related_federations),
  };
}

function sanitizeFederations(raw) {
  const values = Array.isArray(raw) ? raw : [];
  const out = [];
  values.forEach((value) => {
    const canonical = canonicalFederation(value);
    if (!canonical || out.indexOf(canonical) >= 0) return;
    out.push(canonical);
  });
  return out;
}

function canonicalFederation(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'africa') return 'Africa';
  if (normalized === 'arab') return 'Arab';
  if (normalized === 'asia-pacific' || normalized === 'asia pacific') return 'Asia-Pacific';
  if (normalized === 'european' || normalized === 'europe') return 'European';
  if (normalized === 'interamerican' || normalized === 'inter-american') return 'Interamerican';
  if (normalized === 'unclassified' || normalized === '미분류') return 'Unclassified';
  return ALLOWED_FEDERATIONS.indexOf(raw) >= 0 ? raw : '';
}

function cleanText(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, max);
}

function cleanUrl(value, max) {
  const text = String(value || '').trim().slice(0, max);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
