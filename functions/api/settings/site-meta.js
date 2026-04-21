import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { loadSiteMeta, normalizeSiteMeta } from '../../_shared/site-meta.js';
import { deleteStoredImageByUrl, storeDataImage } from '../../_shared/image-storage.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  const [meta, revRow] = await Promise.all([
    loadSiteMeta(env),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_meta_rev'`).first(),
  ]);
  meta.revision = revRow ? parseInt(revRow.value, 10) : 0;
  return json(meta);
}

export async function onRequestPut({ request, env }) {
  const origin = new URL(request.url).origin;
  const __gate = await gateMenuAccess(request, env, 'meta', 'view'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const [previous, previousRow] = await Promise.all([
    loadSiteMeta(env),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_meta'`).first(),
  ]);
  const { if_revision: ifRevision } = body || {};
  const safe = normalizeSiteMeta(body || {});
  let storedImage;
  try {
    storedImage = await storeDataImage(env, safe.image_url, origin, 'site-meta');
  } catch (err) {
    console.error('PUT /api/settings/site-meta image error:', err);
    return json({ error: '지원하지 않는 이미지 형식입니다. JPEG / PNG / WebP / GIF만 업로드할 수 있습니다.' }, 400);
  }
  safe.image_url = storedImage.url;

  try {
    const revRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_meta_rev'`).first();
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('site_meta', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    const nextRev = currentRev + 1;
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('site_meta_rev', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(String(nextRev)).run();
    await recordSettingChange(env, {
      key: 'site_meta',
      previousValue: previousRow && previousRow.value,
      path: '/api/settings/site-meta',
      message: 'site_meta 설정 변경',
      details: { revision: nextRev },
    });
    if (previous && previous.image_url && previous.image_url !== safe.image_url) {
      await deleteStoredImageByUrl(env, previous.image_url, origin).catch(() => {});
    }
    safe.revision = nextRev;
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
