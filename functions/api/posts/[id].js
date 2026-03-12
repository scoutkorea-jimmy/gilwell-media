/**
 * Gilwell Media · Single Post
 *
 * GET    /api/posts/:id   ← public, fetch full post
 * PUT    /api/posts/:id   ← admin only, update post
 * DELETE /api/posts/:id   ← admin only, delete post
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

const VALID_CATEGORIES = ['korea', 'apr', 'worm'];

// ── GET /api/posts/:id ────────────────────────────────────────
// Returns the full post including content body.
export async function onRequestGet({ params, env }) {
  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  try {
    const post = await env.DB.prepare(
      `SELECT * FROM posts WHERE id = ?`
    ).bind(id).first();

    if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    return json({ post });
  } catch (err) {
    console.error('GET /api/posts/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/posts/:id ────────────────────────────────────────
// Updates an existing post. Requires valid admin token.
export async function onRequestPut({ params, request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { category, title, content, image_url } = body;

  // Validate only fields that are actually provided
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / worm)' }, 400);
  }
  if (title !== undefined && !title.trim()) {
    return json({ error: '제목을 입력해주세요' }, 400);
  }
  if (content !== undefined && !content.trim()) {
    return json({ error: '내용을 입력해주세요' }, 400);
  }

  // Build dynamic SET clause from provided fields
  const fields = [];
  const values = [];

  if (category  !== undefined) { fields.push('category = ?');  values.push(category); }
  if (title     !== undefined) { fields.push('title = ?');      values.push(title.trim()); }
  if (content   !== undefined) { fields.push('content = ?');    values.push(content.trim()); }
  if (image_url !== undefined) { fields.push('image_url = ?');  values.push(sanitizeUrl(image_url)); }

  if (fields.length === 0) {
    return json({ error: '변경할 내용을 입력해주세요' }, 400);
  }

  // Always update the timestamp
  fields.push("updated_at = datetime('now')");
  values.push(id);

  try {
    const { results } = await env.DB.prepare(
      `UPDATE posts SET ${fields.join(', ')} WHERE id = ? RETURNING *`
    ).bind(...values).all();

    if (!results.length) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    return json({ post: results[0] });
  } catch (err) {
    console.error('PUT /api/posts/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── DELETE /api/posts/:id ─────────────────────────────────────
// Deletes a post. Requires valid admin token.
export async function onRequestDelete({ params, request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  try {
    const { meta } = await env.DB.prepare(
      `DELETE FROM posts WHERE id = ?`
    ).bind(id).run();

    if (meta.changes === 0) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    return json({ success: true });
  } catch (err) {
    console.error('DELETE /api/posts/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch { /* fall through */ }
  return null;
}
