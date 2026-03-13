import { verifyToken, extractToken } from '../../_shared/auth.js';
import { loadSiteMeta, normalizeSiteMeta } from '../../_shared/site-meta.js';
import { deleteStoredImageByUrl, storeDataImage } from '../../_shared/image-storage.js';

export async function onRequestGet({ env }) {
  const meta = await loadSiteMeta(env);
  return json(meta);
}

export async function onRequestPut({ request, env }) {
  const origin = new URL(request.url).origin;
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const previous = await loadSiteMeta(env);
  const safe = normalizeSiteMeta(body || {});
  const storedImage = await storeDataImage(env, safe.image_url, origin, 'site-meta');
  safe.image_url = storedImage.url;

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('site_meta', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    if (previous && previous.image_url && previous.image_url !== safe.image_url) {
      await deleteStoredImageByUrl(env, previous.image_url, origin).catch(() => {});
    }
    return json(safe);
  } catch (err) {
    console.error('PUT /api/settings/site-meta error:', err);
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
