/**
 * Dreampath · Board Posts
 * GET    /api/dreampath/posts?board=X&limit=N  — list posts for board
 * POST   /api/dreampath/posts                  — create post (admin only)
 * PUT    /api/dreampath/posts?id=N             — update post (admin only)
 * DELETE /api/dreampath/posts?id=N             — delete post (admin only)
 */

const VALID_BOARDS = ['announcements', 'documents', 'minutes'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const board = url.searchParams.get('board');
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const id    = parseInt(url.searchParams.get('id') || '', 10);

  // Single post
  if (id) {
    const post = await env.DB.prepare(
      `SELECT id, board, title, content, file_url, file_name, author_name, pinned, created_at, updated_at
         FROM dp_board_posts WHERE id = ?`
    ).bind(id).first();
    if (!post) return json({ error: 'Post not found.' }, 404);
    return json({ post });
  }

  if (board && !VALID_BOARDS.includes(board)) return json({ error: 'Invalid board.' }, 400);

  let query, binds;
  if (board) {
    query = `SELECT id, board, title, content, file_url, file_name, author_name, pinned, created_at, updated_at
               FROM dp_board_posts WHERE board = ?
              ORDER BY pinned DESC, created_at DESC LIMIT ?`;
    binds = [board, limit];
  } else {
    query = `SELECT id, board, title, content, file_url, file_name, author_name, pinned, created_at, updated_at
               FROM dp_board_posts
              ORDER BY pinned DESC, created_at DESC LIMIT ?`;
    binds = [limit];
  }

  const rows = await env.DB.prepare(query).bind(...binds).all();
  return json({ posts: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { board, title, content, file_url, file_name, pinned } = body;
  if (!board || !title) return json({ error: 'board and title are required.' }, 400);
  if (!VALID_BOARDS.includes(board)) return json({ error: 'Invalid board.' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO dp_board_posts (board, title, content, file_url, file_name, author_id, author_name, pinned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    board,
    title.trim().slice(0, 200),
    content ? content.trim().slice(0, 50000) : null,
    file_url ? file_url.trim().slice(0, 1000) : null,
    file_name ? file_name.trim().slice(0, 200) : null,
    data.dpUser.uid,
    data.dpUser.name,
    pinned ? 1 : 0
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

  const fields = [];
  const values = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title.trim().slice(0, 200)); }
  if (body.content !== undefined) { fields.push('content = ?'); values.push(body.content ? body.content.trim().slice(0, 50000) : null); }
  if (body.file_url !== undefined) { fields.push('file_url = ?'); values.push(body.file_url ? body.file_url.trim().slice(0, 1000) : null); }
  if (body.file_name !== undefined) { fields.push('file_name = ?'); values.push(body.file_name ? body.file_name.trim().slice(0, 200) : null); }
  if (body.pinned !== undefined) { fields.push('pinned = ?'); values.push(body.pinned ? 1 : 0); }

  if (!fields.length) return json({ error: 'Nothing to update.' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE dp_board_posts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_board_posts WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
