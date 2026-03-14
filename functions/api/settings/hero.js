/**
 * BP미디어 · Hero Posts Setting
 *
 * GET /api/settings/hero  ← public, returns { posts: [...], interval_ms }
 * PUT /api/settings/hero  ← admin only, body: { post_ids: [N, N, N], interval_ms } (up to 5)
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { serializePostImage } from '../../_shared/images.js';

// ── GET /api/settings/hero ────────────────────────────────────
export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    const [row, intervalRow, revRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_interval'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_rev'`).first(),
    ]);
    const revision = revRow ? parseInt(revRow.value, 10) : 0;

    if (!row) return json({ posts: [], interval_ms: getSafeInterval(intervalRow && intervalRow.value), revision }, 200, publicCacheHeaders(180, 900));

    // Backward-compat: stored value may be plain integer (old format) or JSON array
    let postIds = [];
    const val = row.value.trim();
    if (val.startsWith('[')) {
      try { postIds = JSON.parse(val).filter(Number.isFinite); } catch { postIds = []; }
    } else {
      const single = parseInt(val, 10);
      if (single > 0) postIds = [single];
    }

    if (!postIds.length) return json({ posts: [], interval_ms: getSafeInterval(intervalRow && intervalRow.value), revision }, 200, publicCacheHeaders(180, 900));

    // Fetch posts in order
    const posts = [];
    for (const id of postIds) {
      const post = await env.DB.prepare(
        `SELECT id, category, title, subtitle, image_url, created_at FROM posts WHERE id = ? AND published = 1`
      ).bind(id).first();
      if (post) posts.push(serializePostImage(post, origin));
    }

    return json({ posts, interval_ms: getSafeInterval(intervalRow && intervalRow.value), revision }, 200, publicCacheHeaders(180, 900));
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

  try {
    const revRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_rev'`).first();
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(if_revision) && parseInt(if_revision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const prevHero = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero'`).first();
    const prevInterval = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_interval'`).first();
    const nextRev = currentRev + 1;

    await Promise.all([
      prevHero ? env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('hero', prevHero.value).run() : null,
      prevInterval ? env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('hero_interval', prevInterval.value).run() : null,
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(safeIds)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero_interval', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(safeInterval)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('hero_rev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(nextRev)).run(),
    ]);

    return json({ success: true, post_ids: safeIds, interval_ms: safeInterval, revision: nextRev });
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
