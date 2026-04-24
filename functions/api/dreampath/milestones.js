/**
 * Dreampath · Milestones & Discussions
 * GET    /api/dreampath/milestones                     — list milestones with discussions
 * POST   /api/dreampath/milestones                     — create milestone
 * PUT    /api/dreampath/milestones?id=N                — update milestone
 * DELETE /api/dreampath/milestones?id=N                — delete milestone
 * POST   /api/dreampath/milestones?action=discuss&id=N — add discussion
 * DELETE /api/dreampath/milestones?action=discuss&id=N — delete discussion
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_STATUSES = ['active', 'completed'];

export async function onRequestGet({ env }) {
  const milestones = await env.DB.prepare(
    `SELECT id, title, description, due_date, status, sort_order, created_at
       FROM dp_milestones
      ORDER BY sort_order ASC, created_at ASC`
  ).all();

  const discussions = await env.DB.prepare(
    `SELECT id, milestone_id, content, author, created_at
       FROM dp_discussions
      ORDER BY created_at ASC`
  ).all();

  const discMap = {};
  for (const d of (discussions.results || [])) {
    if (!discMap[d.milestone_id]) discMap[d.milestone_id] = [];
    discMap[d.milestone_id].push(d);
  }

  const result = (milestones.results || []).map(m => ({
    ...m,
    discussions: discMap[m.id] || [],
  }));

  return json({ milestones: result });
}

export async function onRequestPost({ request, env }) {
  const url    = new URL(request.url);
  const action = url.searchParams.get('action');

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  // Add discussion
  if (action === 'discuss') {
    const id = parseInt(url.searchParams.get('id') || '', 10);
    if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);
    const { content, author } = body;
    if (!content || !content.trim()) return json({ error: 'Content is required.' }, 400);
    const result = await env.DB.prepare(
      `INSERT INTO dp_discussions (milestone_id, content, author) VALUES (?, ?, ?)`
    ).bind(id, content.trim().slice(0, 2000), author ? author.trim().slice(0, 50) : 'Anonymous').run();
    return json({ id: result.meta.last_row_id, ok: true });
  }

  // Create milestone
  const { title, description, due_date, status } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return json({ error: 'Title is required.' }, 400);
  }

  const maxOrder = await env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) as m FROM dp_milestones`
  ).first();
  const sortOrder = (maxOrder?.m || 0) + 1;

  const result = await env.DB.prepare(
    `INSERT INTO dp_milestones (title, description, due_date, status, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    title.trim().slice(0, 200),
    description ? description.trim().slice(0, 2000) : null,
    due_date ? due_date.trim().slice(0, 20) : null,
    VALID_STATUSES.includes(status) ? status : 'active',
    sortOrder
  ).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title.trim().slice(0, 200)); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description ? body.description.trim().slice(0, 2000) : null); }
  if (body.due_date !== undefined) { fields.push('due_date = ?'); values.push(body.due_date ? body.due_date.trim().slice(0, 20) : null); }
  if (body.status !== undefined && VALID_STATUSES.includes(body.status)) { fields.push('status = ?'); values.push(body.status); }

  if (fields.length === 0) return json({ error: 'No fields to update.' }, 400);
  values.push(id);
  await env.DB.prepare(`UPDATE dp_milestones SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url    = new URL(request.url);
  const id     = parseInt(url.searchParams.get('id') || '', 10);
  const action = url.searchParams.get('action');

  if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);

  if (action === 'discuss') {
    await env.DB.prepare(`DELETE FROM dp_discussions WHERE id = ?`).bind(id).run();
  } else {
    await env.DB.prepare(`DELETE FROM dp_milestones WHERE id = ?`).bind(id).run();
  }
  return json({ ok: true });
}
