import { settingSnapshot, saveRevisionedSetting, singleSetting } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { normalizeSiteMetaRust } from '../../_shared/site-meta.js';
import { deleteStoredImageByUrl, storeDataImage } from '../../_shared/image-storage.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
  const { results } = await settingSnapshot(env, 'site_meta');
  const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
  let raw = null;
  try { raw = values.site_meta ? JSON.parse(values.site_meta) : null; } catch (error) { if (request && new URL(request.url).searchParams.get('scope') === 'admin') throw error; }
  const meta = await normalizeSiteMetaRust(env, raw);
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
    const { results } = await settingSnapshot(env, 'site_meta');
    rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
  } catch { return json({ error: '기존 메타 설정을 확인하지 못했습니다.' }, 500); }
  const previousRow = rows.site_meta;
  let previousRaw = null; try { previousRaw = previousRow ? JSON.parse(previousRow.value) : null; } catch (_) {}
  let previous;
  try { previous = await normalizeSiteMetaRust(env, previousRaw); } catch { return json({ error: '기존 메타 설정을 확인하지 못했습니다.' }, 500); }
  const currentRev = rows.site_meta_rev ? parseInt(rows.site_meta_rev.value, 10) || 0 : 0;
  if (Number.isFinite(ifRevision) && parseInt(ifRevision, 10) !== currentRev) return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
  let safe;
  try { safe = await normalizeSiteMetaRust(env, body || {}); } catch { return json({ error: 'Database error' }, 500); }
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
    const changes = await saveRevisionedSetting(env, 'site_meta', currentRev, nextRev, [JSON.stringify(safe)]);
    if (changes !== 1) {
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
        const current = await singleSetting(env, 'site_meta');
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
