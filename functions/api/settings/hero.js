/**
 * BP미디어 · Hero Posts Setting
 *
 * GET /api/settings/hero  ← public, returns { posts: [...], interval_ms }
 * PUT /api/settings/hero  ← admin only, body: { manual_post_ids: [N, N], manual_position, interval_ms }
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { serializePostImage } from '../../_shared/images.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const MAX_MANUAL_HERO_POSTS = 2;
const AUTO_HERO_POST_COUNT = 3;
const MAX_TOTAL_HERO_POSTS = MAX_MANUAL_HERO_POSTS + AUTO_HERO_POST_COUNT;
const DEFAULT_HERO_MANUAL_POSITION = 'after_auto';

const DEFAULT_HERO_MEDIA = {
  fit: 'cover',
  desktop: {
    position_x: 50,
    position_y: 50,
    zoom: 100,
  },
  mobile: {
    position_x: 50,
    position_y: 50,
    zoom: 100,
  },
};

// ── GET /api/settings/hero ────────────────────────────────────
export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    const [row, intervalRow, revRow, mediaRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_interval'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_rev'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_media'`).first(),
    ]);
    const revision = revRow ? parseInt(revRow.value, 10) : 0;

    const heroSettings = parseHeroSettings(row && row.value);
    const mediaMap = normalizeHeroMediaMap(parseJsonValue(mediaRow && mediaRow.value), heroSettings.manual_post_ids);
    const posts = await buildHeroPosts(env, origin, heroSettings.manual_post_ids, heroSettings.manual_position, mediaMap);

    return json({
      posts,
      interval_ms: getSafeInterval(intervalRow && intervalRow.value),
      revision,
      media_map: mediaMap,
      post_ids: heroSettings.manual_post_ids,
      manual_post_ids: heroSettings.manual_post_ids,
      manual_position: heroSettings.manual_position,
      auto_fill_count: AUTO_HERO_POST_COUNT,
      total_count: MAX_TOTAL_HERO_POSTS,
    }, 200);
  } catch (err) {
    console.error('GET /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/hero ────────────────────────────────────
export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'hero', 'view'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const manualPostIdsInput = Array.isArray(body && body.manual_post_ids)
    ? body.manual_post_ids
    : body && body.post_ids;
  const { interval_ms, if_revision } = body;
  if (!Array.isArray(manualPostIdsInput)) {
    return json({ error: 'manual_post_ids 배열을 입력해주세요' }, 400);
  }

  const safeIds = manualPostIdsInput
    .map(id => parseInt(id, 10))
    .filter(id => Number.isFinite(id) && id > 0)
    .slice(0, MAX_MANUAL_HERO_POSTS);
  const manualPosition = body && body.manual_position === 'before_auto'
    ? 'before_auto'
    : DEFAULT_HERO_MANUAL_POSITION;
  const safeInterval = getSafeInterval(interval_ms);
  const hasMediaMap = !!(body && typeof body.media_map === 'object' && body.media_map);
  const requestedMediaMap = hasMediaMap ? normalizeHeroMediaMap(body.media_map, safeIds) : null;

  try {
    const [revRow, prevHero, prevInterval, prevHeroMedia] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_rev'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_interval'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_media'`).first(),
    ]);
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(if_revision) && parseInt(if_revision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const currentMediaMap = normalizeHeroMediaMap(parseJsonValue(prevHeroMedia && prevHeroMedia.value), safeIds);
    const nextMediaMap = hasMediaMap ? requestedMediaMap : currentMediaMap;

    await Promise.all([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify({
        manual_post_ids: safeIds,
        manual_position: manualPosition,
      })).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero_interval', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(safeInterval)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero_media', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(nextMediaMap)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero_rev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(nextRev)).run(),
    ]);
    await Promise.all([
      recordSettingChange(env, {
        key: 'hero',
        previousValue: prevHero && prevHero.value,
        path: '/api/settings/hero',
        message: 'hero 설정 변경',
        details: { revision: nextRev, manual_post_ids: safeIds, manual_position: manualPosition },
      }),
      recordSettingChange(env, {
        key: 'hero_interval',
        previousValue: prevInterval && prevInterval.value,
        path: '/api/settings/hero',
        message: 'hero 전환 주기 설정 변경',
        details: { revision: nextRev, interval_ms: safeInterval },
      }),
      recordSettingChange(env, {
        key: 'hero_media',
        previousValue: prevHeroMedia && prevHeroMedia.value,
        path: '/api/settings/hero',
        message: 'hero 미디어 설정 변경',
        details: { revision: nextRev, post_ids: safeIds },
      }),
    ]);
    return json({
      success: true,
      post_ids: safeIds,
      manual_post_ids: safeIds,
      manual_position: manualPosition,
      interval_ms: safeInterval,
      revision: nextRev,
      media_map: nextMediaMap,
      auto_fill_count: AUTO_HERO_POST_COUNT,
      total_count: MAX_TOTAL_HERO_POSTS,
    });
  } catch (err) {
    console.error('PUT /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function parseHeroSettings(raw) {
  const fallback = {
    manual_post_ids: [],
    manual_position: DEFAULT_HERO_MANUAL_POSITION,
  };
  if (!raw) return fallback;

  const value = String(raw).trim();
  if (!value) return fallback;

  if (value.startsWith('{')) {
    const parsed = parseJsonValue(value);
    const manualIds = Array.isArray(parsed && parsed.manual_post_ids)
      ? parsed.manual_post_ids
      : Array.isArray(parsed && parsed.post_ids)
        ? parsed.post_ids
        : [];
    return {
      manual_post_ids: manualIds
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, MAX_MANUAL_HERO_POSTS),
      manual_position: parsed && parsed.manual_position === 'before_auto'
        ? 'before_auto'
        : DEFAULT_HERO_MANUAL_POSITION,
    };
  }

  if (value.startsWith('[')) {
    const parsed = parseJsonValue(value);
    return {
      manual_post_ids: Array.isArray(parsed)
        ? parsed.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0).slice(0, MAX_MANUAL_HERO_POSTS)
        : [],
      manual_position: DEFAULT_HERO_MANUAL_POSITION,
    };
  }

  const single = parseInt(value, 10);
  return {
    manual_post_ids: Number.isFinite(single) && single > 0 ? [single] : [],
    manual_position: DEFAULT_HERO_MANUAL_POSITION,
  };
}

async function buildHeroPosts(env, origin, manualPostIds, manualPosition, mediaMap) {
  const manualPosts = await loadManualHeroPosts(env, origin, manualPostIds, mediaMap);
  const autoPosts = await loadAutomaticHeroPosts(env, origin, manualPosts.map((post) => post.id));
  const ordered = manualPosition === 'before_auto'
    ? manualPosts.concat(autoPosts)
    : autoPosts.concat(manualPosts);
  return ordered.slice(0, MAX_TOTAL_HERO_POSTS);
}

async function loadManualHeroPosts(env, origin, postIds, mediaMap) {
  if (!Array.isArray(postIds) || !postIds.length) return [];

  const posts = [];
  for (const id of postIds) {
    const post = await env.DB.prepare(
      `SELECT id, category, title, subtitle, image_url, created_at, publish_at
         FROM posts
        WHERE id = ? AND published = 1`
    ).bind(id).first();
    if (!post) continue;
    const serialized = serializePostImage(post, origin);
    serialized.media = mediaMap[String(id)] || DEFAULT_HERO_MEDIA;
    posts.push(serialized);
  }
  return posts;
}

async function loadAutomaticHeroPosts(env, origin, excludedIds) {
  const exclusions = Array.isArray(excludedIds)
    ? excludedIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const conditions = ['published = 1'];
  const bindings = [];

  if (exclusions.length) {
    conditions.push(`id NOT IN (${exclusions.map(() => '?').join(', ')})`);
    bindings.push(...exclusions);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, image_url, created_at, publish_at
       FROM posts
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(publish_at, created_at) DESC, id DESC
      LIMIT ?`
  ).bind(...bindings, AUTO_HERO_POST_COUNT).all();

  return (results || []).map((post) => {
    const serialized = serializePostImage(post, origin);
    serialized.media = DEFAULT_HERO_MEDIA;
    return serialized;
  });
}

function getSafeInterval(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(15000, Math.max(2000, parsed));
}

function parseJsonValue(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeHeroMediaMap(input, allowedIds) {
  const map = input && typeof input === 'object' ? input : {};
  const allowed = Array.isArray(allowedIds) ? allowedIds.map(String) : null;
  return Object.keys(map).reduce((acc, key) => {
    if (allowed && allowed.indexOf(String(key)) === -1) return acc;
    acc[String(key)] = normalizeHeroMedia(map[key]);
    return acc;
  }, {});
}

function normalizeHeroMedia(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const fallbackDesktop = {
    position_x: clampNumber(raw.position_x, 0, 100, DEFAULT_HERO_MEDIA.desktop.position_x),
    position_y: clampNumber(raw.position_y, 0, 100, DEFAULT_HERO_MEDIA.desktop.position_y),
    zoom: clampNumber(raw.zoom, 60, 150, DEFAULT_HERO_MEDIA.desktop.zoom),
  };
  const fallbackMobile = {
    position_x: fallbackDesktop.position_x,
    position_y: fallbackDesktop.position_y,
    zoom: fallbackDesktop.zoom,
  };
  const desktop = raw.desktop && typeof raw.desktop === 'object' ? raw.desktop : raw;
  const mobile = raw.mobile && typeof raw.mobile === 'object' ? raw.mobile : raw;
  return {
    fit: raw.fit === 'contain' ? 'contain' : 'cover',
    desktop: {
      position_x: clampNumber(desktop.position_x, 0, 100, fallbackDesktop.position_x),
      position_y: clampNumber(desktop.position_y, 0, 100, fallbackDesktop.position_y),
      zoom: clampNumber(desktop.zoom, 60, 150, fallbackDesktop.zoom),
    },
    mobile: {
      position_x: clampNumber(mobile.position_x, 0, 100, fallbackMobile.position_x),
      position_y: clampNumber(mobile.position_y, 0, 100, fallbackMobile.position_y),
      zoom: clampNumber(mobile.zoom, 60, 150, fallbackMobile.zoom),
    },
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}
