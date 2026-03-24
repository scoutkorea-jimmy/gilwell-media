/**
 * Dreampath · Calendar Events
 * GET    /api/dreampath/events?month=YYYY-MM  — list for month
 * GET    /api/dreampath/events?id=N           — single event with history
 * POST   /api/dreampath/events                — create (admin only)
 * PUT    /api/dreampath/events?id=N           — update (any user, edit_note required)
 * DELETE /api/dreampath/events?id=N           — delete (admin only)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const id    = parseInt(url.searchParams.get('id') || '', 10);
  const month = url.searchParams.get('month');

  // Single event with history
  if (id) {
    const event = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.type,
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

    return json({ event: { ...event, history: history.results || [] } });
  }

  // List by month (or all recent)
  let rows;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.type,
              u.display_name AS created_by_name, e.created_at
         FROM dp_events e
         LEFT JOIN dp_users u ON u.id = e.created_by
        WHERE e.start_date BETWEEN ? AND ?
        ORDER BY e.start_date ASC`
    ).bind(`${month}-01`, `${month}-31`).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.type,
              u.display_name AS created_by_name, e.created_at
         FROM dp_events e
         LEFT JOIN dp_users u ON u.id = e.created_by
        ORDER BY e.start_date DESC LIMIT 100`
    ).all();
  }
  return json({ events: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { title, description, start_date, end_date, type } = body;
  if (!title || !start_date) return json({ error: 'title and start_date are required.' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return json({ error: 'start_date must be YYYY-MM-DD.' }, 400);

  const safeType = ['general', 'deadline', 'meeting', 'milestone'].includes(type) ? type : 'general';
  const result = await env.DB.prepare(
    `INSERT INTO dp_events (title, description, start_date, end_date, type, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    title.trim().slice(0, 200),
    description ? description.trim().slice(0, 1000) : null,
    start_date,
    end_date || null,
    safeType,
    data.dpUser.uid
  ).run();
  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
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
    `SELECT title, description, start_date, end_date, type FROM dp_events WHERE id = ?`
  ).bind(id).first();
  if (!current) return json({ error: 'Event not found.' }, 404);

  // Save history
  await env.DB.prepare(
    `INSERT INTO dp_event_history
       (event_id, editor_name, prev_title, prev_description, prev_start_date, prev_end_date, prev_type, edit_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, data.dpUser.name,
    current.title, current.description, current.start_date, current.end_date, current.type,
    body.edit_note.trim().slice(0, 500)
  ).run();

  // Build update
  const fields = [], values = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title.trim().slice(0, 200)); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description ? body.description.trim().slice(0, 1000) : null); }
  if (body.start_date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) { fields.push('start_date = ?'); values.push(body.start_date); }
  if (body.end_date !== undefined) { fields.push('end_date = ?'); values.push(body.end_date || null); }
  if (body.type !== undefined) {
    fields.push('type = ?');
    values.push(['general','deadline','meeting','milestone'].includes(body.type) ? body.type : 'general');
  }
  if (fields.length) {
    values.push(id);
    await env.DB.prepare(`UPDATE dp_events SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_events WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
