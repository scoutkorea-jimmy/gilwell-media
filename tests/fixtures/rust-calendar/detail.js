import { gateMenuAccess } from '../../../functions/_shared/admin-permissions.js';
import { ensureCalendarTable, normalizeCalendarInput, normalizeCalendarRows } from '../../../functions/_shared/calendar.js';

export async function onRequestPut({ request, env, params }) {
  const __gate = await gateMenuAccess(request, env, 'calendar', 'write'); if (__gate) return __gate
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
      SET title = ?, title_original = ?, event_category = ?, event_tags = ?, description = ?, country_name = ?, location_name = ?, location_address = ?, latitude = ?, longitude = ?, related_post_id = ?, related_posts_json = ?, start_at = ?, start_has_time = ?, end_at = ?, end_has_time = ?, link_url = ?, target_groups = ?, updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f', updated_at, '+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f', 'now') END
      WHERE id = ? AND (? = '' OR updated_at = ?)
      RETURNING id, title, title_original, event_category, event_tags, description, country_name, location_name, location_address, latitude, longitude, related_post_id, related_posts_json, start_at, start_has_time, end_at, end_has_time, link_url, target_groups, created_at, updated_at
    `).bind(
      normalized.title,
      normalized.title_original,
      normalized.event_category,
      normalized.event_tags,
      normalized.description,
      normalized.country_name,
      normalized.location_name,
      normalized.location_address,
      normalized.latitude,
      normalized.longitude,
      normalized.related_post_id,
      normalized.related_posts_json,
      normalized.start_at,
      normalized.start_has_time,
      normalized.end_at,
      normalized.end_has_time,
      normalized.link_url,
      normalized.target_groups,
      id,
      String(body.expected_updated_at || ''),
      String(body.expected_updated_at || '')
    ).first();
    if (!row) {
      const existing = await env.DB.prepare('SELECT id FROM calendar_events WHERE id = ?').bind(id).first();
      return existing ? json({ error: '다른 변경이 감지되었습니다. 입력을 유지했습니다. 최신 일정을 확인한 뒤 다시 수정해주세요.' }, 409) : json({ error: '일정을 찾을 수 없습니다.' }, 404);
    }
    return json({ item: normalizeCalendarRows([row])[0] });
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
