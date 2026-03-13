/**
 * Gilwell Media · Tag (글머리) Settings
 *
 * GET /api/settings/tags  ← public, returns available tags
 * PUT /api/settings/tags  ← admin only, update tags
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

const DEFAULT_TAGS = ['소식', '공지', '행사', '보고', '특집', '단독', '속보'];

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'tags'`
    ).first();
    const items = row ? JSON.parse(row.value) : DEFAULT_TAGS;
    return json({ items });
  } catch (err) {
    console.error('GET /api/settings/tags error:', err);
    return json({ items: DEFAULT_TAGS });
  }
}

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
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
    .map(s => String(s).trim())
    .filter(s => s.length > 0)
    .slice(0, 30);

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('tags', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    return json({ items: safe });
  } catch (err) {
    console.error('PUT /api/settings/tags error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
