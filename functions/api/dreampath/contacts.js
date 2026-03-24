/**
 * Dreampath · Emergency Contacts
 * GET    /api/dreampath/contacts
 * POST   /api/dreampath/contacts          (admin)
 * PUT    /api/dreampath/contacts?id=N     (admin)
 * DELETE /api/dreampath/contacts?id=N     (admin)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ env }) {
  const contacts = await env.DB.prepare(
    `SELECT id, name, role_title, department, phone, email, note, sort_order
       FROM dp_contacts ORDER BY sort_order ASC, name ASC`
  ).all();

  const team = await env.DB.prepare(
    `SELECT id, display_name AS name, role_title, department, phone, email, emergency_note AS note
       FROM dp_users WHERE is_active = 1 ORDER BY display_name ASC`
  ).all();

  return json({ contacts: contacts.results || [], team: team.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, role_title, phone, email, department, note } = body;
  if (!name) return json({ error: 'name is required.' }, 400);

  const maxOrder = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM dp_contacts`).first();
  const result = await env.DB.prepare(
    `INSERT INTO dp_contacts (name, role_title, phone, email, department, note, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    name.trim().slice(0, 100),
    role_title ? role_title.trim().slice(0, 100) : null,
    phone ? phone.trim().slice(0, 50) : null,
    email ? email.trim().slice(0, 200) : null,
    department ? department.trim().slice(0, 100) : null,
    note ? note.trim().slice(0, 500) : null,
    (maxOrder?.m || 0) + 1
  ).run();
  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [], values = [];
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name.trim().slice(0, 100)); }
  if (body.role_title !== undefined) { fields.push('role_title = ?'); values.push(body.role_title ? body.role_title.trim().slice(0, 100) : null); }
  if (body.phone !== undefined) { fields.push('phone = ?'); values.push(body.phone ? body.phone.trim().slice(0, 50) : null); }
  if (body.email !== undefined) { fields.push('email = ?'); values.push(body.email ? body.email.trim().slice(0, 200) : null); }
  if (body.department !== undefined) { fields.push('department = ?'); values.push(body.department ? body.department.trim().slice(0, 100) : null); }
  if (body.note !== undefined) { fields.push('note = ?'); values.push(body.note ? body.note.trim().slice(0, 500) : null); }

  if (!fields.length) return json({ error: 'Nothing to update.' }, 400);
  values.push(id);
  await env.DB.prepare(`UPDATE dp_contacts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_contacts WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
