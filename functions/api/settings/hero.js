/**
 * BP미디어 · Hero Posts Setting
 *
 * GET /api/settings/hero  ← public, returns { posts: [...], interval_ms }
 * PUT /api/settings/hero  ← admin only, body: { post_ids: [N, N, N], interval_ms } (up to 5)
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { serializePostImage } from '../../_shared/images.js';

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

    if (!row) return json({ posts: [], interval_ms: getSafeInterval(intervalRow && intervalRow.value), revision, media_map: {} }, 200, publicCacheHeaders(180, 900));

    // Backward-compat: stored value may be plain integer (old format) or JSON array
    let postIds = [];
    const val = row.value.trim();
    if (val.startsWith('[')) {
      try { postIds = JSON.parse(val).filter(Number.isFinite); } catch { postIds = []; }
    } else {
      const single = parseInt(val, 10);
      if (single > 0) postIds = [single];
    }

    if (!postIds.length) return json({ posts: [], interval_ms: getSafeInterval(intervalRow && intervalRow.value), revision, media_map: {} }, 200, publicCacheHeaders(180, 900));

    const mediaMap = normalizeHeroMediaMap(parseJsonValue(mediaRow && mediaRow.value), postIds);

    // Fetch posts in order
    const posts = [];
    for (const id of postIds) {
      const post = await env.DB.prepare(
        `SELECT id, category, title, subtitle, image_url, created_at FROM posts WHERE id = ? AND published = 1`
      ).bind(id).first();
      if (post) {
        const serialized = serializePostImage(post, origin);
        serialized.media = mediaMap[String(id)] || DEFAULT_HERO_MEDIA;
        posts.push(serialized);
      }
    }

    return json({ posts, interval_ms: getSafeInterval(intervalRow && intervalRow.value), revision, media_map: mediaMap }, 200, publicCacheHeaders(180, 900));
  } catch (err) {
    console.error('GET /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/hero ────────────────────────────────────
export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, ['full', 'limited']))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { post_ids, interval_ms, if_revision } = body;
  if (!Array.isArray(post_ids)) {
    return json({ error: 'post_ids 배열을 입력해주세요' }, 400);
  }

  const safeIds = post_ids
    .map(id => parseInt(id, 10))
    .filter(id => Number.isFinite(id) && id > 0)
    .slice(0, 5);
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
      prevHero ? env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('hero', prevHero.value).run() : null,
      prevInterval ? env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('hero_interval', prevInterval.value).run() : null,
      prevHeroMedia ? env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('hero_media', prevHeroMedia.value).run() : null,
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(safeIds)).run(),
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

    return json({ success: true, post_ids: safeIds, interval_ms: safeInterval, revision: nextRev, media_map: nextMediaMap });
  } catch (err) {
    console.error('PUT /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
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
    zoom: clampNumber(raw.zoom, 100, 150, DEFAULT_HERO_MEDIA.desktop.zoom),
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
      zoom: clampNumber(desktop.zoom, 100, 150, fallbackDesktop.zoom),
    },
    mobile: {
      position_x: clampNumber(mobile.position_x, 0, 100, fallbackMobile.position_x),
      position_y: clampNumber(mobile.position_y, 0, 100, fallbackMobile.position_y),
      zoom: clampNumber(mobile.zoom, 100, 150, fallbackMobile.zoom),
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

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
