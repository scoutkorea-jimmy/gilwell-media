import { PUBLIC_DATE_EXPR } from '../_shared/post-public-date.js';
import { queryRust } from '../_shared/rust-server.js';

/**
 * Gilwell Media · Article Stats
 *
 * GET /api/stats  ← public, returns post counts by category + today
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const { ensureDuePostsPublished } = await import('../_shared/publish-due-posts.js');
    // 예약 공개 보정을 응답 경로에서 분리 — origin 을 넘겨 발행 시 캐시 퍼지가 실제로
    // 동작하게 하고(이전엔 origin 누락으로 purge 가 조용히 스킵됐다), waitUntil 로 비차단
    // 실행. /api/home·[[path]] 와 동일 패턴. (안정성 검토 00.170.07)
    const origin = new URL(request.url).origin;
    const runDuePublish = () =>
      ensureDuePostsPublished(env, origin).catch((err) => {
        console.error('GET /api/stats auto publish error (bg):', err);
      });
    if (context.waitUntil) context.waitUntil(runDuePublish());
    else await runDuePublish();
    const rust = await queryRust(context, 'post-stats', { publicDateExpr: PUBLIC_DATE_EXPR, nowMs: Date.now() });
    if (!rust.ok) throw new Error('Rust stats query failed');
    return json(await rust.json());
  } catch (err) {
    console.error('GET /api/stats error:', err);
    return json({ error: 'Database error' }, 500);
  }
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
