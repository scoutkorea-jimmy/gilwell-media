import { queryRust } from '../../_shared/rust-server.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { ensureCalendarTable } from '../../_shared/calendar.js';

export async function onRequestGet({ request, env }) {
  try {
    await ensureCalendarTable(env);
    const rust = await queryRust({request, env}, 'calendar-list', {});
    if (!rust.ok) throw new Error('Rust calendar list failed');
    const { items: results } = await rust.json();
    return json({ items: results || [] }, 200, {
      'Cache-Control': request && new URL(request.url).searchParams.get('scope') === 'admin' ? 'no-store' : 'public, max-age=120, s-maxage=120, stale-while-revalidate=600',
    });
  } catch (err) {
    console.error('GET /api/calendar error:', err);
    return json({ items: [], error: 'Database error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'calendar', 'write'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  try {
    const input = await queryRust({request, env}, 'calendar-normalize', body);
    if (!input.ok) throw new Error('Rust calendar input normalization failed');
    const normalized = await input.json();
    if (normalized.error) return json({ error: normalized.error }, 400);
    await ensureCalendarTable(env);
    const {values} = normalized;
    const rust = await queryRust({request, env}, 'calendar-create', {values});
    if (!rust.ok) throw new Error('Rust calendar create failed');
    const {row} = await rust.json();
    return json({ item: row }, 201);
  } catch (err) {
    console.error('POST /api/calendar error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}
