/**
 * Dreampath · Calendar Events
 * GET    /api/dreampath/events?month=YYYY-MM  — list for month
 * GET    /api/dreampath/events?id=N           — single event with history
 * POST   /api/dreampath/events                — create (admin only)
 * PUT    /api/dreampath/events?id=N           — update (any user, edit_note required)
 * DELETE /api/dreampath/events?id=N           — delete (admin only)
 */

import { requirePerm } from '../../_shared/dreampath-perm.js';

const VALID_RECURRENCE = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// Expand recurring events into individual occurrences within a date range
function expandRecurring(events, rangeStart, rangeEnd) {
  const result = [];
  for (const ev of events) {
    result.push(ev);
    if (!ev.recurrence_type || !VALID_RECURRENCE.includes(ev.recurrence_type)) continue;

    const s = new Date(ev.start_date + 'T00:00:00');
    const dur = ev.end_date ? (new Date(ev.end_date + 'T00:00:00') - s) : 0;
    const recEnd = ev.recurrence_end ? new Date(ev.recurrence_end + 'T00:00:00') : new Date(rangeEnd + 'T00:00:00');
    const limit = 60; // safety cap
    let count = 0;
    let cur = new Date(s);

    while (count < limit) {
      // Advance to next occurrence
      switch (ev.recurrence_type) {
        case 'daily':    cur.setDate(cur.getDate() + 1); break;
        case 'weekly':   cur.setDate(cur.getDate() + 7); break;
        case 'biweekly': cur.setDate(cur.getDate() + 14); break;
        case 'monthly':  cur.setMonth(cur.getMonth() + 1); break;
        case 'yearly':   cur.setFullYear(cur.getFullYear() + 1); break;
      }
      count++;
      if (cur > recEnd) break;

      const occStart = cur.toISOString().slice(0, 10);
      const occEnd = dur ? new Date(cur.getTime() + dur).toISOString().slice(0, 10) : null;
      if (occStart > rangeEnd) break;
      if ((occEnd || occStart) < rangeStart) continue;

      result.push({
        ...ev,
        start_date: occStart,
        end_date: occEnd,
        _recurring_instance: true,
        _original_date: ev.start_date,
      });
    }
  }
  return result;
}

