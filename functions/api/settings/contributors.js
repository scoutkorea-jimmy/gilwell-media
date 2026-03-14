/**
 * BP미디어 · Contributors Settings
 *
 * GET /api/settings/contributors  ← public, returns contributor list
 * PUT /api/settings/contributors  ← admin only, update list
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'contributors'`
    ).first();
    const items = row ? JSON.parse(row.value) : [];
    return json({ items });
  } catch (err) {
    console.error('GET /api/settings/contributors error:', err);
    return json({ items: [] });
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { items } = body;
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
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('contributors', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    return json({ items: safe });
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
