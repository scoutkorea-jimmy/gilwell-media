// Compatibility reference from origin/main 835a326a; test-only.
import { isPlaceholderAuthor, publicAuthor } from '../../../functions/_shared/post-author.js';
/**
 * Gilwell Media · Single Post
 *
 * GET    /api/posts/:id   ← public, fetch full post
 * PUT    /api/posts/:id   ← admin only, update post
 * DELETE /api/posts/:id   ← admin only, delete post
 */
import { verifyTokenRole, extractToken } from '../../../functions/_shared/auth.js';
import { loadAdminSession, requirePublishAllowed, sessionOwnsPost } from '../../../functions/_shared/admin-permissions.js';
import { hasMenuPermission } from '../../../functions/_shared/admin-users.js';
import { getLikeStats, getViewerKey, isLikelyNonHumanRequest, recordUniqueView } from '../rust-engagement.js';
import { sanitizeYouTubeUrl } from '../../../functions/_shared/youtube.js';
import { serializePostImage } from '../../../functions/_shared/images.js';
import { serializeImageFrameForStore } from '../../../functions/_shared/image-frame.js';
import { deleteStoredImageByUrl, storeDataImage, upgradeEditorContentImages } from '../../../functions/_shared/image-storage.js';
import { findManualRelatedPosts, findRelatedPosts, parseManualRelatedIds } from '../rust-related-posts.js';
import { recordPostHistory } from '../../../functions/_shared/post-history.js';
import { normalizePublishAtInput, optionalBooleanFlag, optionalIntegerOrNull, optionalTrimmedString, requireNonEmptyString } from '../../../functions/_shared/post-input.js';
import { findSpecialFeaturePosts, sanitizeSpecialFeature } from '../rust-special-features.js';
import { purgeContentCache } from '../../../functions/_shared/cache-purge.js';
import { ensureDuePostsPublished } from '../../../functions/_shared/publish-due-posts.js';
import { VALID_POST_CATEGORIES } from '../../../functions/_shared/site-structure.mjs';
import { logOperationalEvent } from '../../../functions/_shared/ops-log.js';
import { clearHomeLeadForPost } from '../../../functions/_shared/home-lead-auto.js';

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
    return json({ post: isAdmin ? post : sanitizePublicPost(serializePostImage({...post, author: publicAuthor(post.author)}, origin)) });
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
  'image_url', 'image_caption', 'image_frame', 'image_is_placeholder', 'image_has_real_asset',
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
