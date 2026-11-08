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
import { queryRust } from '../../_shared/rust-server.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'picks-order', {operation:'get'});
    if (!response.ok) throw new Error('Rust picks order query failed');
    const { items } = await response.json();
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
  try {
    const response = await queryRust({env, request}, 'picks-order', {operation:'put', items:ids});
    if (!response.ok) throw new Error('Rust picks order save failed');
    const { items: final, previous: prev } = await response.json();
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
