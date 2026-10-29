import { queryRust } from '../../../_shared/rust-server.js';
/**
 * PATCH /api/admin/memorabilia-comments/:id
 *   body: { status: 'approved' | 'rejected' | 'deleted', rejection_reason?: string }
 *
 *   상태 전이 규칙:
 *     pending  → approved | rejected
 *     approved → rejected | deleted   (게시 후 다시 내림)
 *     rejected → approved             (되살리기)
 *     deleted  → (불가, 영구처리)
 */

import { gateMenuAccess, loadAdminSession } from '../../../_shared/admin-permissions.js';
import { requireOtp } from '../../../_shared/otp-session.js';

const ALLOWED_STATUSES = new Set(['approved', 'rejected', 'deleted']);

export async function onRequestPatch({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-comments', 'write');
  if (gate) return gate;
  const __otp = await requireOtp(request, env); if (__otp) return __otp;

  const session = await loadAdminSession(request, env);
  const reviewerLabel = session && (session.username || `user#${session.uid}`);

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid_id' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const nextStatus = String((body && body.status) || '').trim();
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    return json({ error: 'invalid_status' }, 400);
  }

  const reason = String((body && body.rejection_reason) || '').trim().slice(0, 500) || null;

  const lookup = await queryRust({env,request}, 'memorabilia-comment-status', {id});
  if (!lookup.ok) throw new Error('Rust comment lookup failed');
  const {row} = await lookup.json();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.status === 'deleted' && nextStatus !== 'deleted') {
    return json({ error: 'already_deleted' }, 409);
  }

  try {
    const response = await queryRust({env,request}, 'memorabilia-comment-moderate', {id,status:nextStatus,reason,reviewerLabel:reviewerLabel || null});
    if (!response.ok) throw new Error('Rust comment moderation failed');
    const {changed} = await response.json();
    if (!changed && nextStatus !== 'deleted') return json({ error: 'already_deleted' }, 409);
    return json({ ok: true, status: nextStatus });
  } catch (err) {
    console.error('PATCH /api/admin/memorabilia-comments/:id error:', err);
    return json({ error: 'database_error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
