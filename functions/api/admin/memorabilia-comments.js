/**
 * GET   /api/admin/memorabilia-comments?status=pending&page=1&pageSize=30
 *         도감 댓글 모더레이션 큐. status 미지정 시 pending 기본.
 *
 * GET   /api/admin/memorabilia-comments/counts
 *         status 별 카운트 — 사이드바 뱃지용.
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import { serializeCommentAdmin } from '../../_shared/memorabilia-comments.js';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'deleted', 'all']);
const MAX_PAGE_SIZE = 100;

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-comments', 'view');
  if (gate) return gate;

  const url = new URL(request.url);

  // counts subroute via ?counts=1 (사이드바 뱃지에서 호출)
  if (url.searchParams.get('counts') === '1') {
    const rows = await env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM memorabilia_comments GROUP BY status`
    ).all();
    const out = { pending: 0, approved: 0, rejected: 0, deleted: 0 };
    for (const r of (rows.results || [])) {
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

  let where = '';
  const params = [];
  if (status !== 'all') {
    where = 'WHERE c.status = ?';
    params.push(status);
  }

  const listSql = `
    SELECT
      c.id, c.memorabilia_id, c.author_name, c.affiliation, c.content,
      c.ip_address, c.user_agent, c.status, c.rejection_reason,
      c.created_at, c.reviewed_at, c.reviewed_by, c.deleted_at,
      m.title_ko AS memorabilia_title_ko,
      m.title_en AS memorabilia_title_en,
      m.slug     AS memorabilia_slug
    FROM memorabilia_comments c
    LEFT JOIN memorabilia m ON m.id = c.memorabilia_id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const listParams = [...params, pageSize, offset];

  const countSql = `SELECT COUNT(*) AS count FROM memorabilia_comments c ${where}`;

  const [list, count] = await Promise.all([
    env.DB.prepare(listSql).bind(...listParams).all(),
    env.DB.prepare(countSql).bind(...params).first(),
  ]);

  return json({
    items: (list.results || []).map(serializeCommentAdmin),
    total: count?.count || 0,
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
