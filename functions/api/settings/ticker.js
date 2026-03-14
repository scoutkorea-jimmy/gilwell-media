/**
 * Gilwell Media · Ticker Settings
 *
 * GET /api/settings/ticker  ← public, returns ticker items
 * PUT /api/settings/ticker  ← admin only, update ticker items
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';

const DEFAULT_ITEMS = [
  '길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다',
  '한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다',
  'The BP Post · bpmedia.net',
];

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'ticker'`
    ).first();
    const items = row ? JSON.parse(row.value) : DEFAULT_ITEMS;
    return json({ items });
  } catch (err) {
    console.error('GET /api/settings/ticker error:', err);
    return json({ items: DEFAULT_ITEMS });
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
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: '항목 배열을 입력해주세요' }, 400);
  }

  const safe = items
    .map(s => String(s).trim())
    .filter(s => s.length > 0)
    .slice(0, 20);

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('ticker', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    return json({ items: safe });
  } catch (err) {
    console.error('PUT /api/settings/ticker error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
