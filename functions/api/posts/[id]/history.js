import { verifyTokenRole, extractToken } from '../../../_shared/auth.js';

export async function onRequestGet({ params, request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);
  }

  try {
    const post = await env.DB.prepare(
      `SELECT id, title, created_at, publish_at, updated_at
         FROM posts
        WHERE id = ?`
    ).bind(id).first();
    if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

    const { results } = await env.DB.prepare(
      `SELECT id, action, summary, snapshot, before_snapshot, after_snapshot, created_at
         FROM post_history
        WHERE post_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 50`
    ).bind(id).all();

    return json({
      post,
      history: (results || []).map(function (item) {
        return {
          id: item.id || 0,
          action: item.action || 'update',
          summary: item.summary || '',
          snapshot: item.snapshot || null,
          before_snapshot: item.before_snapshot || item.snapshot || null,
          after_snapshot: item.after_snapshot || item.snapshot || null,
          created_at: item.created_at || '',
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/posts/:id/history error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
