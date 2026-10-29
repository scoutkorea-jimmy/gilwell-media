import { queryRust } from '../../_shared/rust-server.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { ensureCalendarTable } from '../../_shared/calendar.js';

export async function onRequestPut({ request, env, params }) {
  const __gate = await gateMenuAccess(request, env, 'calendar', 'write'); if (__gate) return __gate
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json({ error: '잘못된 일정 ID입니다.' }, 400);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  try {
    const input = await queryRust({request, env}, 'calendar-normalize', body);
    if (!input.ok) throw new Error('Rust calendar input normalization failed');
    const normalized = await input.json();
    if (normalized.error) return json({ error: normalized.error }, 400);
    await ensureCalendarTable(env);
    const {values} = normalized;
    const rust = await queryRust({request, env}, 'calendar-update', {values, id, expected:String(body.expected_updated_at || '')});
    if (!rust.ok) throw new Error('Rust calendar update failed');
    const {row, exists} = await rust.json();
    if (!row) {
      return exists ? json({ error: '다른 변경이 감지되었습니다. 입력을 유지했습니다. 최신 일정을 확인한 뒤 다시 수정해주세요.' }, 409) : json({ error: '일정을 찾을 수 없습니다.' }, 404);
    }
    return json({ item: row });
  } catch (err) {
    console.error('PUT /api/calendar/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const __gate = await gateMenuAccess(request, env, 'calendar', 'write'); if (__gate) return __gate
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json({ error: '잘못된 일정 ID입니다.' }, 400);
  try {
    await ensureCalendarTable(env);
    const rust = await queryRust({request, env}, 'calendar-delete', {id});
    if (!rust.ok) throw new Error('Rust calendar delete failed');
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/calendar/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}
