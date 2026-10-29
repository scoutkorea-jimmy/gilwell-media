export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runJob(env));
  },

  async fetch(_request, env) {
    const result = await runJob(env).catch((e) => ({ error: String(e && e.message || e) }));
    return new Response(JSON.stringify({ success: !result.error, 'cleanup-drafts': result }), {
      status: result.error ? 500 : 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

async function runJob(env) {
  const origin = env && env.SITE_ORIGIN;
  if (!origin) throw new Error('cleanup-drafts scheduler: SITE_ORIGIN env var is required');
  const baseUrl = String(origin).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/jobs/cleanup-drafts`, {
    headers: { 'User-Agent': 'bpmedia-cleanup-drafts/1.0' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data && data.error) || `cleanup-drafts failed (${response.status})`);
  return Object.assign({ success: true }, data);
}
