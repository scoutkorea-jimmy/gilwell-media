import { extractToken, verifyTokenRole } from '../../../_shared/auth.js';
import { ensureHomepageIssuesTable } from '../../../_shared/homepage-issues.js';
import { deriveIp, logOperationalEvent } from '../../../_shared/ops-log.js';

export async function onRequestPatch({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }
  const id = parseId(params && params.id);
  if (!id) return json({ error: '유효하지 않은 이슈 ID입니다.' }, 400);
  await logOperationalEvent(env, {
    channel: 'admin',
    type: 'homepage_issue_manual_blocked',
    level: 'warning',
    path: '/api/admin/homepage-issues/' + id,
    ip: deriveIp(request),
    message: 'Manual homepage issue update blocked',
    details: { method: 'PATCH', id },
  });
  return json({ error: '홈 오류/이슈 기록은 자동 감지로만 누적됩니다.' }, 403);
}

export async function onRequestDelete({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
