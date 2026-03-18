import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureCalendarTable, normalizeCalendarInput, normalizeCalendarRows } from '../../_shared/calendar.js';

export async function onRequestPut({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json({ error: '잘못된 일정 ID입니다.' }, 400);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeCalendarInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);
  try {
    await ensureCalendarTable(env);
    const row = await env.DB.prepare(`
      UPDATE calendar_events
      SET title = ?, description = ?, location_name = ?, location_address = ?, start_at = ?, end_at = ?, link_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING id, title, description, location_name, location_address, start_at, end_at, link_url, created_at, updated_at
    `).bind(
      normalized.title,
      normalized.description,
      normalized.location_name,
      normalized.location_address,
      normalized.start_at,
      normalized.end_at,
      normalized.link_url,
      id
    ).first();
    if (!row) return json({ error: '일정을 찾을 수 없습니다.' }, 404);
    return json({ item: normalizeCalendarRows([row])[0] });
  } catch (err) {
    console.error('PUT /api/calendar/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return json({ error: '잘못된 일정 ID입니다.' }, 400);
  try {
    await ensureCalendarTable(env);
    await env.DB.prepare(`DELETE FROM calendar_events WHERE id = ?`).bind(id).run();
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
