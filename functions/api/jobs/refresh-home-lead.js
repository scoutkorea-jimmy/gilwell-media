/**
 * Gilwell Media · /api/jobs/refresh-home-lead
 *
 * 메인 스토리 자동 갱신 작업. home-lead cron worker 가 매일 자정(KST)에 호출한다.
 * settings.home_lead_mode 가 'auto' 일 때만 글을 다시 고르고, 'manual' 이면
 * 아무것도 하지 않는다 (운영자가 직접 지정한 글을 덮어쓰지 않기 위함).
 *
 * 권한: 인증 없음 — cleanup-drafts / publish-due 와 같은 정책.
 * 부작용이 "공개글 중 하나를 메인 스토리로 지정"으로 좁고 idempotent 하다.
 * 외부에서 호출돼도 규칙이 고르는 글과 같은 결과가 나오므로 악용 여지가 없다.
 */

import { refreshAutoHomeLead } from '../../_shared/home-lead-auto.js';
import { purgeContentCache } from '../../_shared/cache-purge.js';

export async function onRequestGet(ctx) {
  return handleRefresh(ctx);
}

export async function onRequestPost(ctx) {
  return handleRefresh(ctx);
}

async function handleRefresh({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    const result = await refreshAutoHomeLead(env);

    // 메인 스토리가 실제로 바뀐 경우에만 캐시를 턴다. 매일 도는 작업이라
    // 바뀌지 않았는데 퍼지하면 엣지 캐시를 공연히 비우게 된다.
    if (result.changed) {
      await purgeContentCache(env, origin, { postId: result.post_id }).catch((err) => {
        console.error('refresh-home-lead cache purge error:', err);
      });
    }

    return json({ success: true, ...result });
  } catch (err) {
    console.error('GET /api/jobs/refresh-home-lead error:', err);
    return json({ success: false, error: String((err && err.message) || err) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
