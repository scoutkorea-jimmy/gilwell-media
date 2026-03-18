import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureCalendarTable, normalizeCalendarInput, normalizeCalendarRows } from '../../_shared/calendar.js';

export async function onRequestGet({ env }) {
  try {
    await ensureCalendarTable(env);
    const { results } = await env.DB.prepare(`
      SELECT id, title, event_category, description, country_name, location_name, location_address, latitude, longitude, start_at, end_at, link_url, created_at, updated_at
      FROM calendar_events
      ORDER BY start_at ASC, id ASC
    `).all();
    return json({ items: normalizeCalendarRows(results || []) }, 200, {
      'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=600',
    });
  } catch (err) {
    console.error('GET /api/calendar error:', err);
    return json({ items: [], error: 'Database error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeCalendarInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);
  try {
    await ensureCalendarTable(env);
    const row = await env.DB.prepare(`
      INSERT INTO calendar_events (title, event_category, description, country_name, location_name, location_address, latitude, longitude, start_at, end_at, link_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING id, title, event_category, description, country_name, location_name, location_address, latitude, longitude, start_at, end_at, link_url, created_at, updated_at
    `).bind(
      normalized.title,
      normalized.event_category,
      normalized.description,
      normalized.country_name,
      normalized.location_name,
      normalized.location_address,
      normalized.latitude,
      normalized.longitude,
      normalized.start_at,
      normalized.end_at,
      normalized.link_url
    ).first();
    return json({ item: normalizeCalendarRows([row])[0] }, 201);
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
