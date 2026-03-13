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

  // Admin token check — if valid token, include unpublished posts
  const token     = extractToken(request);
  const isAdmin   = token ? await verifyToken(token, env.ADMIN_SECRET).catch(() => false) : false;
  const pubFilter = isAdmin ? '' : 'AND published = 1';

  const featuredOnly = url.searchParams.get('featured') === '1';
  const q = url.searchParams.get('q') || null;

  try {
    // Fetch posts
    let postsQuery, countQuery;
    let postsArgs, countArgs;

    if (featuredOnly) {
      postsQuery = `SELECT id, category, title, subtitle, image_url, created_at, featured, tag, views, author, published
                    FROM posts WHERE featured = 1 AND published = 1
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs  = [PAGE_SIZE, offset];
      countQuery = `SELECT COUNT(*) AS total FROM posts WHERE featured = 1 AND published = 1`;
      countArgs  = [];
    } else if (q && category) {
      postsQuery = `SELECT id, category, title, subtitle, image_url, created_at, featured, tag, views, author, published
                    FROM posts WHERE category = ? AND (title LIKE ? OR subtitle LIKE ? OR tag LIKE ?) ${pubFilter}
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs = [category, `%${q}%`, `%${q}%`, `%${q}%`, PAGE_SIZE, offset];
      countQuery = `SELECT COUNT(*) AS total FROM posts WHERE category = ? AND (title LIKE ? OR subtitle LIKE ? OR tag LIKE ?) ${pubFilter}`;
      countArgs  = [category, `%${q}%`, `%${q}%`, `%${q}%`];
    } else if (q) {
      postsQuery = `SELECT id, category, title, subtitle, image_url, created_at, featured, tag, views, author, published
                    FROM posts WHERE (title LIKE ? OR subtitle LIKE ? OR tag LIKE ?) ${pubFilter}
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs = [`%${q}%`, `%${q}%`, `%${q}%`, PAGE_SIZE, offset];
      countQuery = `SELECT COUNT(*) AS total FROM posts WHERE (title LIKE ? OR subtitle LIKE ? OR tag LIKE ?) ${pubFilter}`;
      countArgs  = [`%${q}%`, `%${q}%`, `%${q}%`];
    } else if (category) {
      postsQuery = `SELECT id, category, title, subtitle, image_url, created_at, featured, tag, views, author, published
                    FROM posts WHERE category = ? ${pubFilter}
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs = [category, PAGE_SIZE, offset];
      countQuery = `SELECT COUNT(*) AS total FROM posts WHERE category = ? ${pubFilter}`;
      countArgs  = [category];
    } else {
      postsQuery = `SELECT id, category, title, subtitle, image_url, created_at, featured, tag, views, author, published
                    FROM posts WHERE 1=1 ${pubFilter}
                    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      postsArgs = [PAGE_SIZE, offset];
      countQuery = `SELECT COUNT(*) AS total FROM posts WHERE 1=1 ${pubFilter}`;
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

  const { category, title, subtitle, content, image_url, tag, meta_tags, ai_assisted } = body;

  if (!VALID_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / worm)' }, 400);
  }
  if (!title || !title.trim()) {
    return json({ error: '제목을 입력해주세요' }, 400);
  }
  if (!content || !content.trim()) {
    return json({ error: '내용을 입력해주세요' }, 400);
  }

  const safeImageUrl  = sanitizeUrl(image_url);
  const safeSubtitle  = (subtitle && typeof subtitle === 'string') ? subtitle.trim().slice(0, 300) : null;
  const safeTag       = (tag && typeof tag === 'string') ? tag.trim().slice(0, 30) : null;
  const safeMetaTags  = (meta_tags && typeof meta_tags === 'string') ? meta_tags.trim().slice(0, 500) : null;

  // Get default author from settings if not provided in body
  const bodyAuthor = (body.author && typeof body.author === 'string') ? body.author.trim().slice(0, 60) : null;
  let safeAuthor = bodyAuthor;
  if (!safeAuthor) {
    try {
      const authorRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'author_name'`).first();
      safeAuthor = authorRow?.value || 'Editor.A';
    } catch { safeAuthor = 'Editor.A'; }
  }

  const safeAiAssisted = ai_assisted ? 1 : 0;

  try {
    const { results } = await env.DB.prepare(
      `INSERT INTO posts (category, title, subtitle, content, image_url, tag, meta_tags, author, ai_assisted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       RETURNING *`
    ).bind(
      category,
      title.trim(),
      safeSubtitle,
      content.trim(),
      safeImageUrl,
      safeTag,
      safeMetaTags,
      safeAuthor,
      safeAiAssisted
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

/** Allow http/https URLs and data:image/ base64 strings (cover uploads). */
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
