/**
 * Gilwell Media · Single Post
 *
 * GET    /api/posts/:id   ← public, fetch full post
 * PUT    /api/posts/:id   ← admin only, update post
 * DELETE /api/posts/:id   ← admin only, delete post
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';
import { getLikeStats, getViewerKey, recordUniqueView } from '../../_shared/engagement.js';

const VALID_CATEGORIES = ['korea', 'apr', 'worm', 'people'];

// ── GET /api/posts/:id ────────────────────────────────────────
// Returns the full post including content body.
export async function onRequestGet({ params, env, request }) {
  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  try {
    const post = await env.DB.prepare(
      `SELECT * FROM posts WHERE id = ?`
    ).bind(id).first();

    if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

    const token = extractToken(request);
    const isAdmin = token ? await verifyToken(token, env.ADMIN_SECRET).catch(() => false) : false;

    // If unpublished, require admin token
    if (post.published === 0) {
      if (!isAdmin) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    }

    const viewerKey = await getViewerKey(request, env);
    if (!isAdmin) {
      const counted = await recordUniqueView(env, id, viewerKey).catch(() => false);
      if (counted) post.views = (post.views || 0) + 1;
    }
    const likeStats = await getLikeStats(env, id, viewerKey);
    post.likes = likeStats.likes;
    post.liked = likeStats.liked;

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

  const { category, title, subtitle, content, image_url, meta_tags, tag, author, ai_assisted, publish_date, sort_order } = body;

  // Validate only fields that are actually provided
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / worm / people)' }, 400);
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

  if (category  !== undefined) { fields.push('category = ?');   values.push(category); }
  if (title     !== undefined) { fields.push('title = ?');       values.push(title.trim()); }
  if (subtitle  !== undefined) { fields.push('subtitle = ?');    values.push(subtitle ? subtitle.trim().slice(0, 300) : null); }
  if (content   !== undefined) { fields.push('content = ?');     values.push(content.trim()); }
  if (image_url !== undefined) { fields.push('image_url = ?');   values.push(sanitizeUrl(image_url)); }
  if (meta_tags !== undefined) { fields.push('meta_tags = ?');   values.push(meta_tags ? String(meta_tags).trim().slice(0, 500) : null); }
  if (tag          !== undefined) { fields.push('tag = ?');          values.push(tag ? String(tag).trim().slice(0, 200) : null); }
  if (author       !== undefined) { fields.push('author = ?');       values.push(author ? String(author).trim().slice(0, 60) : null); }
  if (ai_assisted  !== undefined) { fields.push('ai_assisted = ?');  values.push(ai_assisted ? 1 : 0); }
  if (sort_order   !== undefined) { fields.push('sort_order = ?');   values.push(sort_order !== null ? parseInt(sort_order, 10) : null); }
  if (publish_date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(publish_date)) {
    fields.push('created_at = ?'); values.push(`${publish_date} 12:00:00`);
  }

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

// ── PATCH /api/posts/:id ──────────────────────────────────────
// Toggle featured or published flag. Requires valid admin token.
export async function onRequestPatch({ params, request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const fields = [];
  const values = [];

  if (body.featured    !== undefined) { fields.push('featured = ?');    values.push(body.featured ? 1 : 0); }
  if (body.published   !== undefined) { fields.push('published = ?');   values.push(body.published ? 1 : 0); }
  if (body.sort_order  !== undefined) { fields.push('sort_order = ?');  values.push(body.sort_order !== null ? parseInt(body.sort_order, 10) : null); }

  if (fields.length === 0) {
    return json({ error: 'featured 또는 published 값을 입력해주세요' }, 400);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  try {
    const { results } = await env.DB.prepare(
      `UPDATE posts SET ${fields.join(', ')} WHERE id = ? RETURNING *`
    ).bind(...values).all();
    if (!results.length) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    return json({ post: results[0] });
  } catch (err) {
    console.error('PATCH /api/posts/:id error:', err);
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
  if (trimmed.startsWith('data:image/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch { /* fall through */ }
  return null;
}