export async function onRequestGet({ request, env, data }) {
  const denied = requirePerm(data, 'view:calendar'); if (denied) return denied;
  const url   = new URL(request.url);
  const id    = parseInt(url.searchParams.get('id') || '', 10);
  const month = url.searchParams.get('month');

  // Single event with history
  if (id) {
    const event = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.start_time, e.end_time, e.type,
              e.recurrence_type, e.recurrence_end,
              u.display_name AS created_by_name, e.created_at
         FROM dp_events e
         LEFT JOIN dp_users u ON u.id = e.created_by
        WHERE e.id = ?`
    ).bind(id).first();
    if (!event) return json({ error: 'Event not found.' }, 404);

    const history = await env.DB.prepare(
      `SELECT id, editor_name, prev_title, prev_start_date, prev_end_date, prev_type, edit_note, edited_at
         FROM dp_event_history
        WHERE event_id = ?
        ORDER BY edited_at DESC`
    ).bind(id).all();

    // Fetch linked meeting minutes posts
    const linkedMinutes = await env.DB.prepare(
      `SELECT id, title, author_name, created_at
         FROM dp_board_posts
        WHERE board = 'minutes' AND linked_event_id = ?
        ORDER BY created_at DESC`
    ).bind(id).all();

    return json({ event: { ...event, history: history.results || [], linked_minutes: linkedMinutes.results || [] } });
  }

  // List by month (or all recent)
  let rows;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const rangeStart = `${month}-01`;
    const rangeEnd = `${month}-31`;
    // Fetch events in this month + recurring events that started before this month
    rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.start_time, e.end_time, e.type,
              e.recurrence_type, e.recurrence_end,
              u.display_name AS created_by_name, e.created_at
         FROM dp_events e
         LEFT JOIN dp_users u ON u.id = e.created_by
        WHERE e.start_date BETWEEN ? AND ?
           OR (e.recurrence_type IS NOT NULL AND e.start_date <= ? AND (e.recurrence_end IS NULL OR e.recurrence_end >= ?))
        ORDER BY e.start_date ASC, e.start_time ASC`
    ).bind(rangeStart, rangeEnd, rangeEnd, rangeStart).all();
    const expanded = expandRecurring(rows.results || [], rangeStart, rangeEnd);
    return json({ events: expanded });
  } else {
    rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.start_time, e.end_time, e.type,
              e.recurrence_type, e.recurrence_end,
              u.display_name AS created_by_name, e.created_at
         FROM dp_events e
         LEFT JOIN dp_users u ON u.id = e.created_by
        ORDER BY e.start_date DESC LIMIT 100`
    ).all();
  }
  return json({ events: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const denied = requirePerm(data, 'write:calendar'); if (denied) return denied;
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { title, description, start_date, end_date, start_time, end_time, type, recurrence_type, recurrence_end } = body;
  if (!title || !start_date) return json({ error: 'title and start_date are required.' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return json({ error: 'start_date must be YYYY-MM-DD.' }, 400);

  const safeType = ['general', 'deadline', 'meeting', 'milestone'].includes(type) ? type : 'general';
  const safeTime = t => (t && /^\d{2}:\d{2}$/.test(t)) ? t : null;
  const safeRecurrence = VALID_RECURRENCE.includes(recurrence_type) ? recurrence_type : null;
  const safeRecEnd = (safeRecurrence && recurrence_end && /^\d{4}-\d{2}-\d{2}$/.test(recurrence_end)) ? recurrence_end : null;
  const result = await env.DB.prepare(
    `INSERT INTO dp_events (title, description, start_date, end_date, start_time, end_time, type, recurrence_type, recurrence_end, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title.trim().slice(0, 200),
    description ? description.trim().slice(0, 1000) : null,
    start_date,
    end_date || null,
    safeTime(start_time),
    safeTime(end_time),
    safeType,
    safeRecurrence,
    safeRecEnd,
    data.dpUser.uid
  ).run();
  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const denied = requirePerm(data, 'write:calendar'); if (denied) return denied;
  // Any authenticated user can edit — middleware already verified the token
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // edit_note is mandatory
  if (!body.edit_note || !body.edit_note.trim()) {
    return json({ error: 'edit_note (edit reason) is required.' }, 400);
  }

  const current = await env.DB.prepare(
    `SELECT title, description, start_date, end_date, start_time, end_time, type FROM dp_events WHERE id = ?`
  ).bind(id).first();
  if (!current) return json({ error: 'Event not found.' }, 404);

  // Save history
  await env.DB.prepare(
    `INSERT INTO dp_event_history
       (event_id, editor_name, prev_title, prev_description, prev_start_date, prev_end_date, prev_type, edit_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, data.dpUser.name,
    current.title, current.description,
    current.start_date + (current.start_time ? ' ' + current.start_time : ''),
    current.end_date ? current.end_date + (current.end_time ? ' ' + current.end_time : '') : null,
    current.type,
    body.edit_note.trim().slice(0, 500)
  ).run();

  // Build update
  const fields = [], values = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title.trim().slice(0, 200)); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description ? body.description.trim().slice(0, 1000) : null); }
  if (body.start_date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) { fields.push('start_date = ?'); values.push(body.start_date); }
  if (body.end_date !== undefined) { fields.push('end_date = ?'); values.push(body.end_date || null); }
  if (body.start_time !== undefined) {
    fields.push('start_time = ?');
    const t = body.start_time;
    values.push((t && /^\d{2}:\d{2}$/.test(t)) ? t : null);
  }
  if (body.end_time !== undefined) {
    fields.push('end_time = ?');
    const t = body.end_time;
    values.push((t && /^\d{2}:\d{2}$/.test(t)) ? t : null);
  }
  if (body.type !== undefined) {
    fields.push('type = ?');
    values.push(['general','deadline','meeting','milestone'].includes(body.type) ? body.type : 'general');
  }
  if (body.recurrence_type !== undefined) {
    fields.push('recurrence_type = ?');
    values.push(VALID_RECURRENCE.includes(body.recurrence_type) ? body.recurrence_type : null);
  }
  if (body.recurrence_end !== undefined) {
    fields.push('recurrence_end = ?');
    values.push((body.recurrence_end && /^\d{4}-\d{2}-\d{2}$/.test(body.recurrence_end)) ? body.recurrence_end : null);
  }
  if (fields.length) {
    values.push(id);
    await env.DB.prepare(`UPDATE dp_events SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const denied = requirePerm(data, 'write:calendar'); if (denied) return denied;
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_events WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
