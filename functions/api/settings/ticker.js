/**
 * Gilwell Media · Ticker Settings
 *
 * GET /api/settings/ticker  ← public, returns ticker items
 * PUT /api/settings/ticker  ← admin only, update ticker items
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { DEFAULT_TICKER_ITEMS } from '../../_shared/site-copy.mjs';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'ticker'`
    ).first();
    const items = row ? JSON.parse(row.value) : DEFAULT_TICKER_ITEMS;
    return json({ items }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    console.error('GET /api/settings/ticker error:', err);
    return json({ items: DEFAULT_TICKER_ITEMS }, 200, publicCacheHeaders(300, 1800));
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

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: '항목 배열을 입력해주세요' }, 400);
  }

  const safe = items
    .map(s => String(s).trim())
    .filter(s => s.length > 0)
    .slice(0, 20);

  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ticker'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('ticker', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    await recordSettingChange(env, {
      key: 'ticker',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/ticker',
      message: '헤드라인 티커 설정 변경',
      details: { count: safe.length },
    });
    return json({ items: safe });
  } catch (err) {
    console.error('PUT /api/settings/ticker error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
