/**
 * BP미디어 · Post Reorder
 *
 * PUT /api/posts/reorder  ← admin only
 * Body: { order: [id1, id2, id3, ...] }
 * Assigns sort_order = 0, 1, 2, ... based on array position.
 */
import { verifyToken, extractToken } from '../../_shared/auth.js';

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { order } = body;
  if (!Array.isArray(order) || order.length === 0) {
    return json({ error: 'order 배열을 입력해주세요' }, 400);
  }

  const ids = order.map(id => parseInt(id, 10)).filter(Number.isFinite);

  try {
    // Batch update sort_order for each post
    const stmts = ids.map((id, idx) =>
      env.DB.prepare(`UPDATE posts SET sort_order = ? WHERE id = ?`).bind(idx, id)
    );
    await env.DB.batch(stmts);
    return json({ success: true, count: ids.length });
  } catch (err) {
    console.error('PUT /api/posts/reorder error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// Also support clearing all sort_order (reset to date ordering)
export async function onRequestDelete({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env.ADMIN_SECRET))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  try {
    await env.DB.prepare(`UPDATE posts SET sort_order = NULL`).run();
    return json({ success: true });
  } catch (err) {
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
