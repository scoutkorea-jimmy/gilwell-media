/**
 * Gilwell Media · /api/jobs/refresh-home-lead
 *
 * 메인 스토리 자동 갱신 작업. home-lead cron worker 가 매일 자정(KST)에 호출한다.
 * settings.home_lead_mode 가 'auto' 일 때만 글을 다시 고르고, 'manual' 이면
 * 아무것도 하지 않는다 (운영자가 직접 지정한 글을 덮어쓰지 않기 위함).
 *
 * 권한: 인증 없음 — cleanup-drafts / publish-due 와 같은 정책.
 * 자동 모드의 공개글만 갱신하며 수동 지정은 보존한다.
 * 공동 1위가 있으면 호출할 때마다 선정 결과가 달라질 수 있다.
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
