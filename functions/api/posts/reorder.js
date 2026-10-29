import { queryRust } from '../../_shared/rust-server.js';
/**
 * BP미디어 · Post Reorder
 *
 * PUT /api/posts/reorder  ← admin only
 * Body: { order: [id1, id2, id3, ...] }
 * Assigns sort_order = 0, 1, 2, ... based on array position.
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';

export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
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
    const response = await queryRust({env,request}, 'post-reorder', {ids});
    if (!response.ok) throw new Error('Rust post reorder failed');
    return json({ success: true, count: ids.length });
  } catch (err) {
    console.error('PUT /api/posts/reorder error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// Also support clearing all sort_order (reset to date ordering)
export async function onRequestDelete({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다' }, 401);
  }

  try {
    const response = await queryRust({env,request}, 'post-reorder-reset', {});
    if (!response.ok) throw new Error('Rust post reorder reset failed');
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
