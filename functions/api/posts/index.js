import { isPlaceholderAuthor } from '../../_shared/post-author.js';
/**
 * Gilwell Media · Posts Collection
 *
 * GET  /api/posts?category=korea&page=1   ← public, list posts
 * POST /api/posts                          ← admin only, create post
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { loadAdminSession, requirePublishAllowed, requireMenu } from '../../_shared/admin-permissions.js';
import { hasMenuPermission } from '../../_shared/admin-users.js';
import { verifyTurnstile } from '../../_shared/turnstile.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../_shared/rate-limit.js';
import { serializeImageFrameForStoreRust } from '../../_shared/image-frame.js';
import { storeDataImage, upgradeEditorContentImages } from '../../_shared/image-storage.js';
import { normalizePublishAtInput, validatePostText, encodePostBindings } from '../../_shared/post-input.js';
import { PUBLIC_DATE_EXPR } from '../../_shared/post-public-date.js';
import { purgeContentCache } from '../../_shared/cache-purge.js';
import { ensureDuePostsPublished } from '../../_shared/publish-due-posts.js';
import { VALID_POST_CATEGORIES } from '../../_shared/site-structure.mjs';
import { logOperationalEvent } from '../../_shared/ops-log.js';
import { queryRust, singleSetting, postAdminRead } from '../../_shared/rust-server.js';

// ── GET /api/posts ────────────────────────────────────────────
// Returns a paginated list of posts (no full content body — just
// id, category, title, image_url, created_at for card display).
export async function onRequestGet(context) {
  const { request, env } = context;
  const url          = new URL(request.url);
  const origin       = url.origin;
  await ensureDuePostsPublished(env, origin).catch((err) => {
    console.error('GET /api/posts auto publish error:', err);
  });
  const category     = normalizeCategory(url.searchParams.get('category') || null);
  const page = url.searchParams.get('page');
  const pageSize = url.searchParams.get('limit');
  const q            = url.searchParams.get('q') || null;
  const tagFilter    = url.searchParams.get('tag') || null;
  const startDate    = url.searchParams.get('start_date');
  const endDate      = url.searchParams.get('end_date');
  const featuredOnly = url.searchParams.get('featured');
  const rawFeature = url.searchParams.get('special_feature');
  const specialFeature = rawFeature;
  const allRequested = url.searchParams.get('all');
  const days = url.searchParams.get('days');
  const sort = url.searchParams.get('sort');
  const popularPeriod = url.searchParams.get('period');
  const requestedOrderBy = url.searchParams.get('order_by');
  const requestedOrderDir = url.searchParams.get('order_dir');
  const publishedParam = url.searchParams.get('published');
  const adminScopeRequested = String(url.searchParams.get('scope') || '').trim().toLowerCase() === 'admin';
  // Limit query length to prevent abuse
  const safeQ = q ? q.slice(0, 200) : null;

  if (category && !VALID_POST_CATEGORIES.includes(category)) {
    return json({ error: 'Invalid category. Must be korea, apr, wosm, or people.' }, 400);
  }

  // Admin token check — if valid token, include unpublished posts
  const token   = extractToken(request);
  const isAdmin = adminScopeRequested && token
    ? await verifyTokenRole(token, env, 'full').catch(() => false)
    : false;
  // includeDwell: 평균 체류 시간(avg_dwell_seconds) 노출 권한.
  // isAdmin('full' 전용) 보다 더 넓게 — 멤버 토큰('member')도 게시글 목록
  // 패널에 들어왔다면(=view:list 권한 통과) 운영 데이터 일관성 위해 dwell 함께 응답.
  // 비공개 글 SELECT 등 다른 admin 전용 기능은 isAdmin 게이트 그대로 유지.
  const includeDwell = adminScopeRequested && token
    ? (isAdmin || !(await requireMenu(request, env, 'list', 'view')).error)
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

  try {
    const rust = await queryRust(context, 'posts', {
      category, page, pageSize, q, tagFilter,
      startDate, endDate, featuredOnly, specialFeature, allRequested, days,
      sort, popularPeriod, requestedOrderBy, requestedOrderDir,
      publishedParam, isAdmin, includeDwell, publicDateExpr: PUBLIC_DATE_EXPR, origin,
    });
    if (!rust.ok) return json({ error: 'Database error' }, 500);
    const result = await rust.json();
    return json(result, 200, { 'Cache-Control': 'no-store' });
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
  if (!session.isOwner && !session.permissions.access_admin) return json({ error: '관리자 접근 권한이 없습니다.' }, 403);
  if (!session.isOwner && !hasMenuPermission(session.permissions, 'write', 'write')) {
    return json({ error: '글 작성 권한이 없습니다. 오너에게 권한을 요청하세요.' }, 403);
  }

  // Per-user article-create burst guard. Owners and writers don't legitimately
  // publish 20 articles in a minute; a runaway script or compromised editor
  // account would. Threshold is intentionally generous for normal use.
  const uid = session.uid || session.username || 'admin';
  const rl = await enforceRateLimit(env, {
    route: 'posts-create',
    identity: `uid:${uid}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl, '글 작성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');

  // Parse and validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, subtitle, content, image_url, image_caption, image_frame, gallery_images, youtube_url, location_name, location_address, tag, meta_tags, special_feature, ai_assisted, publish_date, publish_at, manual_related_posts, cf_turnstile_response } = body;
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
  const textInputs = await validatePostText(env, body, true);
  const safeTitleInput = textInputs.title;
  if (!safeTitleInput.ok) return json({ error: safeTitleInput.error }, 400);
  const safeContentInput = textInputs.content;
  if (!safeContentInput.ok) return json({ error: safeContentInput.error }, 400);
  const safeSubtitleInput = textInputs.subtitle;
  if (!safeSubtitleInput.ok) return json({ error: safeSubtitleInput.error }, 400);
  const safeTagInput = textInputs.tag;
  if (!safeTagInput.ok) return json({ error: safeTagInput.error }, 400);
  const safeMetaTagsInput = textInputs.meta_tags;
  if (!safeMetaTagsInput.ok) return json({ error: safeMetaTagsInput.error }, 400);
  const safeAuthorInput = textInputs.author;
  if (!safeAuthorInput.ok) return json({ error: safeAuthorInput.error }, 400);
  if (isPlaceholderAuthor(safeAuthorInput.value)) return json({ error: '작성자 불러오기가 끝난 뒤 다시 저장해주세요.' }, 400);
  const safePublishedInput = textInputs.published;
  if (!safePublishedInput.ok) return json({ error: safePublishedInput.error }, 400);
  const safeFeaturedInput = textInputs.featured;
  if (!safeFeaturedInput.ok) return json({ error: safeFeaturedInput.error }, 400);

  const upgradedContent = await safelyUpgradeEditorContentImages(safeContentInput.value, env, origin, 'inline');
  const resolvedCoverSource = sanitizeUrl(body.image_data, origin) || sanitizeUrl(image_url, origin);
  const storedCover = await safelyStoreDataImage(env, resolvedCoverSource, origin, 'cover');
  const storedGalleryImages = await storeGalleryImages(env, gallery_images, origin);
  const safeImageUrl  = storedCover.url;
  const safeImageCaption = textInputs.image_caption;
  const safeImageFrame = await serializeImageFrameForStoreRust(image_frame, env);
  const safeYoutubeUrl = textInputs.youtube_url;
  const safeSubtitle  = safeSubtitleInput.value;
  const safeTag       = safeTagInput.value;
  const safeLocationName = textInputs.location_name;
  const safeLocationAddress = textInputs.location_address;
  const safeSpecialFeature = textInputs.special_feature;
  const safeMetaTags  = safeMetaTagsInput.value;
  const safeManualRelatedPosts = normalizeManualRelatedPosts(manual_related_posts || body.related_posts_json);

  const publishAtValue = textInputs.publish_at === null ? normalizePublishAtInput(publish_at, publish_date) : textInputs.publish_at;
  const safePublished = safePublishedInput.provided ? safePublishedInput.value : true;
  const safeFeatured = safePublished && safeFeaturedInput.provided ? safeFeaturedInput.value : false;
  const effectivePublishAt = resolveStoredPublishAt({
    published: safePublished,
    requestedPublishAt: publishAtValue,
    existingPublishAt: '',
  });

  // Phase 4 publish kill switch — block member publishes when global switch is on.
  const publishGuard = !session.isOwner && (!!safePublished || isFuturePublishAt(effectivePublishAt));
  if (publishGuard) {
    const gate = await requirePublishAllowed(env, session);
    if (gate.error) return gate.error;
  }

  const authorUserId = session.user ? Number(session.user.id) : null;
  let safeAuthor = (session.user && session.user.editor_code) || null;

  if (safeAuthorInput.provided && safeAuthorInput.value) {
    const editorMatch = safeAuthorInput.value.match(/^Editor\.([A-Z])$/);
    if (editorMatch) {
      try {
        const editorsRow = await singleSetting(env, 'editors');
        const editors = editorsRow ? JSON.parse(editorsRow.value) : {};
        const letter = editorMatch[1];
        const REQUIRED = { A: true, B: true, C: true };
        if (REQUIRED[letter] || (editors[letter] && editors[letter].trim())) {
          safeAuthor = safeAuthorInput.value;
        }
      } catch { /* fall through to default */ }
    }
  }

  if (!safeAuthor) {
    try {
      const authorRow = await singleSetting(env, 'author_name');
      safeAuthor = authorRow?.value || 'Editor.A';
    } catch { safeAuthor = 'Editor.A'; }
  }

  const safeAiAssisted = ai_assisted ? 1 : 0;

  try {
    if (safeFeatured) {
      const featuredCountRow = await postAdminRead(env, 'featured-count');
      const featuredCount = Number(featuredCountRow && featuredCountRow.n || 0);
      if (featuredCount >= 4) {
        return json({ error: '에디터 추천은 최대 4개까지만 선택할 수 있습니다.' }, 409);
      }
    }
    const bindings = [category, safeTitleInput.value, safeSubtitle, upgradedContent, safeImageUrl, safeImageCaption, safeImageFrame, serializeGalleryImages(storedGalleryImages), safeYoutubeUrl, safeLocationName, safeLocationAddress, safeTag, safeSpecialFeature, safeMetaTags, safeManualRelatedPosts, safeAuthor, authorUserId, safeAiAssisted, safePublished ? 1 : 0, safeFeatured ? 1 : 0, effectivePublishAt];
    if (bindings.some(value => value === undefined)) throw new Error('D1_TYPE_ERROR: undefined post binding');
    const rust = await queryRust({ request, env }, 'post-create', { bindings:encodePostBindings(bindings), publishGuard, memberGuardUid:session.isOwner ? null : Number(session.uid), tokenGuard:{uid:session.uid ? Number(session.uid) : null,iat:Number(session.payload.iat) || 0,exp:Number.isFinite(Number(session.payload.exp)) ? Number(session.payload.exp) : null} });
    if (!rust.ok) throw new Error('Rust post creation failed');
    const { id: insertedId, featuredLimit, publishBlocked, accessRevoked, sessionRevoked } = await rust.json();
    if (sessionRevoked) return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
    if (accessRevoked) return json({ error: '글 작성 권한이 없습니다. 오너에게 권한을 요청하세요.' }, 403);
    if (publishBlocked) return json({ error: '현재 공개 전환이 차단되어 있습니다. 오너 승인 후 다시 시도해주세요.' }, 403);
    if (featuredLimit) return json({ error: '에디터 추천은 최대 4개까지만 선택할 수 있습니다.' }, 409);
    const insertedPost = insertedId
      ? await postAdminRead(env, 'post', insertedId)
      : null;

    if (insertedPost) {
      await logOperationalEvent(env, {
        channel: 'admin',
        type: 'post_created',
        level: 'info',
        actor: (session.username || safeAuthor || 'unknown'),
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
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
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
