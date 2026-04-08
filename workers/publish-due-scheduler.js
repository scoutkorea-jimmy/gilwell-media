export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runPublishDue(env));
  },

  async fetch(_request, env) {
    const result = await runPublishDue(env);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
};

async function runPublishDue(env) {
  const baseUrl = String((env && env.SITE_ORIGIN) || 'https://bpmedia.net').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/jobs/publish-due`, {
    headers: { 'User-Agent': 'bpmedia-publish-due-scheduler/1.0' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || `publish-due failed (${response.status})`);
  }
  return Object.assign({ success: true }, data);
}
