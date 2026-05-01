/**
 * Dreampath · Post Comments
 *
 * GET    /api/dreampath/comments?post_id=N  — list comments (view:<board-scope>)
 * POST   /api/dreampath/comments            — add comment (view:<board-scope> — can comment on anything you can read)
 * DELETE /api/dreampath/comments?id=N       — delete (own comment or admin)
 *
 * Comment permissions inherit from the parent post's board: if you can VIEW
 * the post, you can see + add comments. Write:<board> is not required for
 * commenting — otherwise a Viewer could never discuss an Announcement.
 */

import { hasPerm, boardScope } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Loads the parent post's board so we can map to the right permission scope.
async function _postBoard(env, postId) {
  const row = await env.DB.prepare(`SELECT board FROM dp_board_posts WHERE id = ?`).bind(postId).first();
  return row ? row.board : null;
}

export async function onRequestGet({ request, env, data }) {
  const url     = new URL(request.url);
  const post_id = parseInt(url.searchParams.get('post_id') || '', 10);
  if (!post_id) return json({ error: 'post_id is required.' }, 400);

  const board = await _postBoard(env, post_id);
  if (!board) return json({ error: 'Parent post not found.' }, 404);
  if (!hasPerm(data.dpUser, boardScope(board, 'view'))) {
    return json({ error: 'You do not have permission to view these comments.' }, 403);
  }

  const rows = await env.DB.prepare(
    `SELECT id, author_id, author_name, content, parent_id, created_at
       FROM dp_post_comments
      WHERE post_id = ?
      ORDER BY created_at ASC`
  ).bind(post_id).all();
  return json({ comments: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { post_id, content, parent_id } = body;
  if (!post_id || !content?.trim()) {
    return json({ error: 'post_id and content are required.' }, 400);
  }

  const board = await _postBoard(env, post_id);
  if (!board) return json({ error: 'Parent post not found.' }, 404);
  if (!hasPerm(data.dpUser, boardScope(board, 'view'))) {
    return json({ error: 'You do not have permission to comment here.' }, 403);
  }

  const safeParentId = parent_id ? parseInt(parent_id, 10) || null : null;
  if (safeParentId) {
    const parent = await env.DB.prepare(`SELECT id, post_id FROM dp_post_comments WHERE id = ?`).bind(safeParentId).first();
    if (!parent) return json({ error: 'Parent comment not found.' }, 400);
    if (Number(parent.post_id) !== Number(post_id)) {
      return json({ error: 'Parent comment does not belong to this post.' }, 400);
    }
  }

  const uid  = data.dpUser.uid;
  const name = data.dpUser.name;

  const result = await env.DB.prepare(
    `INSERT INTO dp_post_comments (post_id, author_id, author_name, content, parent_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(post_id, uid, name, content.trim().slice(0, 2000), safeParentId).run();

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

  const result = await env.DB.prepare(
    `WITH RECURSIVE comment_tree(id) AS (
       SELECT id FROM dp_post_comments WHERE id = ?
       UNION ALL
       SELECT c.id
         FROM dp_post_comments c
         JOIN comment_tree t ON c.parent_id = t.id
     )
     DELETE FROM dp_post_comments
      WHERE id IN (SELECT id FROM comment_tree)`
  ).bind(id).run();
  return json({ ok: true, deleted_count: result.meta.changes || 0 });
}
