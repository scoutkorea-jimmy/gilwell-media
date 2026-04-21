/**
 * Gilwell Media · Tag (글머리) Settings
 *
 * GET /api/settings/tags  ← public, returns available tags
 * PUT /api/settings/tags  ← admin only, update tags
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_TAGS = {
  common: ['소식', '공지', '행사', '보고', '특집', '단독', '속보'],
  categories: {
    korea: [],
    apr: [],
    wosm: [],
    people: [],
  },
};

// GET /api/settings/tags
//   No query          → public list of tag names used by the homepage filter bars.
//   ?category=<slug>  → public list scoped to one category.
//   ?usage=<tag>      → ADMIN-ONLY: reveals how many posts use this tag and links.
//
// The admin branch is explicitly gated by the `usage` param, so no other
// parameter combination can leak the usage data. Any unknown admin-adjacent
// parameter should also require a valid token — add it to the gated set below.
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const usageTag = String(url.searchParams.get('usage') || '').trim();
  if (usageTag) {
    const __gate = await gateMenuAccess(request, env, 'tags', 'view'); if (__gate) return __gate
    const usage = await getTagUsage(env, usageTag);
    return json(usage);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'tags'`
    ).first();
    const parsed = row ? JSON.parse(row.value) : DEFAULT_TAGS;
    const tags = normalizeTagSettings(parsed);
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
  const __gate = await gateMenuAccess(request, env, 'tags', 'write'); if (__gate) return __gate

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
    const current = await loadTagSettings(env);
    const removedTags = collectRemovedTags(current, safe);
    for (const removedTag of removedTags) {
      const usage = await getTagUsage(env, removedTag);
      if (usage.in_use) {
        return json({
          error: `"${removedTag}" 태그가 적용된 글이 있어 삭제할 수 없습니다. 먼저 해당 글의 태그에서 제외해주세요.`,
          tag_in_use: removedTag,
          count: usage.count,
          posts: usage.posts,
        }, 409);
      }
    }
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('tags', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    await recordSettingChange(env, {
      key: 'tags',
      previousValue: current ? JSON.stringify(current) : null,
      path: '/api/settings/tags',
      message: '글머리 태그 설정 변경',
      details: { common_count: safe.common.length },
    });
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

async function loadTagSettings(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'tags'`
    ).first();
    return normalizeTagSettings(row ? JSON.parse(row.value) : DEFAULT_TAGS);
  } catch (_) {
    return normalizeTagSettings(DEFAULT_TAGS);
  }
}

function normalizeTagSettings(raw) {
  const normalized = {
    common: [],
    categories: {
      korea: [],
      apr: [],
      wosm: [],
      people: [],
    },
  };

  if (Array.isArray(raw)) {
    normalized.common = sanitize(raw);
    return normalized;
  }

  if (raw && typeof raw === 'object') {
    normalized.common = sanitize(raw.common);
    ['korea', 'apr', 'wosm', 'people'].forEach((category) => {
      normalized.categories[category] = sanitize(raw.categories?.[category] || (category === 'wosm' ? raw.categories?.worm : null));
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
  const chosen = ['korea', 'apr', 'wosm', 'people'].includes(category === 'worm' ? 'wosm' : category) ? (category === 'worm' ? 'wosm' : category) : 'korea';
  const seen = new Set();
  return tags.common.concat(tags.categories[chosen] || []).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function collectRemovedTags(current, next) {
  const currentTags = flattenTags(current);
  const nextTags = new Set(flattenTags(next));
  return currentTags.filter((tag) => !nextTags.has(tag));
}

function flattenTags(tags) {
  const collected = [];
  const pushUnique = (item) => {
    const value = String(item || '').trim();
    if (!value || collected.includes(value)) return;
    collected.push(value);
  };
  sanitize(tags && tags.common).forEach(pushUnique);
  ['korea', 'apr', 'wosm', 'people'].forEach((category) => {
    sanitize(tags && tags.categories && tags.categories[category]).forEach(pushUnique);
  });
  return collected;
}

async function getTagUsage(env, tag) {
  const safeTag = String(tag || '').trim();
  if (!safeTag) {
    return { tag: safeTag, in_use: false, count: 0, posts: [] };
  }
  const [countRow, rows] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM posts
        WHERE tag IS NOT NULL
          AND instr(
            ',' || replace(replace(COALESCE(tag, ''), ', ', ','), ' ,', ',') || ',',
            ',' || replace(replace(?, ', ', ','), ' ,', ',') || ','
          ) > 0`
    ).bind(safeTag).first(),
    env.DB.prepare(
      `SELECT id, title, category, tag
       FROM posts
      WHERE tag IS NOT NULL
        AND instr(
          ',' || replace(replace(COALESCE(tag, ''), ', ', ','), ' ,', ',') || ',',
          ',' || replace(replace(?, ', ', ','), ' ,', ',') || ','
        ) > 0
      ORDER BY updated_at DESC, id DESC
      LIMIT 5`
    ).bind(safeTag).all(),
  ]);
  const items = (rows.results || []).map((row) => ({
    id: row.id,
    title: row.title || '',
    category: row.category || '',
    tag: row.tag || '',
  }));
  const count = Number(countRow && countRow.count || 0);
  return {
    tag: safeTag,
    in_use: count > 0,
    count: count,
    posts: items,
  };
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
