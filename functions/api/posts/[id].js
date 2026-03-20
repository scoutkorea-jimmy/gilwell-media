/**
 * Gilwell Media · Single Post
 *
 * GET    /api/posts/:id   ← public, fetch full post
 * PUT    /api/posts/:id   ← admin only, update post
 * DELETE /api/posts/:id   ← admin only, delete post
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { getLikeStats, getViewerKey, isLikelyNonHumanRequest, recordUniqueView } from '../../_shared/engagement.js';
import { sanitizeYouTubeUrl } from '../../_shared/youtube.js';
import { serializePostImage } from '../../_shared/images.js';
import { deleteStoredImageByUrl, storeDataImage, upgradeEditorContentImages } from '../../_shared/image-storage.js';
import { findManualRelatedPosts, findRelatedPosts, parseManualRelatedIds } from '../../_shared/related-posts.js';
import { recordPostHistory } from '../../_shared/post-history.js';
import { findSpecialFeaturePosts, sanitizeSpecialFeature } from '../../_shared/special-features.js';

const VALID_CATEGORIES = ['korea', 'apr', 'wosm', 'people'];

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
    const isAdmin = token ? await verifyTokenRole(token, env.ADMIN_SECRET, 'full').catch(() => false) : false;

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
    post.special_feature_posts = specialFeaturePosts;

    const origin = new URL(request.url).origin;
    return json({ post: isAdmin ? post : serializePostImage(post, origin) });
  } catch (err) {
    console.error('GET /api/posts/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/posts/:id ────────────────────────────────────────
// Updates an existing post. Requires valid admin token.
export async function onRequestPut({ params, request, env }) {
  const origin = new URL(request.url).origin;
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  let currentPost = null;
  try {
    currentPost = await env.DB.prepare(`SELECT image_url, gallery_images FROM posts WHERE id = ?`).bind(id).first();
  } catch (_) {}

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, subtitle, content, image_url, image_caption, gallery_images, youtube_url, location_name, location_address, meta_tags, tag, special_feature, author, ai_assisted, publish_date, publish_at, manual_related_posts, sort_order } = body;
  const category = normalizeCategory(body.category);

  // Validate only fields that are actually provided
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return json({ error: '유효하지 않은 카테고리입니다 (korea / apr / wosm / people)' }, 400);
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
  if (content   !== undefined) {
    const upgradedContent = await safelyUpgradeEditorContentImages(content.trim(), env, origin, 'inline');
    fields.push('content = ?');
    values.push(upgradedContent);
  }
  let oldImageToDelete = '';
  let oldGalleryToDelete = [];
  if (image_url !== undefined) {
    const storedCover = await safelyStoreDataImage(env, sanitizeUrl(image_url, origin), origin, 'cover');
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
  if (meta_tags !== undefined) { fields.push('meta_tags = ?');   values.push(meta_tags ? String(meta_tags).trim().slice(0, 500) : null); }
  if (tag          !== undefined) { fields.push('tag = ?');          values.push(tag ? String(tag).trim().slice(0, 200) : null); }
  if (special_feature !== undefined) { fields.push('special_feature = ?'); values.push(sanitizeSpecialFeature(special_feature)); }
  if (author       !== undefined) {
    var safeAuthor = author ? String(author).trim().slice(0, 60) : '';
    fields.push('author = ?');
    values.push(safeAuthor || 'Editor.A');
  }
  if (ai_assisted  !== undefined) { fields.push('ai_assisted = ?');  values.push(ai_assisted ? 1 : 0); }
  if (sort_order   !== undefined) { fields.push('sort_order = ?');   values.push(sort_order !== null ? parseInt(sort_order, 10) : null); }
  if (manual_related_posts !== undefined) { fields.push('manual_related_posts = ?'); values.push(normalizeManualRelatedPosts(manual_related_posts)); }
  const normalizedPublishAt = normalizePublishAtInput(publish_at, publish_date);
  if (publish_at !== undefined || publish_date !== undefined) {
    if (normalizedPublishAt) {
      fields.push('publish_at = ?'); values.push(normalizedPublishAt);
    } else if (publish_at === null || publish_date === null || publish_at === '' || publish_date === '') {
      fields.push('publish_at = ?'); values.push(null);
    }
  }

  if (fields.length === 0) {
    return json({ error: '변경할 내용을 입력해주세요' }, 400);
  }

  // Always update the timestamp
  fields.push("updated_at = datetime('now')");
  values.push(id);

  try {
    const updatedPost = await runPostUpdate(env, id, fields, values);
    if (!updatedPost) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    if (oldImageToDelete) {
      await deleteStoredImageByUrl(env, oldImageToDelete, origin).catch(() => {});
    }
    if (oldGalleryToDelete.length) {
      await Promise.all(oldGalleryToDelete.map(function (value) {
        return deleteStoredImageByUrl(env, value, origin).catch(() => {});
      }));
    }
    if (updatedPost) {
      await recordPostHistory(env, id, 'update', updatedPost, '게시글 수정');
    }
    return json({ post: updatedPost });
  } catch (err) {
    console.error('PUT /api/posts/:id error:', err);
    const message = err && err.message ? String(err.message) : 'Database error';
    return json({ error: message }, 500);
  }
}

// ── PATCH /api/posts/:id ──────────────────────────────────────
// Toggle featured or published flag. Requires valid admin token.
export async function onRequestPatch({ params, request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
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
    if (results[0]) {
      var summary = [];
      if (body.featured !== undefined) summary.push(body.featured ? '에디터 추천 설정' : '에디터 추천 해제');
      if (body.published !== undefined) summary.push(body.published ? '공개 전환' : '비공개 전환');
      if (body.sort_order !== undefined) summary.push('정렬 순서 변경');
      await recordPostHistory(env, id, 'status', results[0], summary.join(' · ') || '상태 변경');
    }
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
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params.id);
  if (id === null) return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);

  try {
    const existing = await env.DB.prepare(`SELECT image_url, gallery_images, content FROM posts WHERE id = ?`).bind(id).first();
    if (!existing) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    const { meta } = await env.DB.prepare(
      `DELETE FROM posts WHERE id = ?`
    ).bind(id).run();

    if (meta.changes === 0) return json({ error: '게시글을 찾을 수 없습니다' }, 404);
    await Promise.all([
      env.DB.prepare(`DELETE FROM post_views WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM post_likes WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM post_history WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM post_engagement WHERE post_id = ?`).bind(id).run().catch(() => {}),
      env.DB.prepare(`DELETE FROM site_visits WHERE path = ?`).bind('/post/' + id).run().catch(() => {}),
    ]);
    const origin = new URL(request.url).origin;
    const imageUrls = collectStoredImageUrls(existing, origin);
    await Promise.all(imageUrls.map(function (value) {
      return deleteStoredImageByUrl(env, value, origin).catch(() => {});
    }));
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
  return '';
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
