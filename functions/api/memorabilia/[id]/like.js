/**
 * POST /api/memorabilia/:id/like  — 좋아요 토글
 * GET  /api/memorabilia/:id/like  — 현재 카운트 + 본인 좋아요 여부
 *
 * post_likes 와 동일한 viewer_key(SHA256(IP+ADMIN_SECRET)) 기준.
 * 동일 IP 가 다시 POST 하면 좋아요 취소.
 */

import { getViewerKey, isLikelyNonHumanRequest } from '../../../_shared/engagement.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../../_shared/rate-limit.js';

export async function onRequestGet({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  const viewerKey = await getViewerKey(request, env).catch(() => null);
  const stats = await getMemorabiliaLikeStats(env, id, viewerKey);
  return json(stats);
}

export async function onRequestPost({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  if (isLikelyNonHumanRequest(request)) {
    return json({ likes: 0, liked: false }, 200);
  }

  const rl = await enforceRateLimit(env, {
    route: 'memo-like',
    identity: getClientIp(request),
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl, '좋아요 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');

  const item = await env.DB.prepare(
    `SELECT id FROM memorabilia WHERE id = ? AND status = 'public'`
  ).bind(id).first();
  if (!item) return json({ error: 'not_found' }, 404);

  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return json({ error: '좋아요 처리에 필요한 정보를 확인할 수 없습니다.' }, 400);

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM memorabilia_likes WHERE memorabilia_id = ? AND viewer_key = ? LIMIT 1`
    ).bind(id, viewerKey).first();

    if (existing) {
      await env.DB.prepare(
        `DELETE FROM memorabilia_likes WHERE memorabilia_id = ? AND viewer_key = ?`
      ).bind(id, viewerKey).run();
    } else {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO memorabilia_likes (memorabilia_id, viewer_key) VALUES (?, ?)`
      ).bind(id, viewerKey).run();
    }

    const stats = await getMemorabiliaLikeStats(env, id, viewerKey);
    return json(stats);
  } catch (err) {
    console.error('POST /api/memorabilia/:id/like error:', err);
    return json({ error: 'database_error' }, 500);
  }
}

async function getMemorabiliaLikeStats(env, id, viewerKey) {
  const [countRow, likedRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM memorabilia_likes WHERE memorabilia_id = ?`).bind(id).first(),
    viewerKey
      ? env.DB.prepare(`SELECT 1 FROM memorabilia_likes WHERE memorabilia_id = ? AND viewer_key = ? LIMIT 1`).bind(id, viewerKey).first()
      : Promise.resolve(null),
  ]);
  return { likes: countRow?.count || 0, liked: !!likedRow };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
