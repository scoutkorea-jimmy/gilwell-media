/**
 * GET /api/memorabilia/:id/view — 조회수 기록 + 현재 조회수 반환
 *
 * 상세 slug 응답(`/api/memorabilia/slug/:slug`)은 CDN 5분 캐시라
 * 캐시 히트 시 워커에 도달하지 않는다. 그래서 조회 기록은 캐시되지 않는
 * 이 엔드포인트가 담당하고, 프론트는 상세 진입 시 한 번 핑한다.
 * 같은 뷰어는 12시간 버킷당 1회만 카운트된다(좋아요 패턴과 동일한 뷰어 키).
 */

import { getViewerKey, isLikelyNonHumanRequest, recordUniqueMemorabiliaView } from '../../../_shared/engagement.js';

export async function onRequestGet({ env, params, request }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  // 봇/프리페치는 카운트하지 않음. 카운트 실패가 응답을 막지 않도록 swallow.
  if (!isLikelyNonHumanRequest(request)) {
    const viewerKey = await getViewerKey(request, env).catch(() => null);
    await recordUniqueMemorabiliaView(env, id, viewerKey).catch(() => false);
  }

  const row = await env.DB.prepare(`SELECT view_count FROM memorabilia WHERE id = ?`).bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404, { 'Cache-Control': 'no-store' });

  return json({ views: row.view_count || 0 }, 200, { 'Cache-Control': 'no-store' });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
