/**
 * POST /api/memorabilia/comments/:id/delete
 *
 * 댓글 작성자의 자가 삭제. body { password } 검증 후 soft-delete.
 * 본인이 모르는 비밀번호는 관리자가 별도 모더레이션 큐에서 처리.
 */

import { verifyCommentPassword } from '../../../../_shared/memorabilia-comments.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../../../_shared/rate-limit.js';

export async function onRequestPost({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  // 비밀번호 brute-force 방지 — 10 회 / 시간 / IP.
  const rl = await enforceRateLimit(env, {
    route: 'memo-comment-delete',
    identity: getClientIp(request),
    limit: 10,
    windowSeconds: 3600,
  });
  if (!rl.ok) return rateLimitResponse(rl, '삭제 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const password = String((body && body.password) || '');
  if (!password) return json({ error: 'password_required' }, 400);

  const row = await env.DB.prepare(
    `SELECT id, password_hash, password_salt, status
     FROM memorabilia_comments WHERE id = ?`
  ).bind(id).first();

  if (!row) return json({ error: 'not_found' }, 404);
  if (row.status === 'deleted') return json({ error: 'already_deleted' }, 410);

  const ok = await verifyCommentPassword(password, row.password_hash, row.password_salt);
  if (!ok) return json({ error: 'invalid_password' }, 403);

  try {
    await env.DB.prepare(
      `UPDATE memorabilia_comments
       SET status = 'deleted', deleted_at = datetime('now')
       WHERE id = ?`
    ).bind(id).run();
    return json({ ok: true });
  } catch (err) {
    console.error('POST /api/memorabilia/comments/:id/delete error:', err);
    return json({ error: 'database_error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
