/**
 * Dreampath · Board Posts
 * GET    /api/dreampath/posts?board=X&limit=N  — list posts
 * GET    /api/dreampath/posts?id=N             — single post with files + history
 * POST   /api/dreampath/posts                  — create (admin only)
 * PUT    /api/dreampath/posts?id=N             — update, saves history (any user, edit_note required)
 * DELETE /api/dreampath/posts?id=N             — delete (admin only)
 *
 * File objects in POST/PUT body.files:
 *   { url, name, type, size, is_image }
 */

const VALID_BOARDS = ['announcements', 'documents', 'minutes'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const id    = parseInt(url.searchParams.get('id') || '', 10);
  const board = url.searchParams.get('board');
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  // ── Single post with files + history ──────────────────────────
  if (id) {
    const post = await env.DB.prepare(
      `SELECT id, board, title, content, file_url, file_name,
              author_id, author_name, pinned, created_at, updated_at
         FROM dp_board_posts WHERE id = ?`
    ).bind(id).first();
    if (!post) return json({ error: 'Post not found.' }, 404);

    const filesRes = await env.DB.prepare(
      `SELECT id, file_url, file_name, file_type, file_size, is_image
         FROM dp_post_files WHERE post_id = ? ORDER BY created_at ASC`
    ).bind(id).all();

    const historyRes = await env.DB.prepare(
      `SELECT id, editor_name, edit_note, edited_at
         FROM dp_post_history WHERE post_id = ? ORDER BY edited_at DESC`
    ).bind(id).all();

    return json({
      post: {
        ...post,
        files:   filesRes.results   || [],
        history: historyRes.results || [],
      },
    });
  }

  // ── List posts ─────────────────────────────────────────────────
  if (board && !VALID_BOARDS.includes(board)) return json({ error: 'Invalid board.' }, 400);

  let rows;
  if (board) {
    rows = await env.DB.prepare(
      `SELECT id, board, title, content, file_url, file_name,
              author_name, pinned, created_at, updated_at
         FROM dp_board_posts WHERE board = ?
        ORDER BY pinned DESC, created_at DESC LIMIT ?`
    ).bind(board, limit).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT id, board, title, content, file_url, file_name,
              author_name, pinned, created_at, updated_at
         FROM dp_board_posts
        ORDER BY pinned DESC, created_at DESC LIMIT ?`
    ).bind(limit).all();
  }
  return json({ posts: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { board, title, content, pinned, files } = body;
  if (!board || !title) return json({ error: 'board and title are required.' }, 400);
  if (!VALID_BOARDS.includes(board)) return json({ error: 'Invalid board.' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO dp_board_posts (board, title, content, author_id, author_name, pinned)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    board,
    title.trim().slice(0, 200),
    content ? content.trim().slice(0, 50000) : null,
    data.dpUser.uid,
    data.dpUser.name,
    pinned ? 1 : 0
  ).run();

  const postId = result.meta.last_row_id;

  // Insert file attachments
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files) {
      if (!f.url || !f.name) continue;
      await env.DB.prepare(
        `INSERT INTO dp_post_files (post_id, file_url, file_name, file_type, file_size, is_image)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        postId,
        f.url.slice(0, 2000),
        f.name.slice(0, 300),
        (f.type || 'application/octet-stream').slice(0, 100),
        parseInt(f.size, 10) || 0,
        f.is_image ? 1 : 0
      ).run();
    }
  }

  return json({ id: postId, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (!body.edit_note || !body.edit_note.trim()) {
    return json({ error: 'edit_note (edit reason) is required.' }, 400);
  }

  // Save edit history before making changes
  const current = await env.DB.prepare(
    `SELECT title, content FROM dp_board_posts WHERE id = ?`
  ).bind(id).first();
  if (!current) return json({ error: 'Post not found.' }, 404);

  await env.DB.prepare(
    `INSERT INTO dp_post_history (post_id, editor_name, prev_title, prev_content, edit_note)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    data.dpUser.name,
    current.title,
    current.content,
    body.edit_note.trim().slice(0, 500)
  ).run();

  // Build update fields
  const fields = [];
  const values = [];
  if (body.title   !== undefined) { fields.push('title = ?');   values.push(body.title.trim().slice(0, 200)); }
  if (body.content !== undefined) { fields.push('content = ?'); values.push(body.content ? body.content.trim().slice(0, 50000) : null); }
  if (body.pinned  !== undefined) { fields.push('pinned = ?');  values.push(body.pinned ? 1 : 0); }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await env.DB.prepare(`UPDATE dp_board_posts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  // Replace file attachments if provided
  if (body.files !== undefined) {
    // Detect file changes and add to history
    const oldFiles = await env.DB.prepare(
      `SELECT file_name FROM dp_post_files WHERE post_id = ?`
    ).bind(id).all();
    const oldNames = (oldFiles.results || []).map(f => f.file_name).sort();
    const newNames = (Array.isArray(body.files) ? body.files : []).map(f => f.name).sort();
    const filesChanged = JSON.stringify(oldNames) !== JSON.stringify(newNames);
    if (filesChanged) {
      const removed = oldNames.filter(n => !newNames.includes(n));
      const added   = newNames.filter(n => !oldNames.includes(n));
      const fileNote = [
        removed.length ? `Removed: ${removed.join(', ')}` : null,
        added.length   ? `Added: ${added.join(', ')}` : null,
      ].filter(Boolean).join(' / ');
      await env.DB.prepare(
        `INSERT INTO dp_post_history (post_id, editor_name, prev_title, prev_content, edit_note)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, data.dpUser.name, current.title, current.content, `[Files changed] ${fileNote}`).run();
    }

    await env.DB.prepare(`DELETE FROM dp_post_files WHERE post_id = ?`).bind(id).run();
    if (Array.isArray(body.files)) {
      for (const f of body.files) {
        if (!f.url || !f.name) continue;
        await env.DB.prepare(
          `INSERT INTO dp_post_files (post_id, file_url, file_name, file_type, file_size, is_image)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          f.url.slice(0, 2000),
          f.name.slice(0, 300),
          (f.type || 'application/octet-stream').slice(0, 100),
          parseInt(f.size, 10) || 0,
          f.is_image ? 1 : 0
        ).run();
      }
    }
  }

  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (data.dpUser.role !== 'admin') return json({ error: 'Admin access required.' }, 403);
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_board_posts WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
