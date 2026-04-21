import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureCalendarTable, normalizeCalendarInput, normalizeCalendarRows } from '../../_shared/calendar.js';

export async function onRequestGet({ env }) {
  try {
    await ensureCalendarTable(env);
    const { results } = await env.DB.prepare(`
      SELECT
        c.id,
        c.title,
        c.title_original,
        c.event_category,
        c.event_tags,
        c.description,
        c.country_name,
        c.location_name,
        c.location_address,
        c.latitude,
        c.longitude,
        c.related_post_id,
        c.related_posts_json,
        p.title AS related_post_title,
        p.category AS related_post_category,
        c.start_at,
        c.start_has_time,
        c.end_at,
        c.end_has_time,
        c.link_url,
        c.target_groups,
        c.created_at,
        c.updated_at
      FROM calendar_events c
      LEFT JOIN posts p ON p.id = c.related_post_id
      ORDER BY c.start_at ASC, c.id ASC
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
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
  const normalized = normalizeCalendarInput(body);
  if (normalized.error) return json({ error: normalized.error }, 400);
  try {
    await ensureCalendarTable(env);
    const row = await env.DB.prepare(`
      INSERT INTO calendar_events (
        title, title_original, event_category, event_tags, description, country_name, location_name, location_address,
        latitude, longitude, related_post_id, related_posts_json, start_at, start_has_time, end_at, end_has_time, link_url, target_groups, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING id, title, title_original, event_category, event_tags, description, country_name, location_name, location_address,
        latitude, longitude, related_post_id, related_posts_json, start_at, start_has_time, end_at, end_has_time, link_url, target_groups, created_at, updated_at
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
      normalized.target_groups
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
