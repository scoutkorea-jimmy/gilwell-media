/**
 * BP미디어 · Hero Posts Setting
 *
 * GET /api/settings/hero  ← public, returns { posts: [{id, category, title, subtitle, image_url, created_at}] }
 * PUT /api/settings/hero  ← admin only, body: { post_ids: [N, N, N] } (up to 5)
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

// ── GET /api/settings/hero ────────────────────────────────────
export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'hero'`
    ).first();

    if (!row) return json({ posts: [] });

    // Backward-compat: stored value may be plain integer (old format) or JSON array
    let postIds = [];
    const val = row.value.trim();
    if (val.startsWith('[')) {
      try { postIds = JSON.parse(val).filter(Number.isFinite); } catch { postIds = []; }
    } else {
      const single = parseInt(val, 10);
      if (single > 0) postIds = [single];
    }

    if (!postIds.length) return json({ posts: [] });

    // Fetch posts in order
    const posts = [];
    for (const id of postIds) {
      const post = await env.DB.prepare(
        `SELECT id, category, title, subtitle, image_url, created_at FROM posts WHERE id = ? AND published = 1`
      ).bind(id).first();
      if (post) posts.push(post);
    }

    return json({ posts });
  } catch (err) {
    console.error('GET /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/hero ────────────────────────────────────
export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { post_ids } = body;
  if (!Array.isArray(post_ids)) {
    return json({ error: 'post_ids 배열을 입력해주세요' }, 400);
  }

  const safeIds = post_ids
    .map(id => parseInt(id, 10))
    .filter(id => Number.isFinite(id) && id > 0)
    .slice(0, 5);

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('hero', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safeIds)).run();

    return json({ success: true, post_ids: safeIds });
  } catch (err) {
    console.error('PUT /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
