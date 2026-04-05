/**
 * Dreampath · Replies (답글)
 *
 * GET    /api/dreampath/replies?parent_type=post|note&parent_id=N
 * POST   /api/dreampath/replies  { parent_type, parent_id, content }
 * DELETE /api/dreampath/replies?id=N
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_PARENT_TYPES = ['post', 'note'];

export async function onRequestGet({ request, env }) {
  const url         = new URL(request.url);
  const parent_type = url.searchParams.get('parent_type');
  const parent_id   = parseInt(url.searchParams.get('parent_id') || '', 10);

  if (!VALID_PARENT_TYPES.includes(parent_type)) {
    return json({ error: 'parent_type must be "post" or "note".' }, 400);
  }
  if (!parent_id || isNaN(parent_id)) {
    return json({ error: 'parent_id is required.' }, 400);
  }

  const rows = await env.DB.prepare(
    `SELECT id, parent_type, parent_id, content, author_id, author_name, created_at, updated_at
       FROM dp_replies
      WHERE parent_type = ? AND parent_id = ?
      ORDER BY created_at ASC`
  ).bind(parent_type, parent_id).all();

  return json({ replies: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { parent_type, parent_id, content } = body;

  if (!VALID_PARENT_TYPES.includes(parent_type)) {
    return json({ error: 'parent_type must be "post" or "note".' }, 400);
  }
  if (!parent_id || typeof parent_id !== 'number') {
    return json({ error: 'parent_id is required.' }, 400);
  }
  if (!content?.trim()) {
    return json({ error: 'Content is required.' }, 400);
  }

  const uid  = data.dpUser.uid;
  const name = data.dpUser.name;

  const result = await env.DB.prepare(
    `INSERT INTO dp_replies (parent_type, parent_id, content, author_id, author_name)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(parent_type, parent_id, content.trim().slice(0, 5000), uid, name).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id is required.' }, 400);

  const reply = await env.DB.prepare(
    `SELECT author_id FROM dp_replies WHERE id = ?`
  ).bind(id).first();
  if (!reply) return json({ error: 'Reply not found.' }, 404);

  if (data.dpUser.role !== 'admin' && reply.author_id !== data.dpUser.uid) {
    return json({ error: 'Not authorized.' }, 403);
  }

  await env.DB.prepare(`DELETE FROM dp_replies WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
