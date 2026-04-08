import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { loadNavLabels, normalizeNavLabels } from '../../_shared/nav-labels.js';

export async function onRequestGet({ env }) {
  try {
    const labels = await loadNavLabels(env);
    return json({ labels }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    console.error('GET /api/settings/nav-labels error:', err);
    return json({ labels: normalizeNavLabels({}) }, 200, publicCacheHeaders(300, 1800));
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const labels = normalizeNavLabels(body && body.labels);

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('nav_labels', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(labels)).run();
    return json({ labels });
  } catch (err) {
    console.error('PUT /api/settings/nav-labels error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
