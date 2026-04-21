import { extractToken, verifyTokenRole } from '../../../_shared/auth.js';
import { ensureHomepageIssuesTable, normalizeHomepageIssue, HOMEPAGE_ISSUE_STATUS_OPTIONS } from '../../../_shared/homepage-issues.js';
import { deriveIp, logOperationalEvent } from '../../../_shared/ops-log.js';

export async function onRequestPatch({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }
  const id = parseId(params && params.id);
  if (!id) return json({ error: '유효하지 않은 이슈 ID입니다.' }, 400);
  await ensureHomepageIssuesTable(env);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const nextStatus = normalizeStatus(body && body.status);
  if (!nextStatus) return json({ error: '유효하지 않은 상태값입니다.' }, 400);

  const current = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(id).first();
  if (!current) return json({ error: '이슈를 찾지 못했습니다.' }, 404);
  const prev = normalizeHomepageIssue(current);
  if (prev.status === nextStatus) {
    return json({ ok: true, item: prev, unchanged: true }, 200);
  }

  const resolvedAt = nextStatus === 'resolved'
    ? (prev.resolved_at || nowUtcText())
    : null;
  await env.DB.prepare(
    `UPDATE homepage_issues
        SET status = ?,
            resolved_at = ?,
            updated_at = datetime('now')
      WHERE id = ?`
  ).bind(nextStatus, resolvedAt, id).run();

  const updated = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(id).first();
  const item = normalizeHomepageIssue(updated);
  await logOperationalEvent(env, {
    channel: 'admin',
    type: 'homepage_issue_status_changed',
    level: 'info',
    path: '/api/admin/homepage-issues/' + id,
    ip: deriveIp(request),
    message: 'Homepage issue status changed',
    details: {
      id,
      title: item.title,
      from_status: prev.status,
      to_status: item.status,
    },
  });
  return json({ ok: true, item }, 200);
}

export async function onRequestDelete({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params && params.id);
  if (!id) return json({ error: '유효하지 않은 이슈 ID입니다.' }, 400);

  await ensureHomepageIssuesTable(env);
  await logOperationalEvent(env, {
    channel: 'admin',
    type: 'homepage_issue_manual_blocked',
    level: 'warning',
    path: '/api/admin/homepage-issues/' + id,
    ip: deriveIp(request),
    message: 'Manual homepage issue delete blocked',
    details: { method: 'DELETE', id },
  });
  return json({ error: '홈 오류/이슈 기록은 자동 감지로만 누적됩니다.' }, 403);
}

function parseId(raw) {
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeStatus(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return HOMEPAGE_ISSUE_STATUS_OPTIONS.includes(value) ? value : '';
}

function nowUtcText() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
