/**
 * Gilwell Media · 메인 스토리 자동 갱신 스케줄러
 *
 * 매일 자정(KST)에 /api/jobs/refresh-home-lead 를 호출한다.
 * cron 은 UTC 기준이라 wrangler.home-lead.toml 에 "0 15 * * *" 로 걸어 둔다
 * (15:00 UTC = 익일 00:00 KST). 한국은 서머타임이 없어 연중 고정이다.
 *
 * 실제 선정 로직은 Pages Functions 쪽(functions/_shared/home-lead-auto.js)에
 * 있다 — D1 접근과 캐시 퍼지를 사이트 코드와 한곳에서 관리하기 위함이며,
 * cleanup-drafts / publish-due 스케줄러와 같은 구조다.
 */
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runJob(env));
  },

  // 수동 점검용 — 워커 URL 을 직접 열면 같은 작업을 한 번 돌린다.
  async fetch(_request, env) {
    const result = await runJob(env).catch((e) => ({ error: String((e && e.message) || e) }));
    return new Response(JSON.stringify({ success: !result.error, 'home-lead': result }), {
      status: result.error ? 500 : 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

async function runJob(env) {
  const origin = env && env.SITE_ORIGIN;
  if (!origin) throw new Error('home-lead scheduler: SITE_ORIGIN env var is required');
  const baseUrl = String(origin).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/jobs/refresh-home-lead`, {
    headers: { 'User-Agent': 'bpmedia-home-lead/1.0' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data && data.error) || `refresh-home-lead failed (${response.status})`);
  return Object.assign({ success: true }, data);
}
