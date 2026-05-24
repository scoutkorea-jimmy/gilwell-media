// publish-due는 매 5분 cron. cleanup-drafts는 별도 worker
// (gilwell-media-cleanup-drafts, wrangler.cleanup-drafts.toml, */15 cron)로 분리됨.
// 단, safety net으로 여기서도 piggyback 호출 — drafts 삭제는 idempotent(같은 14d+ row를
// 두 worker가 동시 삭제해도 결과 같음)라서 한쪽이 망가져도 다른 쪽이 계속 정리.
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(Promise.allSettled([
      runJob(env, '/api/jobs/publish-due', 'publish-due'),
      runJob(env, '/api/jobs/cleanup-drafts', 'cleanup-drafts'),
    ]));
  },

  async fetch(_request, env) {
    const [publishResult, cleanupResult] = await Promise.allSettled([
      runJob(env, '/api/jobs/publish-due', 'publish-due'),
      runJob(env, '/api/jobs/cleanup-drafts', 'cleanup-drafts'),
    ]);
    return new Response(JSON.stringify({
      success: true,
      'publish-due': publishResult.status === 'fulfilled' ? publishResult.value : { error: String(publishResult.reason) },
      'cleanup-drafts': cleanupResult.status === 'fulfilled' ? cleanupResult.value : { error: String(cleanupResult.reason) },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

async function runJob(env, path, label) {
  const origin = env && env.SITE_ORIGIN;
  if (!origin) {
    throw new Error(`${label} scheduler: SITE_ORIGIN env var is required (wrangler.publish-due.toml [vars])`);
  }
  const baseUrl = String(origin).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'User-Agent': 'bpmedia-scheduler/1.1' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || `${label} failed (${response.status})`);
  }
  return Object.assign({ success: true }, data);
}
