import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { loadSiteMeta, normalizeSiteMeta } from '../../_shared/site-meta.js';
import { deleteStoredImageByUrl, storeDataImage } from '../../_shared/image-storage.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

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
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

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
  const storedImage = await storeDataImage(env, safe.image_url, origin, 'site-meta');
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
    if (previousRow && previousRow.value) {
      await ensureSettingsHistoryTable(env);
      try {
        await env.DB.prepare(`INSERT INTO settings_history (key, value) VALUES (?, ?)`).bind('site_meta', previousRow.value).run();
      } catch (historyErr) {
        console.warn('PUT /api/settings/site-meta history save skipped:', historyErr);
      }
    }
    if (previous && previous.image_url && previous.image_url !== safe.image_url) {
      await deleteStoredImageByUrl(env, previous.image_url, origin).catch(() => {});
    }
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'settings_change',
      level: 'info',
      actor: 'admin',
      path: '/api/settings/site-meta',
      message: 'site_meta 설정 변경',
      details: { key: 'site_meta', revision: nextRev },
    });
    safe.revision = nextRev;
    return json(safe);
  } catch (err) {
    console.error('PUT /api/settings/site-meta error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function ensureSettingsHistoryTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS settings_history (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      key      TEXT NOT NULL,
      value    TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
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
