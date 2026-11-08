import { queryRust } from '../../_shared/rust-server.js';
/**
 * GET   /api/admin/memorabilia-comments?status=pending&page=1&pageSize=30
 *         도감 댓글 모더레이션 큐. status 미지정 시 pending 기본.
 *
 * GET   /api/admin/memorabilia-comments/counts
 *         status 별 카운트 — 사이드바 뱃지용.
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import { requireOtp } from '../../_shared/otp-session.js';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'deleted', 'all']);
const MAX_PAGE_SIZE = 100;

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-comments', 'view');
  if (gate) return gate;

  const url = new URL(request.url);
  const isCounts = url.searchParams.get('counts') === '1';
  // 사이드바 대기 뱃지(counts)는 단순 개수라 OTP 미적용 — 댓글 본문/목록만 OTP 게이트.
  if (!isCounts) { const __otp = await requireOtp(request, env); if (__otp) return __otp; }

  // counts subroute via ?counts=1 (사이드바 뱃지에서 호출)
  if (isCounts) {
    const response = await queryRust({env,request}, 'memorabilia-comments-admin-counts', {});
    if (!response.ok) throw new Error('Rust comment counts failed');
    const {results} = await response.json();
    const out = { pending: 0, approved: 0, rejected: 0, deleted: 0 };
    for (const r of (results || [])) {
      if (out[r.status] !== undefined) out[r.status] = r.count;
    }
    return json({ counts: out });
  }

  const rawStatus = url.searchParams.get('status') || 'pending';
  const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : 'pending';
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(url.searchParams.get('pageSize') || '30', 10) || 30, 1),
    MAX_PAGE_SIZE
  );
  const offset = (page - 1) * pageSize;

  const response = await queryRust({env,request}, 'memorabilia-comments-admin-list', {status,pageSize,offset});
  if (!response.ok) throw new Error('Rust admin comment list failed');
  const {items,total} = await response.json();

  return json({
    items: items || [],
    total,
    page,
    pageSize,
    status,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
