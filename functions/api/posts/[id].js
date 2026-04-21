/**
 * Gilwell Media · Single Post
 *
 * GET    /api/posts/:id   ← public, fetch full post
 * PUT    /api/posts/:id   ← admin only, update post
 * DELETE /api/posts/:id   ← admin only, delete post
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { loadAdminSession, requirePublishAllowed, sessionOwnsPost } from '../../_shared/admin-permissions.js';
import { hasMenuPermission } from '../../_shared/admin-users.js';
import { getLikeStats, getViewerKey, isLikelyNonHumanRequest, recordUniqueView } from '../../_shared/engagement.js';
import { sanitizeYouTubeUrl } from '../../_shared/youtube.js';
import { serializePostImage } from '../../_shared/images.js';
import { deleteStoredImageByUrl, storeDataImage, upgradeEditorContentImages } from '../../_shared/image-storage.js';
import { findManualRelatedPosts, findRelatedPosts, parseManualRelatedIds } from '../../_shared/related-posts.js';
import { recordPostHistory } from '../../_shared/post-history.js';
import { normalizePublishAtInput, optionalBooleanFlag, optionalIntegerOrNull, optionalTrimmedString, requireNonEmptyString } from '../../_shared/post-input.js';
import { findSpecialFeaturePosts, sanitizeSpecialFeature } from '../../_shared/special-features.js';
import { purgeContentCache } from '../../_shared/cache-purge.js';
import { ensureDuePostsPublished } from '../../_shared/publish-due-posts.js';
import { VALID_POST_CATEGORIES } from '../../_shared/site-structure.mjs';
import { logOperationalEvent } from '../../_shared/ops-log.js';

// ── GET /api/posts/:id ────────────────────────────────────────
// Returns the full post including content body.
export async function onRequestGet({ params, env, request }) {
  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);
  await ensureDuePostsPublished(env, new URL(request.url).origin).catch((err) => {
    console.error('GET /api/posts/:id auto publish error:', err);
  });

  try {
    const post = await env.DB.prepare(
      `SELECT * FROM posts WHERE id = ?`
    ).bind(id).first();

    if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

    const token = extractToken(request);
    const isAdmin = token ? await verifyTokenRole(token, env, 'full').catch(() => false) : false;

    // If unpublished, require admin token
    if (post.published === 0) {
      if (!isAdmin) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    }

    const viewerKey = await getViewerKey(request, env);
    if (!isAdmin && !isLikelyNonHumanRequest(request)) {
      const counted = await recordUniqueView(env, id, viewerKey).catch(() => false);
      if (counted) post.views = (post.views || 0) + 1;
    }
    const [likeStats, relatedPosts, manualRelatedPosts, specialFeaturePosts] = await Promise.all([
      getLikeStats(env, id, viewerKey),
      findRelatedPosts(env, post, 5),
      findManualRelatedPosts(env, post, 5),
      findSpecialFeaturePosts(env, post, 50),
    ]);
    post.likes = likeStats.likes;
    post.liked = likeStats.liked;
    post.related_posts = relatedPosts;
    post.manual_related_posts = manualRelatedPosts;
    post.manual_related_post_ids = parseManualRelatedIds(post.manual_related_posts);
    post.related_posts_json = post.manual_related_posts || JSON.stringify(post.manual_related_post_ids || []);
    post.special_feature_posts = specialFeaturePosts;

    const origin = new URL(request.url).origin;
    return json({ post: isAdmin ? post : sanitizePublicPost(serializePostImage(post, origin)) });
  } catch (err) {
    console.error('GET /api/posts/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// Whitelist of post columns safe to expose to non-admin viewers. Any column not
// listed here (e.g. operational/audit fields that get added later) stays server-
// side by default, which is the behavior we want.
const PUBLIC_POST_FIELDS = [
  'id', 'category', 'title', 'subtitle', 'content',
  'image_url', 'image_caption', 'image_is_placeholder', 'image_has_real_asset',
  'gallery_images', 'youtube_url', 'location_name', 'location_address',
  'tag', 'author', 'ai_assisted',
  'created_at', 'publish_at', 'updated_at',
  'views', 'likes', 'liked',
  'special_feature', 'meta_tags',
  'related_posts', 'manual_related_posts', 'manual_related_post_ids',
  'related_posts_json', 'special_feature_posts',
];

function sanitizePublicPost(post) {
  if (!post || typeof post !== 'object') return post;
  const out = {};
  for (const key of PUBLIC_POST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(post, key)) {
      out[key] = post[key];
    }
  }
  return out;
}

// ── PUT /api/posts/:id ────────────────────────────────────────
// Updates an existing post. Owner may edit any post; members with
// write:list or write:write may only edit posts where author_user_id = self.
export async function onRequestPut({ params, request, env }) {
  const origin = new URL(request.url).origin;

  const session = await loadAdminSession(request, env);
  if (!session) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  let currentPost = null;
  try {
    currentPost = await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
  } catch (_) {}
  if (!currentPost) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

  // Phase 4 authorization:
  //   owner  → full control
  //   member → needs write:list OR write:write AND must be the author.
  //            Unauthored (legacy) posts can only be edited by owner.
  if (!session.isOwner) {
    const hasWrite = hasMenuPermission(session.permissions, 'list', 'write')
                  || hasMenuPermission(session.permissions, 'write', 'write');
    if (!hasWrite) {
      return json({ error: '게시글 수정 권한이 없습니다.' }, 403);
    }
    if (!sessionOwnsPost(session, currentPost)) {
      return json({ error: '본인이 작성한 글만 수정할 수 있습니다.' }, 403);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, subtitle, content, image_url, image_caption, gallery_images, youtube_url, location_name, location_address, meta_tags, tag, special_feature, author, ai_assisted, publish_date, publish_at, manual_related_posts, sort_order } = body;
  const category = normalizeCategory(body.category);

  // Validate only fields that are actually provided
  if (category !== undefined && !VALID_POST_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / wosm / people)' }, 400);
  }
  const safeTitleInput = title === undefined ? { ok: true, provided: false, value: undefined } : requireNonEmptyString(title, '제목', 200);
  if (!safeTitleInput.ok) return json({ error: safeTitleInput.error }, 400);
  const safeContentInput = content === undefined ? { ok: true, provided: false, value: undefined } : requireNonEmptyString(content, '내용');
  if (!safeContentInput.ok) return json({ error: safeContentInput.error }, 400);
  const safeSubtitleInput = optionalTrimmedString(subtitle, '부제', 300);
  if (!safeSubtitleInput.ok) return json({ error: safeSubtitleInput.error }, 400);
  const safeMetaTagsInput = optionalTrimmedString(meta_tags, '메타 태그', 500);
  if (!safeMetaTagsInput.ok) return json({ error: safeMetaTagsInput.error }, 400);
  const safeTagInput = optionalTrimmedString(tag, '태그', 200);
  if (!safeTagInput.ok) return json({ error: safeTagInput.error }, 400);
  const safeAuthorInput = optionalTrimmedString(author, '작성자', 60);
  if (!safeAuthorInput.ok) return json({ error: safeAuthorInput.error }, 400);
  const safeSortOrderInput = optionalIntegerOrNull(sort_order, '정렬 순서');
  if (!safeSortOrderInput.ok) return json({ error: safeSortOrderInput.error }, 400);
  const safeAiAssistedInput = optionalBooleanFlag(ai_assisted);
  if (!safeAiAssistedInput.ok) return json({ error: safeAiAssistedInput.error }, 400);
  const safePublishedInput = optionalBooleanFlag(body.published);
  if (!safePublishedInput.ok) return json({ error: safePublishedInput.error }, 400);
  const safeFeaturedInput = optionalBooleanFlag(body.featured);
  if (!safeFeaturedInput.ok) return json({ error: safeFeaturedInput.error }, 400);

  // Phase 2 publish kill switch: when global setting is 'on', only owner can
  // flip a post into public visibility. Members trying to publish hit 403.
  // Unpublishing (published=false) stays allowed so writers can always hide.
  if (safePublishedInput.provided && safePublishedInput.value === true) {
    const session = await loadAdminSession(request, env);
    const gate = await requirePublishAllowed(env, session);
    if (gate.error) return gate.error;
  }

  // Build dynamic SET clause from provided fields
  const fields = [];
  const values = [];

  if (category  !== undefined) { fields.push('category = ?');   values.push(category); }
  if (safeTitleInput.provided) { fields.push('title = ?'); values.push(safeTitleInput.value); }
  if (safeSubtitleInput.provided) { fields.push('subtitle = ?'); values.push(safeSubtitleInput.value); }
  if (content   !== undefined) {
    const upgradedContent = await safelyUpgradeEditorContentImages(safeContentInput.value, env, origin, 'inline');
    fields.push('content = ?');
    values.push(upgradedContent);
  }
  let oldImageToDelete = '';
  let oldGalleryToDelete = [];
  if (image_url !== undefined || body.image_data !== undefined) {
    const storedCover = await safelyStoreDataImage(env, sanitizeUrl(body.image_data, origin) || sanitizeUrl(image_url, origin), origin, 'cover');
    fields.push('image_url = ?');
    values.push(storedCover.url);
    if (currentPost && currentPost.image_url && currentPost.image_url !== storedCover.url) {
      oldImageToDelete = currentPost.image_url;
    }
  }
  if (gallery_images !== undefined) {
    const storedGalleryImages = await storeGalleryImages(env, gallery_images, origin);
    fields.push('gallery_images = ?');
    values.push(serializeGalleryImages(storedGalleryImages));
    oldGalleryToDelete = diffRemovedGalleryUrls(currentPost && currentPost.gallery_images, storedGalleryImages);
  }
  if (image_caption !== undefined) { fields.push('image_caption = ?'); values.push(sanitizeCaption(image_caption)); }
  if (youtube_url !== undefined) { fields.push('youtube_url = ?'); values.push(sanitizeYouTubeUrl(youtube_url)); }
  if (location_name !== undefined) { fields.push('location_name = ?'); values.push(sanitizeShortText(location_name, 120)); }
  if (location_address !== undefined) { fields.push('location_address = ?'); values.push(sanitizeShortText(location_address, 300)); }
  if (safeMetaTagsInput.provided) { fields.push('meta_tags = ?'); values.push(safeMetaTagsInput.value); }
  if (safeTagInput.provided) { fields.push('tag = ?'); values.push(safeTagInput.value); }
  if (special_feature !== undefined) { fields.push('special_feature = ?'); values.push(sanitizeSpecialFeature(special_feature)); }
  // Phase 5: byline is strictly derived from the authoring user's editor_code.
  // Owners can reassign author by changing body.author_user_id; the byline is
  // then recomputed from that user. display_name is never exposed publicly.
  if (body.author_user_id !== undefined && session.isOwner) {
    const nextAuthorUid = Number(body.author_user_id);
    if (Number.isFinite(nextAuthorUid) && nextAuthorUid > 0) {
      const authorRow = await env.DB.prepare(
        `SELECT id, editor_code FROM admin_users WHERE id = ? AND status != 'deleted'`
      ).bind(nextAuthorUid).first();
      if (!authorRow) return json({ error: '지정한 작성자 계정을 찾을 수 없습니다.' }, 400);
      fields.push('author_user_id = ?');
      values.push(nextAuthorUid);
      fields.push('author = ?');
      values.push(authorRow.editor_code || 'Editor.A');
    } else if (body.author_user_id === null) {
      fields.push('author_user_id = ?');
      values.push(null);
    }
  }
  // Legacy free-text body.author is ignored for non-owner (prevents
  // impersonation) and for owner (byline comes from author_user_id).
  if (safeAiAssistedInput.provided) { fields.push('ai_assisted = ?');  values.push(safeAiAssistedInput.value); }
  if (safeSortOrderInput.provided) { fields.push('sort_order = ?'); values.push(safeSortOrderInput.value); }
  if (manual_related_posts !== undefined || body.related_posts_json !== undefined) {
    fields.push('manual_related_posts = ?');
    values.push(normalizeManualRelatedPosts(manual_related_posts !== undefined ? manual_related_posts : body.related_posts_json));
  }
  const normalizedPublishAt = normalizePublishAtInput(publish_at, publish_date);

  if (fields.length === 0) {
    return json({ error: '변경할 내용을 입력해주세요' }, 400);
  }

  // Always update the timestamp
  fields.push("updated_at = datetime('now')");

  try {
    var nextPublished = safePublishedInput.provided ? safePublishedInput.value : !!(currentPost && currentPost.published);
    var nextFeatured = safeFeaturedInput.provided ? safeFeaturedInput.value : !!(currentPost && currentPost.featured);
    if (!nextPublished) nextFeatured = false;
    if (publish_at !== undefined || publish_date !== undefined || safePublishedInput.provided) {
      const effectivePublishAt = resolveStoredPublishAt({
        published: nextPublished,
        requestedPublishAt: normalizedPublishAt,
        existingPublishAt: currentPost && currentPost.publish_at,
      });
      fields.push('publish_at = ?');
      values.push(effectivePublishAt);
    }
    if (safePublishedInput.provided) {
      fields.push('published = ?');
      values.push(nextPublished ? 1 : 0);
    }
    if (safeFeaturedInput.provided || (safePublishedInput.provided && !nextFeatured && currentPost && Number(currentPost.featured || 0) === 1)) {
      fields.push('featured = ?');
      values.push(nextFeatured ? 1 : 0);
    }
    const wasPublicFeatured = Number(currentPost && currentPost.featured || 0) === 1 && Number(currentPost && currentPost.published || 0) === 1;
    if (nextFeatured && !wasPublicFeatured) {
      const featuredCountRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE featured = 1 AND published = 1`).first();
      const featuredCount = Number(featuredCountRow && featuredCountRow.n || 0);
      if (featuredCount >= 4) {
        return json({ error: '에디터 추천은 최대 4개까지만 선택할 수 있습니다.' }, 409);
      }
      // 메인 스토리 ↔ 에디터 추천 동시 지정 허용(2026-04-19). 배타 체크 제거.
    }
    const updatedPost = await runPostUpdate(env, id, fields, values);
    if (!updatedPost) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    if (Number(updatedPost.published || 0) !== 1) {
      await removePostFromHomepageSettings(env, Number(id)).catch(function (err) {
        console.error('PUT /api/posts/:id homepage cleanup error:', err);
      });
    }
    if (oldImageToDelete) {
      await deleteStoredImageByUrl(env, oldImageToDelete, origin).catch(() => {});
    }
    if (oldGalleryToDelete.length) {
      await Promise.all(oldGalleryToDelete.map(function (value) {
        return deleteStoredImageByUrl(env, value, origin).catch(() => {});
      }));
    }
    if (updatedPost) {
      await recordPostHistory(env, id, 'update', currentPost, updatedPost, '게시글 수정');
      await logOperationalEvent(env, {
        channel: 'admin',
        type: 'post_updated',
        level: 'info',
        actor: String(updatedPost.author || 'admin'),
        path: '/api/posts/' + id,
        message: '게시글 수정 · ' + String(updatedPost.title || ''),
        details: {
          post_id: updatedPost.id,
          category: updatedPost.category || '',
          published: Number(updatedPost.published || 0) === 1,
        },
      });
      await purgeContentCache(env, origin, {
        postId: updatedPost.id,
        categories: [currentPost && currentPost.category, updatedPost.category].filter(Boolean),
      }).catch(function (err) {
        console.error('PUT /api/posts/:id cache purge error:', err);
      });
    }
    return json({ post: updatedPost });
  } catch (err) {
    console.error('PUT /api/posts/:id error:', err);
    const message = err && err.message ? String(err.message) : 'Database error';
    return json({ error: message }, 500);
  }
}

// ── PATCH /api/posts/:id ──────────────────────────────────────
// Toggle featured or published flag. Owner-any, member-self-only (same rule
// as PUT). featured flag (에디터 추천) is owner-only since members shouldn't
// promote their own articles.
export async function onRequestPatch({ params, request, env }) {
  const origin = new URL(request.url).origin;

  const session = await loadAdminSession(request, env);
  if (!session) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Pre-load the post so we can scope member access before any writes.
  const preCheckPost = await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
  if (!preCheckPost) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

  if (!session.isOwner) {
    const hasWrite = hasMenuPermission(session.permissions, 'list', 'write')
                  || hasMenuPermission(session.permissions, 'write', 'write');
    if (!hasWrite) return json({ error: '게시글 상태 변경 권한이 없습니다.' }, 403);
    if (!sessionOwnsPost(session, preCheckPost)) {
      return json({ error: '본인이 작성한 글만 상태를 변경할 수 있습니다.' }, 403);
    }
    // 에디터 추천(featured) 토글은 오너 전용.
    if (body && body.featured !== undefined) {
      return json({ error: '에디터 추천 지정은 오너만 할 수 있습니다.' }, 403);
    }
  }

  const featuredInput = optionalBooleanFlag(body.featured);
  const publishedInput = optionalBooleanFlag(body.published);
  const sortOrderInput = optionalIntegerOrNull(body.sort_order, '정렬 순서');
  if (!sortOrderInput.ok) return json({ error: sortOrderInput.error }, 400);

  if (!featuredInput.provided && !publishedInput.provided && !sortOrderInput.provided) {
    return json({ error: 'featured 또는 published 값을 입력해주세요' }, 400);
  }

  // Phase 2 publish kill switch: same rule as PUT — flip-to-public requires
  // owner when switch is on, unpublish always allowed.
  if (publishedInput.provided && publishedInput.value === true) {
    const session = await loadAdminSession(request, env);
    const gate = await requirePublishAllowed(env, session);
    if (gate.error) return gate.error;
  }

  try {
    const beforePost = await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
    if (!beforePost) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    const fields = [];
    const values = [];
    const nextPublished = publishedInput.provided ? publishedInput.value : Number(beforePost.published || 0) === 1;
    const requestedFeatured = featuredInput.provided ? featuredInput.value : Number(beforePost.featured || 0) === 1;
    const nextFeatured = nextPublished ? requestedFeatured : false;
    const effectivePublishAt = resolveStoredPublishAt({
      published: nextPublished,
      requestedPublishAt: '',
      existingPublishAt: beforePost.publish_at,
    });

    if (publishedInput.provided) { fields.push('published = ?'); values.push(nextPublished ? 1 : 0); }
    if (publishedInput.provided) { fields.push('publish_at = ?'); values.push(effectivePublishAt); }
    if (featuredInput.provided || (publishedInput.provided && !nextFeatured && Number(beforePost.featured || 0) === 1)) {
      fields.push('featured = ?'); values.push(nextFeatured ? 1 : 0);
    }
    if (sortOrderInput.provided) { fields.push('sort_order = ?'); values.push(sortOrderInput.value); }

    const wasPublicFeatured = Number(beforePost.featured || 0) === 1 && Number(beforePost.published || 0) === 1;
    if (nextFeatured && !wasPublicFeatured) {
      const featuredCountRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM posts WHERE featured = 1 AND published = 1`
      ).first();
      const featuredCount = Number(featuredCountRow && featuredCountRow.n || 0);
      if (featuredCount >= 4) {
        return json({ error: '에디터 추천은 최대 4개까지만 선택할 수 있습니다.' }, 409);
      }
      // 메인 스토리 ↔ 에디터 추천 동시 지정 허용(2026-04-19). 배타 체크 제거.
    }
    fields.push("updated_at = datetime('now')");
    const updatedPost = await runPostUpdate(env, id, fields, values);
    if (!updatedPost) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    if (publishedInput.provided && !nextPublished) {
      await removePostFromHomepageSettings(env, Number(id)).catch(function (err) {
        console.error('PATCH /api/posts/:id homepage cleanup error:', err);
      });
    }
    if (updatedPost) {
      var summary = [];
      if (body.featured !== undefined) summary.push(body.featured ? '에디터 추천 설정' : '에디터 추천 해제');
      if (body.published !== undefined) summary.push(body.published ? '공개 전환' : '비공개 전환');
      if (body.sort_order !== undefined) summary.push('정렬 순서 변경');
      await recordPostHistory(env, id, 'status', beforePost, updatedPost, summary.join(' · ') || '상태 변경');
      await logOperationalEvent(env, {
        channel: 'admin',
        type: 'post_status_changed',
        level: 'info',
        actor: String(updatedPost.author || 'admin'),
        path: '/api/posts/' + id,
        message: (summary.join(' · ') || '게시글 상태 변경') + ' · ' + String(updatedPost.title || ''),
        details: {
          post_id: updatedPost.id,
          category: updatedPost.category || '',
          published: Number(updatedPost.published || 0) === 1,
          featured: Number(updatedPost.featured || 0) === 1,
        },
      });
      await purgeContentCache(env, origin, {
        postId: updatedPost.id,
        categories: [beforePost && beforePost.category, updatedPost.category].filter(Boolean),
      }).catch(function (err) {
        console.error('PATCH /api/posts/:id cache purge error:', err);
      });
    }
    return json({ post: updatedPost });
  } catch (err) {
    console.error('PATCH /api/posts/:id error:', err);
    const message = err && err.message ? String(err.message) : 'Database error';
    return json({ error: message }, 500);
  }
}

// ── DELETE /api/posts/:id ─────────────────────────────────────
// Deletes a post. Requires valid admin token.
export async function onRequestDelete({ params, request, env }) {
  const origin = new URL(request.url).origin;
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  try {
    const existing = await env.DB.prepare(`SELECT category, image_url, gallery_images, content FROM posts WHERE id = ?`).bind(id).first();
    if (!existing) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    const { meta } = await env.DB.prepare(
      `DELETE FROM posts WHERE id = ?`
    ).bind(id).run();

    if (meta.changes === 0) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    await removePostFromHomepageSettings(env, Number(id)).catch(function (err) {
      console.error('DELETE /api/posts/:id homepage cleanup error:', err);
    });
    await Promise.all([
      env.DB.prepare(`DELETE FROM post_views WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM post_likes WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM post_history WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM post_engagement WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM site_visits WHERE path = ?`).bind('/post/' + id).run().catch(() => {}),
    ]);
    const imageUrls = collectStoredImageUrls(existing, origin);
    await Promise.all(imageUrls.map(function (value) {
      return deleteStoredImageByUrl(env, value, origin).catch(() => {});
    }));
    await purgeContentCache(env, origin, { postId: id, categories: [existing && existing.category].filter(Boolean) }).catch(function (err) {
      console.error('DELETE /api/posts/:id cache purge error:', err);
    });
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'post_deleted',
      level: 'warn',
      actor: 'admin',
      path: '/api/posts/' + id,
      message: '게시글 삭제 · ' + String(existing && existing.category || '') + ' · #' + String(id),
      details: {
        post_id: id,
        category: existing && existing.category || '',
      },
    });
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
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeCategory(value) {
  if (value === 'worm') return 'wosm';
  return value;
}

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

function sanitizeShortText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
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

function collectStoredImageUrls(post) {
  const urls = [];
  if (post && post.image_url) urls.push(String(post.image_url));
  if (post && post.gallery_images) {
    try {
      const gallery = JSON.parse(post.gallery_images);
      if (Array.isArray(gallery)) {
        gallery.forEach(function (item) {
          if (item && item.url) urls.push(String(item.url));
        });
      }
    } catch (_) {}
  }
  const content = post && typeof post.content === 'string' ? post.content.trim() : '';
  if (!content || content.charAt(0) !== '{') return uniqueStrings(urls);
  try {
    const parsed = JSON.parse(content);
    const blocks = Array.isArray(parsed && parsed.blocks) ? parsed.blocks : [];
    blocks.forEach(function (block) {
      if (!block || block.type !== 'image' || !block.data) return;
      const imageUrl = (block.data.file && block.data.file.url) || block.data.url;
      if (imageUrl) urls.push(String(imageUrl));
    });
  } catch (_) {}
  return uniqueStrings(urls);
}

function uniqueStrings(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(function (item) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function parseGalleryImages(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function diffRemovedGalleryUrls(previousRaw, nextItems) {
  const previous = parseGalleryImages(previousRaw).map(function (item) {
    return item && item.url ? String(item.url) : '';
  }).filter(Boolean);
  const next = new Set((nextItems || []).map(function (item) { return item.url; }));
  return uniqueStrings(previous.filter(function (url) { return !next.has(url); }));
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

async function runPostUpdate(env, id, fields, values) {
  const bound = values.concat(id);
  const result = await env.DB.prepare(
    `UPDATE posts SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...bound).run();
  if (!result || !result.meta || !result.meta.changes) return null;
  return await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
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

async function removePostFromHomepageSettings(env, postId) {
  const safePostId = Number(postId || 0);
  if (!safePostId) return;

  const [leadRow, heroRow, heroMediaRow] = await Promise.all([
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_post'`).first().catch(() => null),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero'`).first().catch(() => null),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'hero_media'`).first().catch(() => null),
  ]);

  if (leadRow && Number(leadRow.value || 0) === safePostId) {
    await env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_post'`).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_media'`).run().catch(() => {});
  }

  const heroIds = parseIdArray(heroRow && heroRow.value);
  if (!heroIds.length || heroIds.indexOf(safePostId) === -1) return;

  const nextHeroIds = heroIds.filter(function (value) { return value !== safePostId; });
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('hero', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(JSON.stringify(nextHeroIds)).run().catch(() => {});

  const mediaMap = parseJsonObject(heroMediaRow && heroMediaRow.value);
  if (mediaMap && Object.prototype.hasOwnProperty.call(mediaMap, String(safePostId))) {
    delete mediaMap[String(safePostId)];
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('hero_media', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(mediaMap)).run().catch(() => {});
  }
}

function parseIdArray(raw) {
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(function (value) { return parseInt(value, 10); }).filter(function (value) { return Number.isFinite(value) && value > 0; })
      : [];
  } catch (_) {
    var single = parseInt(raw, 10);
    return Number.isFinite(single) && single > 0 ? [single] : [];
  }
}

function parseJsonObject(raw) {
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}
