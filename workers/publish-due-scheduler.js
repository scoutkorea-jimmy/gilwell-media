export default {
  async scheduled(_controller, env, ctx) {
    // publish-due는 매 tick(5분). drafts cleanup은 가벼우니 같이 piggyback —
    // GET /api/admin/drafts에서도 lazy 정리되지만, 운영자가 며칠 admin 안 열면
    // row가 누적되므로 cron으로 강제 청소한다.
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
