/**
 * POST /api/memorabilia/upload-image
 * Body: { data_url: "data:image/...;base64,..." }
 * Response: { url: "/api/images/<key>" }
 *
 * 관리자 전용. R2 (POST_IMAGES) 버킷에 저장하고 안정 URL 을 돌려준다.
 */

import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { storeDataImage } from '../../_shared/image-storage.js';

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const dataUrl = String(body?.data_url || '');
  if (!dataUrl.startsWith('data:image/')) return json({ error: 'invalid_data_url' }, 400);
  // 약 7MB 상한 (base64 오버헤드 고려)
  if (dataUrl.length > 10 * 1024 * 1024) return json({ error: 'too_large' }, 413);

  try {
    const origin = new URL(request.url).origin;
    const stored = await storeDataImage(env, dataUrl, origin, 'memorabilia');
    if (!stored.url) return json({ error: 'store_failed' }, 500);
    return json({ url: stored.url });
  } catch (err) {
    console.error('memorabilia upload-image error:', err);
    return json({ error: 'upload_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
