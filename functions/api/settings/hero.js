/**
 * Gilwell Media · Hero Post Setting
 *
 * GET /api/settings/hero  ← public, returns { post_id, post }
 * PUT /api/settings/hero  ← admin only, body: { post_id: N }
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

// ── GET /api/settings/hero ────────────────────────────────────
export async function onRequestGet({ env }) {
  try {
    const row    = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'hero'`
    ).first();
    const postId = row ? parseInt(row.value, 10) : 0;

    if (!postId) return json({ post_id: 0, post: null });

    const post = await env.DB.prepare(
      `SELECT id, category, title, subtitle, image_url, created_at FROM posts WHERE id = ?`
    ).bind(postId).first();

    return json({ post_id: postId, post: post || null });
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

  const postId = parseInt(body.post_id, 10);
  if (!Number.isFinite(postId) || postId < 0) {
    return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('hero', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(String(postId)).run();

    return json({ success: true, post_id: postId });
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
