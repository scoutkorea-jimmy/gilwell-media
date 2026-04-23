/**
 * Gilwell Media · Posts Collection
 *
 * GET  /api/posts?category=korea&page=1   ← public, list posts
 * POST /api/posts                          ← admin only, create post
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { loadAdminSession, requirePublishAllowed } from '../../_shared/admin-permissions.js';
import { hasMenuPermission } from '../../_shared/admin-users.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../_shared/rate-limit.js';
import { sanitizeYouTubeUrl } from '../../_shared/youtube.js';
import { serializePostImage } from '../../_shared/images.js';
import { storeDataImage, upgradeEditorContentImages } from '../../_shared/image-storage.js';
import { recordPostHistory } from '../../_shared/post-history.js';
import { normalizePublishAtInput, optionalBooleanFlag, optionalTrimmedString, requireNonEmptyString } from '../../_shared/post-input.js';
import { sanitizeSpecialFeature } from '../../_shared/special-features.js';
import { purgeContentCache } from '../../_shared/cache-purge.js';
import { ensureDuePostsPublished } from '../../_shared/publish-due-posts.js';
import { VALID_POST_CATEGORIES } from '../../_shared/site-structure.mjs';
import { logOperationalEvent } from '../../_shared/ops-log.js';

const PAGE_SIZE = 16;

// ── GET /api/posts ────────────────────────────────────────────
// Returns a paginated list of posts (no full content body — just
// id, category, title, image_url, created_at for card display).
export async function onRequestGet({ request, env }) {
  const url          = new URL(request.url);
  const origin       = url.origin;
  await ensureDuePostsPublished(env, origin).catch((err) => {
    console.error('GET /api/posts auto publish error:', err);
  });
  const category     = normalizeCategory(url.searchParams.get('category') || null);
  const page         = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const requestedLimit = parseInt(url.searchParams.get('limit') || String(PAGE_SIZE), 10);
  const pageSize     = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : PAGE_SIZE));
  const offset       = (page - 1) * pageSize;
  const q            = url.searchParams.get('q') || null;
  const tagFilter    = url.searchParams.get('tag') || null;
  const startDate    = normalizeDateInput(url.searchParams.get('start_date'));
  const endDate      = normalizeDateInput(url.searchParams.get('end_date'));
  const featuredOnly = url.searchParams.get('featured') === '1';
  const specialFeature = sanitizeSpecialFeature(url.searchParams.get('special_feature'));
  const allRequested = url.searchParams.get('all') === '1';
  const daysFilter   = Math.max(0, parseInt(url.searchParams.get('days') || '0', 10));
  const sort         = normalizeSort(url.searchParams.get('sort'), !!q);
  const requestedOrderBy = String(url.searchParams.get('order_by') || '').trim().toLowerCase();
  const requestedOrderDir = String(url.searchParams.get('order_dir') || '').trim().toLowerCase();
  const publishedParam = normalizePublishedFilter(url.searchParams.get('published'));
  const adminScopeRequested = String(url.searchParams.get('scope') || '').trim().toLowerCase() === 'admin';
  // Limit query length to prevent abuse
  const safeQ = q ? q.slice(0, 200) : null;
  const compactQuery = safeQ ? safeQ.replace(/\s+/g, '') : '';
  const fuzzyQuery = safeQ ? '%' + safeQ.trim().split(/\s*/).filter(Boolean).join('%') + '%' : '';

  if (category && !VALID_POST_CATEGORIES.includes(category)) {
    return json({ error: 'Invalid category. Must be korea, apr, wosm, or people.' }, 400);
  }

  // Admin token check — if valid token, include unpublished posts
  const token   = extractToken(request);
  const isAdmin = adminScopeRequested && token
    ? await verifyTokenRole(token, env, 'full').catch(() => false)
    : false;

  // Search-heavy workload rate limit (non-admins only). We cap at 30 searches
  // per IP per minute — generous for humans, painful for abusive scrapers.
  if (!isAdmin && safeQ) {
    const rl = await enforceRateLimit(env, {
      route: 'posts-search',
      identity: getClientIp(request),
      limit: 30,
      windowSeconds: 60,
    });
    if (!rl.ok) return rateLimitResponse(rl, '검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  const PUBLIC_DATE_EXPR = "COALESCE(datetime(replace(publish_at, 'T', ' ')), datetime(publish_at), datetime(replace(created_at, 'T', ' ')), datetime(created_at))";
  const ORDER_LATEST = `ORDER BY ${PUBLIC_DATE_EXPR} DESC, id DESC`;
  const ORDER_OLDEST = `ORDER BY ${PUBLIC_DATE_EXPR} ASC, id ASC`;
  const ORDER_VIEWS = `ORDER BY views DESC, ${PUBLIC_DATE_EXPR} DESC, id DESC`;
  const ORDER_MANUAL = `ORDER BY sort_order IS NULL ASC, sort_order ASC, ${PUBLIC_DATE_EXPR} DESC, id DESC`;
  const searchScoreExpr = q
    ? `(
        CASE WHEN title LIKE ? THEN 60 ELSE 0 END +
        CASE WHEN replace(title, ' ', '') LIKE ? THEN 42 ELSE 0 END +
        CASE WHEN COALESCE(subtitle, '') LIKE ? THEN 35 ELSE 0 END +
        CASE WHEN COALESCE(tag, '') LIKE ? THEN 30 ELSE 0 END +
        CASE WHEN COALESCE(meta_tags, '') LIKE ? THEN 24 ELSE 0 END +
        CASE WHEN COALESCE(content, '') LIKE ? THEN 10 ELSE 0 END +
        CASE WHEN replace(COALESCE(title, ''), ' ', '') LIKE ? THEN 18 ELSE 0 END
      )`
    : '0';
  const ORDER_RELEVANCE = `ORDER BY search_score DESC, ${PUBLIC_DATE_EXPR} DESC, id DESC`;
  const adminOrder = isAdmin ? buildAdminOrder(requestedOrderBy, requestedOrderDir, PUBLIC_DATE_EXPR) : '';
  const useManualOrder = !adminOrder && ((allRequested && isAdmin) || (sort === 'manual' && !!category && !q && !tagFilter));
  const ORDER = useManualOrder
    ? ORDER_MANUAL
    : (adminOrder || (sort === 'oldest' ? ORDER_OLDEST : (sort === 'views' ? ORDER_VIEWS : ((sort === 'relevance' && q) ? ORDER_RELEVANCE : ORDER_LATEST))));
  const COLS  = `id, category, title, subtitle, image_url, image_caption, created_at, publish_at, updated_at, featured, tag, meta_tags, special_feature, views, author, published, sort_order,
    youtube_url,
    ${searchScoreExpr} AS search_score,
    (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes${isAdmin ? ',\n    (SELECT ROUND(AVG(engaged_seconds), 1) FROM post_engagement WHERE post_id = posts.id) AS avg_dwell_seconds' : ''}`;

  try {
    // Build WHERE conditions dynamically
    const conditions = [];
    const baseArgs   = [];
    const scoreArgs  = [];

    if (featuredOnly) {
      conditions.push('featured = 1', 'published = 1');
    } else {
      if (category)  { conditions.push('category = ?'); baseArgs.push(category); }
      if (!isAdmin)  {
        conditions.push('published = 1');
      } else if (publishedParam !== null) {
        conditions.push('published = ?');
        baseArgs.push(publishedParam);
      }
      if (daysFilter > 0) {
        conditions.push("datetime(COALESCE(publish_at, created_at)) >= datetime(?, ?)");
        baseArgs.push('now', '-' + daysFilter + ' days');
      }
      if (startDate) {
        conditions.push("date(COALESCE(publish_at, created_at)) >= date(?)");
        baseArgs.push(startDate);
      }
      if (endDate) {
        conditions.push("date(COALESCE(publish_at, created_at)) <= date(?)");
        baseArgs.push(endDate);
      }
      if (q) {
        conditions.push('(title LIKE ? OR replace(title, \' \', \'\') LIKE ? OR COALESCE(subtitle, \'\') LIKE ? OR COALESCE(tag, \'\') LIKE ? OR COALESCE(meta_tags, \'\') LIKE ? OR COALESCE(content, \'\') LIKE ? OR replace(COALESCE(title, \'\'), \' \', \'\') LIKE ?)');
        const qp = `%${q}%`;
        const cp = `%${compactQuery || q}%`;
        const fp = fuzzyQuery || qp;
        baseArgs.push(qp, cp, qp, qp, qp, qp, fp);
        scoreArgs.push(qp, cp, qp, qp, qp, qp, fp);
      }
      if (specialFeature) {
        conditions.push('COALESCE(special_feature, \'\') = ?');
        baseArgs.push(specialFeature);
      }
      if (tagFilter) {
        const tp = `%${tagFilter}%`;
        conditions.push("(COALESCE(tag, '') LIKE ? OR COALESCE(meta_tags, '') LIKE ?)");
        baseArgs.push(tp, tp);
      }
    }

    const WHERE      = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const postsQuery = allRequested && isAdmin
      ? `SELECT ${COLS} FROM posts ${WHERE} ${ORDER}`
      : `SELECT ${COLS} FROM posts ${WHERE} ${ORDER} LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) AS total FROM posts ${WHERE}`;

    const postsStmt = allRequested && isAdmin
      ? env.DB.prepare(postsQuery).bind(...scoreArgs, ...baseArgs)
      : env.DB.prepare(postsQuery).bind(...scoreArgs, ...baseArgs, pageSize, offset);
    const { results: posts }     = await postsStmt.all();
    const { results: countRows } = await env.DB.prepare(countQuery).bind(...baseArgs).all();
    const total = countRows[0]?.total ?? 0;
    const effectivePageSize = allRequested && isAdmin ? total : pageSize;

    const hydrated = (posts || []).map((post) => serializePostImage(post, origin));
    return json(
      { posts: hydrated, total, page, pageSize: effectivePageSize },
      200,
      { 'Cache-Control': 'no-store' }
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

  // Phase 4 auth: owner OR member with write:write permission.
  const session = await loadAdminSession(request, env);
  if (!session) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }
  if (!session.isOwner && !hasMenuPermission(session.permissions, 'write', 'write')) {
    return json({ error: '글 작성 권한이 없습니다. 오너에게 권한을 요청하세요.' }, 403);
  }

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, subtitle, content, image_url, image_caption, gallery_images, youtube_url, location_name, location_address, tag, meta_tags, special_feature, ai_assisted, publish_date, publish_at, manual_related_posts, cf_turnstile_response } = body;
  const category = normalizeCategory(body.category);

  // Verify Turnstile if a token is present (skipped gracefully if TURNSTILE_SECRET not configured)
  if (cf_turnstile_response !== undefined) {
    const turnstileOk = await verifyTurnstile(cf_turnstile_response, env);
    if (!turnstileOk) {
      return json({ error: 'CAPTCHA 인증에 실패했습니다. 다시 시도해주세요.' }, 400);
    }
  }

  if (!VALID_POST_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / wosm / people)' }, 400);
  }
  const safeTitleInput = requireNonEmptyString(title, '제목', 200);
  if (!safeTitleInput.ok) return json({ error: safeTitleInput.error }, 400);
  const safeContentInput = requireNonEmptyString(content, '내용');
  if (!safeContentInput.ok) return json({ error: safeContentInput.error }, 400);
  const safeSubtitleInput = optionalTrimmedString(subtitle, '부제', 300);
  if (!safeSubtitleInput.ok) return json({ error: safeSubtitleInput.error }, 400);
  const safeTagInput = optionalTrimmedString(tag, '태그', 200);
  if (!safeTagInput.ok) return json({ error: safeTagInput.error }, 400);
  const safeMetaTagsInput = optionalTrimmedString(meta_tags, '메타 태그', 500);
  if (!safeMetaTagsInput.ok) return json({ error: safeMetaTagsInput.error }, 400);
  const safeAuthorInput = body.author === undefined
    ? { ok: true, provided: false, value: null }
    : optionalTrimmedString(body.author, '작성자', 60);
  if (!safeAuthorInput.ok) return json({ error: safeAuthorInput.error }, 400);
  const safePublishedInput = optionalBooleanFlag(body.published);
  if (!safePublishedInput.ok) return json({ error: safePublishedInput.error }, 400);
  const safeFeaturedInput = optionalBooleanFlag(body.featured);
  if (!safeFeaturedInput.ok) return json({ error: safeFeaturedInput.error }, 400);

  const upgradedContent = await safelyUpgradeEditorContentImages(safeContentInput.value, env, origin, 'inline');
  const resolvedCoverSource = sanitizeUrl(body.image_data, origin) || sanitizeUrl(image_url, origin);
  const storedCover = await safelyStoreDataImage(env, resolvedCoverSource, origin, 'cover');
  const storedGalleryImages = await storeGalleryImages(env, gallery_images, origin);
  const safeImageUrl  = storedCover.url;
  const safeImageCaption = sanitizeCaption(image_caption);
  const safeYoutubeUrl = sanitizeYouTubeUrl(youtube_url);
  const safeSubtitle  = safeSubtitleInput.value;
  const safeTag       = safeTagInput.value;
  const safeLocationName = sanitizeShortText(location_name, 120);
  const safeLocationAddress = sanitizeShortText(location_address, 300);
  const safeSpecialFeature = sanitizeSpecialFeature(special_feature);
  const safeMetaTags  = safeMetaTagsInput.value;
  const safeManualRelatedPosts = normalizeManualRelatedPosts(manual_related_posts || body.related_posts_json);

  const publishAtValue = normalizePublishAtInput(publish_at, publish_date);
  const safePublished = safePublishedInput.provided ? safePublishedInput.value : true;
  const safeFeatured = safePublished && safeFeaturedInput.provided ? safeFeaturedInput.value : false;
  const effectivePublishAt = resolveStoredPublishAt({
    published: safePublished,
    requestedPublishAt: publishAtValue,
    existingPublishAt: '',
  });

  // Phase 4 publish kill switch — block member publishes when global switch is on.
  if (safePublished && !session.isOwner) {
    const gate = await requirePublishAllowed(env, session);
    if (gate.error) return gate.error;
  }

  // Byline derivation (Phase 5):
  //   Strict editor_code only. display_name is internal (admin console) and
  //   must never leak to public bylines. body.author is ignored — owner-level
  //   byline overrides happen via author_user_id reassignment (owner assigns
  //   any admin_user as the author, and that user's editor_code becomes the
  //   byline automatically).
  const authorUserId = session.user ? Number(session.user.id) : null;
  let safeAuthor = (session.user && session.user.editor_code) || null;
  if (!safeAuthor) {
    // Fall back to the site-wide default editor code. This catches the case
    // where a newly created member has not yet been assigned an editor_code
    // by the owner — posts still publish with a safe neutral byline.
    try {
      const authorRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'author_name'`).first();
      safeAuthor = authorRow?.value || 'Editor.A';
    } catch { safeAuthor = 'Editor.A'; }
  }

  const safeAiAssisted = ai_assisted ? 1 : 0;

  try {
    if (safeFeatured) {
      const featuredCountRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE featured = 1 AND published = 1`).first();
      const featuredCount = Number(featuredCountRow && featuredCountRow.n || 0);
      if (featuredCount >= 4) {
        return json({ error: '에디터 추천은 최대 4개까지만 선택할 수 있습니다.' }, 409);
      }
    }
    const sql = `INSERT INTO posts (category, title, subtitle, content, image_url, image_caption, gallery_images, youtube_url, location_name, location_address, tag, special_feature, meta_tags, manual_related_posts, author, author_user_id, ai_assisted, published, featured, created_at, publish_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`;
    const bindings = [category, safeTitleInput.value, safeSubtitle, upgradedContent, safeImageUrl, safeImageCaption, serializeGalleryImages(storedGalleryImages), safeYoutubeUrl, safeLocationName, safeLocationAddress, safeTag, safeSpecialFeature, safeMetaTags, safeManualRelatedPosts, safeAuthor, authorUserId, safeAiAssisted, safePublished ? 1 : 0, safeFeatured ? 1 : 0, effectivePublishAt];
    const result = await env.DB.prepare(sql).bind(...bindings).run();
    const insertedId = result && result.meta ? Number(result.meta.last_row_id || result.meta.lastRowId || 0) : 0;
    const insertedPost = insertedId
      ? await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(insertedId).first()
      : null;

    if (insertedPost) {
      await recordPostHistory(env, insertedPost.id, 'create', null, insertedPost, '게시글 생성');
      await logOperationalEvent(env, {
        channel: 'admin',
        type: 'post_created',
        level: 'info',
        actor: (session.username || safeAuthor || 'admin'),
        path: '/api/posts',
        message: '게시글 생성 · ' + String(insertedPost.title || ''),
        details: {
          post_id: insertedPost.id,
          category: insertedPost.category || category,
          published: Number(insertedPost.published || 0) === 1,
        },
      });
      await purgeContentCache(env, origin, { postId: insertedPost.id, categories: [insertedPost.category] }).catch(function (err) {
        console.error('POST /api/posts cache purge error:', err);
      });
    }
    return json({ post: insertedPost }, 201);
  } catch (err) {
    console.error('POST /api/posts error:', err);
    const message = err && err.message ? String(err.message) : 'Database error';
    return json({ error: message }, 500);
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
function sanitizeUrl(url, origin) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  try {
    const parsed = origin ? new URL(trimmed, origin) : new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch { /* fall through */ }
  return null;
}

function sanitizeCaption(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

function normalizeGalleryImages(rawItems) {
  if (typeof rawItems === 'string') {
    try {
      return normalizeGalleryImages(JSON.parse(rawItems));
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map(function (item) {
    if (typeof item === 'string') return { url: item, caption: '' };
    return {
      url: item && typeof item.url === 'string' ? item.url : '',
      caption: item && typeof item.caption === 'string' ? item.caption : '',
    };
  }).filter(function (item) {
    return item.url;
  }).slice(0, 10);
}

async function storeGalleryImages(env, rawItems, origin) {
  const items = normalizeGalleryImages(rawItems);
  const stored = [];
  for (const item of items) {
    const source = sanitizeUrl(item.url, origin);
    if (!source) continue;
    const saved = await safelyStoreDataImage(env, source, origin, 'gallery');
    if (!saved.url) continue;
    stored.push({
      url: saved.url,
      caption: sanitizeCaption(item.caption) || '',
    });
  }
  return stored.slice(0, 10);
}

async function safelyStoreDataImage(env, value, origin, prefix) {
  try {
    return await storeDataImage(env, value, origin, prefix);
  } catch (err) {
    console.error('safelyStoreDataImage error:', err);
    // If the upload source is a data: URL and it failed (unsupported MIME,
    // malformed base64, etc.), do NOT echo it back into the DB — that would
    // persist e.g. an SVG/script payload as the stored image_url.
    if (typeof value === 'string' && value.trim().startsWith('data:')) {
      return { url: null, key: '' };
    }
    return { url: value || null, key: '' };
  }
}

async function safelyUpgradeEditorContentImages(content, env, origin, prefix) {
  try {
    return await upgradeEditorContentImages(content, env, origin, prefix);
  } catch (err) {
    console.error('safelyUpgradeEditorContentImages error:', err);
    return content;
  }
}

function serializeGalleryImages(items) {
  return items && items.length ? JSON.stringify(items) : null;
}

function normalizeCategory(value) {
  if (value === 'worm') return 'wosm';
  return value;
}

function normalizeDateInput(value) {
  var trimmed = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeSort(value, hasSearch) {
  var normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'oldest') return 'oldest';
  if (normalized === 'views') return 'views';
  if (normalized === 'manual') return 'manual';
  if (normalized === 'relevance' && hasSearch) return 'relevance';
  return 'latest';
}

function normalizePublishedFilter(value) {
  if (value === '1' || value === 1 || value === true || value === 'true' || value === 'published') return 1;
  if (value === '0' || value === 0 || value === false || value === 'false' || value === 'draft') return 0;
  return null;
}

function buildAdminOrder(orderBy, orderDir, publicDateExpr) {
  const key = String(orderBy || '').trim().toLowerCase();
  if (!key) return '';
  const dir = String(orderDir || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  if (key === 'upload') return `ORDER BY datetime(replace(created_at, 'T', ' ')) ${dir}, id ${dir}`;
  if (key === 'date') return `ORDER BY ${publicDateExpr} ${dir}, id ${dir}`;
  if (key === 'views') return `ORDER BY views ${dir}, ${publicDateExpr} DESC, id DESC`;
  if (key === 'title') return `ORDER BY LOWER(COALESCE(title, '')) ${dir}, ${publicDateExpr} DESC, id DESC`;
  if (key === 'category') return `ORDER BY LOWER(COALESCE(category, '')) ${dir}, ${publicDateExpr} DESC, id DESC`;
  return '';
}

function normalizeManualRelatedPosts(raw) {
  if (typeof raw === 'string') {
    try {
      return normalizeManualRelatedPosts(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  var seen = new Set();
  var ids = raw.map(function (item) {
    return typeof item === 'object' && item ? item.id : item;
  }).map(function (value) {
    return parseInt(value, 10);
  }).filter(function (value) {
    if (!Number.isFinite(value) || value < 1 || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).slice(0, 5);
  return ids.length ? JSON.stringify(ids) : null;
}

function sanitizeShortText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function resolveStoredPublishAt(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const published = !!opts.published;
  const requested = String(opts.requestedPublishAt || '').trim();
  const existing = String(opts.existingPublishAt || '').trim();
  if (published) return requested || existing || nowKstText();
  if (requested) return isFuturePublishAt(requested) ? requested : null;
  if (existing) return isFuturePublishAt(existing) ? existing : null;
  return null;
}

function isFuturePublishAt(value) {
  const normalized = normalizeSqlDateTime(value);
  if (!normalized) return false;
  return normalized > nowKstText();
}

function nowKstText() {
  const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeSqlDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text.replace('T', ' ') + ':00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) return text.replace('T', ' ');
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return '';
  const shifted = new Date(parsed + (9 * 60 * 60 * 1000));
  return shifted.toISOString().slice(0, 19).replace('T', ' ');
}
