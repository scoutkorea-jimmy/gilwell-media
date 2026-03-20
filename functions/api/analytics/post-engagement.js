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

  const postId = parsePostId(payload && payload.post_id);
  const sessionKey = sanitizeSessionKey(payload && payload.session_key);
  const engagedSeconds = sanitizeSeconds(payload && payload.engaged_seconds);
  if (!postId || !sessionKey || engagedSeconds < 1) {
    return { recorded: false, invalid: true };
  }

  await env.DB.prepare(
    `INSERT INTO post_engagement (post_id, viewer_key, session_key, engaged_seconds)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(post_id, session_key) DO UPDATE SET
       viewer_key = excluded.viewer_key,
       engaged_seconds = CASE
         WHEN excluded.engaged_seconds > post_engagement.engaged_seconds THEN excluded.engaged_seconds
         ELSE post_engagement.engaged_seconds
       END,
       updated_at = datetime('now')`
  ).bind(postId, viewerKey, sessionKey, engagedSeconds).run();

  return {
    recorded: true,
    viewer_key: viewerKey,
    post_id: postId,
    engaged_seconds: engagedSeconds,
  };
}

function parsePostId(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sanitizeSessionKey(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 120) return '';
  return /^[a-zA-Z0-9._:-]+$/.test(normalized) ? normalized : '';
}

function sanitizeSeconds(value) {
  const parsed = Math.floor(Number(value || 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(43200, Math.max(0, parsed));
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
