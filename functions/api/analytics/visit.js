import { recordSiteVisit } from '../../_shared/analytics.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  try {
    const result = await recordSiteVisit(request, env, body);
    return json(result, 200);
  } catch (err) {
    console.error('POST /api/analytics/visit error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
