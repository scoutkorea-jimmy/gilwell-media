/**
 * Gilwell Media · Posts Collection
 *
 * GET  /api/posts?category=korea&page=1   ← public, list posts
 * POST /api/posts                          ← admin only, create post
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

const VALID_CATEGORIES = ['korea', 'apr', 'worm'];
const PAGE_SIZE = 20;

// ── GET /api/posts ────────────────────────────────────────────
// Returns a paginated list of posts (no full content body — just
// id, category, title, image_url, created_at for card display).
export async function onRequestGet({ request, env }) {
  const url      = new URL(request.url);
  const category = url.searchParams.get('category') || null;
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const offset   = (page - 1) * PAGE_SIZE;

  if (category && !VALID_CATEGORIES.includes(category)) {
    return json({ error: 'Invalid category. Must be korea, apr, or worm.' }, 400);
  }

  try {
    // Fetch posts
    let postsQuery, countQuery;
    let postsArgs, countArgs;

    if (category) {
      postsQuery = `SELECT id, category, title, image_url, created_at
                    FROM posts WHERE category = ?
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs = [category, PAGE_SIZE, offset];

      countQuery = `SELECT COUNT(*) AS total FROM posts WHERE category = ?`;
      countArgs  = [category];
    } else {
      postsQuery = `SELECT id, category, title, image_url, created_at
                    FROM posts
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs = [PAGE_SIZE, offset];

      countQuery = `SELECT COUNT(*) AS total FROM posts`;
      countArgs  = [];
    }

    const { results: posts }    = await env.DB.prepare(postsQuery).bind(...postsArgs).all();
    const { results: countRows } = await env.DB.prepare(countQuery).bind(...countArgs).all();
    const total = countRows[0]?.total ?? 0;

    return json({ posts, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error('GET /api/posts error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── POST /api/posts ───────────────────────────────────────────
// Creates a new post. Requires valid admin token.
export async function onRequestPost({ request, env }) {
  // Verify admin token
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { category, title, content, image_url } = body;

  if (!VALID_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / worm)' }, 400);
  }
  if (!title || !title.trim()) {
    return json({ error: '제목을 입력해주세요' }, 400);
  }
  if (!content || !content.trim()) {
    return json({ error: '내용을 입력해주세요' }, 400);
  }

  const safeImageUrl = sanitizeUrl(image_url);

  try {
    const { results } = await env.DB.prepare(
      `INSERT INTO posts (category, title, content, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
       RETURNING *`
    ).bind(
      category,
      title.trim(),
      content.trim(),
      safeImageUrl
    ).all();

    return json({ post: results[0] }, 201);
  } catch (err) {
    console.error('POST /api/posts error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Only allow http/https URLs; reject anything else or malformed URLs. */
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
