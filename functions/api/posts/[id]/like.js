import { getViewerKey, getLikeStats, isLikelyNonHumanRequest } from '../../../_shared/engagement.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../../_shared/rate-limit.js';

export async function onRequestPost({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);
  }

  // Reject obvious bots/prefetchers before touching the DB — prevents engagement
  // spam from crawlers and link-preview services that would otherwise pump likes.
  if (isLikelyNonHumanRequest(request)) {
    return json({ likes: 0, liked: false }, 200);
  }

  // Cap even human-origin abuse: 30 like requests / IP / minute across all
  // posts. The INSERT OR IGNORE uniqueness already prevents multi-likes on
  // one post, so this mainly shields the DB from hammering.
  const rl = await enforceRateLimit(env, {
    route: 'like',
    identity: getClientIp(request),
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl, '공감 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');

  const post = await env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND published = 1`).bind(id).first();
  if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return json({ error: '공감 처리에 필요한 정보를 확인할 수 없습니다' }, 400);

  try {
    // Short-circuit when the viewer has already liked — avoids an unnecessary
    // INSERT round-trip on spammy repeat clicks and gives the client fresh counts.
    const existing = await env.DB.prepare(
      `SELECT 1 FROM post_likes WHERE post_id = ? AND viewer_key = ? LIMIT 1`
    ).bind(id, viewerKey).first();

    if (!existing) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO post_likes (post_id, viewer_key) VALUES (?, ?)`
      ).bind(id, viewerKey).run();
    }

    const stats = await getLikeStats(env, id, viewerKey);
    return json(stats);
  } catch (err) {
    console.error('POST /api/posts/:id/like error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
