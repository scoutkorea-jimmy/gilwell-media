/**
 * Dreampath · Notes & Issues
 * GET    /api/dreampath/notes
 * POST   /api/dreampath/notes
 * PUT    /api/dreampath/notes?id=N
 * DELETE /api/dreampath/notes?id=N
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_TYPES      = ['note', 'issue', 'warning'];
const VALID_STATUSES   = ['open', 'resolved'];
const VALID_PRIORITIES = ['low', 'normal', 'high'];

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(
    `SELECT id, title, content, type, status, priority, added_by, created_at, updated_at
       FROM dp_notes
      ORDER BY
        CASE status WHEN 'open' THEN 0 ELSE 1 END,
        CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        created_at DESC`
  ).all();
  return json({ notes: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { title, content, type, priority, added_by } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return json({ error: '제목을 입력해주세요.' }, 400);
  }

  const safeTitle    = title.trim().slice(0, 200);
  const safeContent  = content ? content.trim().slice(0, 5000) : null;
  const safeType     = VALID_TYPES.includes(type) ? type : 'note';
  const safePriority = VALID_PRIORITIES.includes(priority) ? priority : 'normal';
  const safeAddedBy  = added_by ? added_by.trim().slice(0, 50) : '익명';

  const result = await env.DB.prepare(
    `INSERT INTO dp_notes (title, content, type, priority, added_by)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(safeTitle, safeContent, safeType, safePriority, safeAddedBy).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id가 필요합니다.' }, 400);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];

  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title.trim().slice(0, 200)); }
  if (body.content !== undefined) { fields.push('content = ?'); values.push(body.content ? body.content.trim().slice(0, 5000) : null); }
  if (body.type !== undefined && VALID_TYPES.includes(body.type)) { fields.push('type = ?'); values.push(body.type); }
  if (body.status !== undefined && VALID_STATUSES.includes(body.status)) { fields.push('status = ?'); values.push(body.status); }
  if (body.priority !== undefined && VALID_PRIORITIES.includes(body.priority)) { fields.push('priority = ?'); values.push(body.priority); }

  if (fields.length === 0) return json({ error: '변경할 내용이 없습니다.' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE dp_notes SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id가 필요합니다.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_notes WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
