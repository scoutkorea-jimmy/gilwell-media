/**
 * BP미디어 · Editor Picks Order
 *
 * GET /api/settings/picks-order   ← public, returns saved post-id order
 * PUT /api/settings/picks-order   ← admin only, replace order
 *
 * The home picks loader and the admin picks panel both read this list and
 * sort featured posts by index. Posts not in the list fall back to publish
 * date order at the end, so picks_order is purely an override hint.
 */
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'picks_order'`).first();
    const items = row ? safeParse(row.value) : [];
    return json({ items });
  } catch (err) {
    console.error('GET /api/settings/picks-order error:', err);
    return json({ items: [] });
  }
}

export async function onRequestPut({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'picks', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const ids = Array.isArray(body && body.items) ? body.items : [];
  const seen = new Set();
  const final = [];
  for (const raw of ids) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    final.push(n);
    if (final.length >= 20) break;
  }

  try {
    const prev = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'picks_order'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('picks_order', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(final)).run();
    await recordSettingChange(env, {
      key: 'picks_order',
      previousValue: prev && prev.value,
      path: '/api/settings/picks-order',
      message: '에디터 추천 노출 순서 변경',
      details: { count: final.length },
    });
    return json({ items: final });
  } catch (err) {
    console.error('PUT /api/settings/picks-order error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch (_) { return []; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
