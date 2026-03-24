/**
 * Dreampath · Calendar Events
 * GET    /api/dreampath/events?month=YYYY-MM  — list events for month (or all if no param)
 * POST   /api/dreampath/events                — create (admin only)
 * DELETE /api/dreampath/events?id=N           — delete (admin only)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const month = url.searchParams.get('month'); // YYYY-MM

  let rows;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const end   = `${month}-31`;
    rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.type, u.display_name as created_by_name, e.created_at
         FROM dp_events e
         LEFT JOIN dp_users u ON u.id = e.created_by
        WHERE e.start_date BETWEEN ? AND ?
        ORDER BY e.start_date ASC`
    ).bind(start, end).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.type, u.display_name as created_by_name, e.created_at
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

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_events WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
