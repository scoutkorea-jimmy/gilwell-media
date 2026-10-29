import { queryRust } from '../../_shared/rust-server.js';
import { getViewerKey, isLikelyNonHumanRequest } from '../../_shared/engagement.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  try {
    const result = await recordPostEngagement(request, env, body);
    return json(result, 200);
  } catch (err) {
    console.error('POST /api/analytics/post-engagement error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function recordPostEngagement(request, env, payload) {
  if (isLikelyNonHumanRequest(request)) return { recorded: false, excluded: 'bot' };
  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return { recorded: false };

  const rust = await queryRust({ request, env }, 'post-engagement-record', { payload, viewer_key:viewerKey });
  if (!rust.ok) throw new Error('Rust post engagement failed');
  return rust.json();
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
