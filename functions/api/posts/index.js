/**
 * Gilwell Media · Posts Collection
 *
 * GET  /api/posts?category=korea&page=1   ← public, list posts
 * POST /api/posts                          ← admin only, create post
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';
import { sanitizeYouTubeUrl } from '../../_shared/youtube.js';
import { serializePostImage } from '../../_shared/images.js';
import { storeDataImage, upgradeEditorContentImages } from '../../_shared/image-storage.js';
import { recordPostHistory } from '../../_shared/post-history.js';
import { sanitizeSpecialFeature } from '../../_shared/special-features.js';

const VALID_CATEGORIES = ['korea', 'apr', 'wosm', 'people'];
const PAGE_SIZE = 16;

// ── GET /api/posts ────────────────────────────────────────────
// Returns a paginated list of posts (no full content body — just
// id, category, title, image_url, created_at for card display).
export async function onRequestGet({ request, env }) {
  const url          = new URL(request.url);
  const origin       = url.origin;
  const category     = normalizeCategory(url.searchParams.get('category') || null);
  const page         = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const requestedLimit = parseInt(url.searchParams.get('limit') || String(PAGE_SIZE), 10);
  const pageSize     = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : PAGE_SIZE));
  const offset       = (page - 1) * pageSize;
  const q            = url.searchParams.get('q') || null;
  const tagFilter    = url.searchParams.get('tag') || null;
  const featuredOnly = url.searchParams.get('featured') === '1';
  const specialFeature = sanitizeSpecialFeature(url.searchParams.get('special_feature'));
  const allRequested = url.searchParams.get('all') === '1';
  const daysFilter   = Math.max(0, parseInt(url.searchParams.get('days') || '0', 10));

  if (category && !VALID_CATEGORIES.includes(category)) {
    return json({ error: 'Invalid category. Must be korea, apr, wosm, or people.' }, 400);
  }

  // Admin token check — if valid token, include unpublished posts
  const token   = extractToken(request);
  const isAdmin = token ? await verifyTokenRole(token, env.ADMIN_SECRET, 'full').catch(() => false) : false;

  const ORDER_LATEST = 'ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC';
  const ORDER_MANUAL = 'ORDER BY sort_order IS NULL ASC, sort_order ASC, datetime(COALESCE(publish_at, created_at)) DESC, id DESC';
  const ORDER = allRequested && isAdmin ? ORDER_MANUAL : ORDER_LATEST;
  const COLS  = `id, category, title, subtitle, image_url, image_caption, created_at, publish_at, updated_at, featured, tag, special_feature, views, author, published, sort_order,
    youtube_url,
    (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes`;

  try {
    // Build WHERE conditions dynamically
    const conditions = [];
    const baseArgs   = [];

    if (featuredOnly) {
      conditions.push('featured = 1', 'published = 1');
    } else {
      if (category)  { conditions.push('category = ?'); baseArgs.push(category); }
      if (!isAdmin)  { conditions.push('published = 1'); }
      if (daysFilter > 0) {
        conditions.push("datetime(COALESCE(publish_at, created_at)) >= datetime(?, ?)");
        baseArgs.push('now', '-' + daysFilter + ' days');
      }
      if (q) {
        conditions.push('(title LIKE ? OR subtitle LIKE ? OR tag LIKE ?)');
        const qp = `%${q}%`;
        baseArgs.push(qp, qp, qp);
      }
      if (specialFeature) {
        conditions.push('COALESCE(special_feature, \'\') = ?');
        baseArgs.push(specialFeature);
      }
      if (tagFilter) {
        conditions.push("(',' || tag || ',') LIKE ('%,' || ? || ',%')");
        baseArgs.push(tagFilter);
      }
    }

    const WHERE      = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const postsQuery = allRequested && isAdmin
      ? `SELECT ${COLS} FROM posts ${WHERE} ${ORDER}`
      : `SELECT ${COLS} FROM posts ${WHERE} ${ORDER} LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) AS total FROM posts ${WHERE}`;

    const postsStmt = allRequested && isAdmin
      ? env.DB.prepare(postsQuery).bind(...baseArgs)
      : env.DB.prepare(postsQuery).bind(...baseArgs, pageSize, offset);
    const { results: posts }     = await postsStmt.all();
    const { results: countRows } = await env.DB.prepare(countQuery).bind(...baseArgs).all();
    const total = countRows[0]?.total ?? 0;
    const effectivePageSize = allRequested && isAdmin ? total : pageSize;

    const hydrated = (posts || []).map((post) => serializePostImage(post, origin));
    return json(
      { posts: hydrated, total, page, pageSize: effectivePageSize },
      200,
      isAdmin ? { 'Cache-Control': 'no-store' } : publicCacheHeaders(120, 600)
    );
  } catch (err) {
    console.error('GET /api/posts error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── POST /api/posts ───────────────────────────────────────────
// Creates a new post. Requires valid admin token.
export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  // Verify admin token
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, subtitle, content, image_url, image_caption, youtube_url, tag, meta_tags, special_feature, ai_assisted, publish_date, publish_at, cf_turnstile_response } = body;
  const category = normalizeCategory(body.category);

  // Verify Turnstile if a token is present (skipped gracefully if TURNSTILE_SECRET not configured)
  if (cf_turnstile_response !== undefined) {
    const turnstileOk = await verifyTurnstile(cf_turnstile_response, env);
    if (!turnstileOk) {
      return json({ error: 'CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.' }, 400);
    }
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / wosm / people)' }, 400);
  }
  if (!title || !title.trim()) {
    return json({ error: '제목을 입력해주세요' }, 400);
  }
  if (!content || !content.trim()) {
    return json({ error: '내용을 입력해주세요' }, 400);
  }

  const upgradedContent = await upgradeEditorContentImages(content.trim(), env, origin, 'inline');
  const storedCover = await storeDataImage(env, sanitizeUrl(image_url), origin, 'cover');
  const safeImageUrl  = storedCover.url;
  const safeImageCaption = sanitizeCaption(image_caption);
  const safeYoutubeUrl = sanitizeYouTubeUrl(youtube_url);
  const safeSubtitle  = (subtitle && typeof subtitle === 'string') ? subtitle.trim().slice(0, 300) : null;
  const safeTag       = (tag && typeof tag === 'string') ? tag.trim().slice(0, 200) : null;
  const safeSpecialFeature = sanitizeSpecialFeature(special_feature);
  const safeMetaTags  = (meta_tags && typeof meta_tags === 'string') ? meta_tags.trim().slice(0, 500) : null;

  const publishAtValue = normalizePublishAtInput(publish_at, publish_date);

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
    const sql = `INSERT INTO posts (category, title, subtitle, content, image_url, image_caption, youtube_url, tag, special_feature, meta_tags, author, ai_assisted, created_at, publish_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), COALESCE(?, datetime('now')), datetime('now'))
         RETURNING *`;
    const bindings = [category, title.trim(), safeSubtitle, upgradedContent, safeImageUrl, safeImageCaption, safeYoutubeUrl, safeTag, safeSpecialFeature, safeMetaTags, safeAuthor, safeAiAssisted, publishAtValue];
    const { results } = await env.DB.prepare(sql).bind(...bindings).all();

    if (results[0]) {
      await recordPostHistory(env, results[0].id, 'create', results[0], '게시글 생성');
    }
    return json({ post: results[0] }, 201);
  } catch (err) {
    console.error('POST /api/posts error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── Helpers ───────────────────────────────────────────────────

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

function sanitizeCaption(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

function normalizeCategory(value) {
  if (value === 'worm') return 'wosm';
  return value;
}

function normalizePublishAtInput(publishAt, publishDate) {
  const precise = String(publishAt || '').trim();
  if (precise) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(precise)) return `${precise} 12:00:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(precise)) return `${precise.replace('T', ' ')}:00`;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(precise)) return `${precise}:00`;
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(precise)) return precise.replace('T', ' ');
  }
  const fallback = String(publishDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) return `${fallback} 12:00:00`;
  return null;
}
