/**
 * Dreampath · Resources
 * GET    /api/dreampath/resources         — list all
 * POST   /api/dreampath/resources         — add new
 * DELETE /api/dreampath/resources?id=N    — delete by id
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(
    `SELECT id, title, url, description, category, added_by, created_at
       FROM dp_resources
      ORDER BY created_at DESC`
  ).all();
  return json({ resources: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { title, url, description, category, added_by } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return json({ error: '제목을 입력해주세요.' }, 400);
  }

  // Validate URL if provided
  if (url && url.trim()) {
    try { new URL(url.trim()); }
    catch { return json({ error: '올바른 URL 형식이 아닙니다.' }, 400); }
  }

  const safeTitle       = title.trim().slice(0, 200);
  const safeUrl         = url ? url.trim().slice(0, 1000) : null;
  const safeDescription = description ? description.trim().slice(0, 2000) : null;
  const safeCategory    = ['general', 'document', 'design', 'reference', 'video', 'other'].includes(category)
    ? category : 'general';
  const safeAddedBy     = added_by ? added_by.trim().slice(0, 50) : '익명';

  const result = await env.DB.prepare(
    `INSERT INTO dp_resources (title, url, description, category, added_by)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(safeTitle, safeUrl, safeDescription, safeCategory, safeAddedBy).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id가 필요합니다.' }, 400);

  await env.DB.prepare(`DELETE FROM dp_resources WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
