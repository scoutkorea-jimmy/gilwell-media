/**
 * BP미디어 · Contributors Settings
 *
 * GET /api/settings/contributors  ← public, returns contributor list
 * PUT /api/settings/contributors  ← admin only, update list
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const [row, revRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'contributors'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'contributors_rev'`).first(),
    ]);
    const items = row ? JSON.parse(row.value) : [];
    const revision = revRow ? parseInt(revRow.value, 10) : 0;
    return json({ items, revision });
  } catch (err) {
    console.error('GET /api/settings/contributors error:', err);
    return json({ items: [] });
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { items, if_revision } = body;
  if (!Array.isArray(items)) {
    return json({ error: '항목 배열을 입력해주세요' }, 400);
  }

  const safe = items
    .map(function (item) {
      const dateVal = String(item.date || '').trim();
      return {
        name: String(item.name || '').trim().slice(0, 60),
        note: String(item.note || '').trim().slice(0, 200),
        date: /^\d{4}-\d{2}-\d{2}$/.test(dateVal) ? dateVal : '',
      };
    })
    .filter(function (item) { return item.name.length > 0; });

  try {
    const revRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'contributors_rev'`).first();
    const currentRev = revRow ? parseInt(revRow.value, 10) : 0;
    if (Number.isFinite(if_revision) && parseInt(if_revision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const prev = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'contributors'`).first();
    const nextRev = currentRev + 1;

    await Promise.all([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('contributors', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(safe)).run(),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('contributors_rev', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(nextRev)).run(),
    ]);
    await recordSettingChange(env, {
      key: 'contributors',
      previousValue: prev && prev.value,
      path: '/api/settings/contributors',
      message: '기고자 설정 변경',
      details: { revision: nextRev, count: safe.length },
    });
    return json({ items: safe, revision: nextRev });
  } catch (err) {
    console.error('PUT /api/settings/contributors error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
