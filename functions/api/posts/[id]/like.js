import { getViewerKey, getLikeStats } from '../../../_shared/engagement.js';

export async function onRequestPost({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return json({ error: '유효하지 않은 게시글 ID입니다' }, 400);
  }

  const post = await env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND published = 1`).bind(id).first();
  if (!post) return json({ error: '게시글을 찾을 수 없습니다' }, 404);

  const viewerKey = await getViewerKey(request, env);
  if (!viewerKey) return json({ error: '공감 처리에 필요한 정보를 확인할 수 없습니다' }, 400);

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO post_likes (post_id, viewer_key) VALUES (?, ?)`
    ).bind(id, viewerKey).run();

    const stats = await getLikeStats(env, id, viewerKey);
    return json(stats);
  } catch (err) {
    console.error('POST /api/posts/:id/like error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
