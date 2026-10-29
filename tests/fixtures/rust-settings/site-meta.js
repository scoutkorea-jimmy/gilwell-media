import { verifyTokenRole, extractToken } from '../../../functions/_shared/auth.js';
import { gateMenuAccess } from '../../../functions/_shared/admin-permissions.js';
import { normalizeSiteMeta } from '../../../functions/_shared/site-meta.js';
import { deleteStoredImageByUrl, storeDataImage } from '../../../functions/_shared/image-storage.js';
import { recordSettingChange } from '../../../functions/_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('site_meta', 'site_meta_rev')`).all();
  const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
  let raw = null;
  try { raw = values.site_meta ? JSON.parse(values.site_meta) : null; } catch (error) { if (request && new URL(request.url).searchParams.get('scope') === 'admin') throw error; }
  const meta = normalizeSiteMeta(raw);
  meta.revision = parseInt(values.site_meta_rev, 10) || 0;
  return json(meta);
  } catch { return json({ error: '메타 설정을 불러오지 못했습니다.' }, 500); }
}

export async function onRequestPut({ request, env }) {
  const origin = new URL(request.url).origin;
  const __gate = await gateMenuAccess(request, env, 'meta', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { if_revision: ifRevision } = body || {};
  let rows;
  try {
    const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('site_meta', 'site_meta_rev')`).all();
    rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
  } catch { return json({ error: '기존 메타 설정을 확인하지 못했습니다.' }, 500); }
  const previousRow = rows.site_meta;
  let previousRaw = null; try { previousRaw = previousRow ? JSON.parse(previousRow.value) : null; } catch (_) {}
  const previous = normalizeSiteMeta(previousRaw);
  const currentRev = rows.site_meta_rev ? parseInt(rows.site_meta_rev.value, 10) || 0 : 0;
  if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
  const safe = normalizeSiteMeta(body || {});
  let storedImage;
  try {
    storedImage = await storeDataImage(env, safe.image_url, origin, 'site-meta');
  } catch (err) {
    console.error('PUT /api/settings/site-meta image error:', err);
    return json({ error: '지원하지 않는 이미지 형식입니다. JPEG / PNG / WebP / GIF만 업로드할 수 있습니다.' }, 400);
  }
  safe.image_url = storedImage.url;
  let committed = false;

  try {
    const nextRev = currentRev + 1;
    const writes = await env.DB.batch([
      env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('site_meta_rev', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`).bind(String(nextRev), currentRev),
      env.DB.prepare(`INSERT INTO settings (key, value) SELECT 'site_meta', ? WHERE changes() = 1
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(safe)),
    ]);
    if (!writes[0] || !writes[0].meta || writes[0].meta.changes !== 1) {
      if (storedImage.key) await deleteStoredImageByUrl(env, safe.image_url, origin).catch(() => {});
      return json({ error: '다른 변경이 감지되었습니다. 입력을 보존하고 최신 설정을 다시 확인해주세요.', revision: currentRev }, 409);
    }
    committed = true;
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
    if (!committed && storedImage.key) {
      // On an uncertain database failure, delete only this request's new object
      // after confirming that no committed setting references it.
      try {
        const current = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_meta'`).first();
        if (!current || !String(current.value).includes(safe.image_url)) await deleteStoredImageByUrl(env, safe.image_url, origin);
      } catch (_) { /* Keep the new object when the database outcome is unknown. */ }
    }
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
