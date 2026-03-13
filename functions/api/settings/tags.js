/**
 * Gilwell Media · Tag (글머리) Settings
 *
 * GET /api/settings/tags  ← public, returns available tags
 * PUT /api/settings/tags  ← admin only, update tags
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

const DEFAULT_TAGS = {
  common: ['소식', '공지', '행사', '보고', '특집', '단독', '속보'],
  categories: {
    korea: [],
    apr: [],
    worm: [],
  },
};

export async function onRequestGet({ env, request }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'tags'`
    ).first();
    const parsed = row ? JSON.parse(row.value) : DEFAULT_TAGS;
    const tags = normalizeTagSettings(parsed);
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const items = getTagsForCategory(tags, category);
    return json({
      items,
      common: tags.common,
      categories: tags.categories,
    });
  } catch (err) {
    console.error('GET /api/settings/tags error:', err);
    return json({
      items: getTagsForCategory(DEFAULT_TAGS, null),
      common: DEFAULT_TAGS.common,
      categories: DEFAULT_TAGS.categories,
    });
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  let safe;
  if (Array.isArray(body.items)) {
    safe = normalizeTagSettings(body.items);
  } else if (body && typeof body === 'object') {
    safe = normalizeTagSettings({
      common: body.common,
      categories: body.categories,
    });
  } else {
    return json({ error: '태그 구조를 입력해주세요' }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('tags', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    return json({
      items: getTagsForCategory(safe, null),
      common: safe.common,
      categories: safe.categories,
    });
  } catch (err) {
    console.error('PUT /api/settings/tags error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function normalizeTagSettings(raw) {
  const normalized = {
    common: [],
    categories: {
      korea: [],
      apr: [],
      worm: [],
    },
  };

  if (Array.isArray(raw)) {
    normalized.common = sanitize(raw);
    return normalized;
  }

  if (raw && typeof raw === 'object') {
    normalized.common = sanitize(raw.common);
    ['korea', 'apr', 'worm'].forEach((category) => {
      normalized.categories[category] = sanitize(raw.categories?.[category]);
    });
  }

  return normalized;
}

function sanitize(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 100);
}

function getTagsForCategory(tags, category) {
  const chosen = ['korea', 'apr', 'worm'].includes(category) ? category : 'korea';
  const seen = new Set();
  return tags.common.concat(tags.categories[chosen] || []).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
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
