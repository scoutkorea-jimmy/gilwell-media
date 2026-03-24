/**
 * Dreampath · Post Comments
 *
 * GET    /api/dreampath/comments?post_id=N  — list comments for a post
 * POST   /api/dreampath/comments            — add comment { post_id, content }
 * DELETE /api/dreampath/comments?id=N       — delete (own comment or admin)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ request, env }) {
  const url     = new URL(request.url);
  const post_id = parseInt(url.searchParams.get('post_id') || '', 10);
  if (!post_id) return json({ error: 'post_id is required.' }, 400);

  const rows = await env.DB.prepare(
    `SELECT id, author_id, author_name, content, created_at
       FROM dp_post_comments
      WHERE post_id = ?
      ORDER BY created_at ASC`
  ).bind(post_id).all();
  return json({ comments: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { post_id, content } = body;
  if (!post_id || !content?.trim()) {
    return json({ error: 'post_id and content are required.' }, 400);
  }

  const uid  = data.dpUser.uid;
  const name = data.dpUser.name;

  const result = await env.DB.prepare(
    `INSERT INTO dp_post_comments (post_id, author_id, author_name, content)
     VALUES (?, ?, ?, ?)`
  ).bind(post_id, uid, name, content.trim().slice(0, 2000)).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  const comment = await env.DB.prepare(
    `SELECT author_id FROM dp_post_comments WHERE id = ?`
  ).bind(id).first();
  if (!comment) return json({ error: 'Comment not found.' }, 404);

  if (data.dpUser.role !== 'admin' && comment.author_id !== data.dpUser.uid) {
    return json({ error: 'Not authorized.' }, 403);
  }

  await env.DB.prepare(`DELETE FROM dp_post_comments WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
