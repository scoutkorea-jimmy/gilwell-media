/**
 * Gilwell Media · UI Translations
 *
 * GET /api/settings/translations  ← public, returns merged { strings }
 * PUT /api/settings/translations  ← admin only, saves custom overrides
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

// ── GET /api/settings/translations ───────────────────────────
export async function onRequestGet({ env }) {
  try {
    const row    = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'translations'`
    ).first();
    const custom = row ? JSON.parse(row.value || '{}') : {};
    return json({ strings: custom });
  } catch (err) {
    console.error('GET /api/settings/translations error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/translations ───────────────────────────
export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const strings = body.strings || {};

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('translations', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(strings)).run();

    return json({ success: true });
  } catch (err) {
    console.error('PUT /api/settings/translations error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
