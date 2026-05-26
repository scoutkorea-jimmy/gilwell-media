/**
 * GET  /api/memorabilia/:id/comments  — 승인된 댓글 목록 (공개)
 * POST /api/memorabilia/:id/comments  — 댓글 제출 (승인 대기 상태로 저장)
 *
 * 익명 작성. 작성자 본인은 비밀번호로 직접 삭제 가능
 * (DELETE 경로는 /functions/api/memorabilia/comments/[id]/delete.js).
 */

import {
  hashCommentPassword,
  validateCommentSubmission,
  serializeCommentPublic,
} from '../../../_shared/memorabilia-comments.js';
import { enforceRateLimit, getClientIp, rateLimitResponse } from '../../../_shared/rate-limit.js';
import { isLikelyNonHumanRequest } from '../../../_shared/engagement.js';

const MAX_PAGE_SIZE = 50;

export async function onRequestGet({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE);

  const rows = await env.DB.prepare(
    `SELECT id, memorabilia_id, author_name, affiliation, content, created_at
     FROM memorabilia_comments
     WHERE memorabilia_id = ? AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(id, limit).all();

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM memorabilia_comments
     WHERE memorabilia_id = ? AND status = 'approved'`
  ).bind(id).first();

  return json({
    items: (rows.results || []).map(serializeCommentPublic),
    total: countRow?.count || 0,
  });
}

export async function onRequestPost({ params, env, request }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  if (isLikelyNonHumanRequest(request)) {
    return json({ error: 'rejected' }, 403);
  }

  // 5 / hour / IP — 같은 IP 가 도배하지 못하도록.
  const rl = await enforceRateLimit(env, {
    route: 'memo-comment',
    identity: getClientIp(request),
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.ok) {
    return rateLimitResponse(rl, '댓글 작성 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.');
  }

  const item = await env.DB.prepare(
    `SELECT id FROM memorabilia WHERE id = ? AND status = 'public'`
  ).bind(id).first();
  if (!item) return json({ error: 'not_found' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const validation = validateCommentSubmission(body);
  if (validation.errors.length) {
    return json({ error: 'validation', messages: validation.errors }, 400);
  }
  const data = validation.data;

  const { hash, salt } = await hashCommentPassword(data.password);
  const ip = getClientIp(request);
  const ua = String(request.headers.get('user-agent') || '').slice(0, 500);

  try {
    const result = await env.DB.prepare(
      `INSERT INTO memorabilia_comments
        (memorabilia_id, author_name, affiliation, password_hash, password_salt,
         content, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(
      id, data.author_name, data.affiliation, hash, salt,
      data.content, ip, ua || null
    ).run();

    return json({
      ok: true,
      status: 'pending',
      id: result.meta?.last_row_id || null,
      message: '관리자 승인 후 게시됩니다. 감사합니다.',
    }, 201);
  } catch (err) {
    console.error('POST /api/memorabilia/:id/comments error:', err);
    return json({ error: 'database_error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
