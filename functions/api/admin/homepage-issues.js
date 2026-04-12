import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureHomepageIssuesTable, normalizeHomepageIssue } from '../../_shared/homepage-issues.js';
import { deriveIp, logOperationalEvent } from '../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  try {
    await ensureHomepageIssuesTable(env);
    const url = new URL(request.url);
    const q = String(url.searchParams.get('q') || '').trim();
    const status = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
    const conditions = [];
    const bindings = [];
    if (q) {
      conditions.push(`(
        title LIKE ? OR summary LIKE ? OR impact LIKE ? OR cause LIKE ? OR action_items LIKE ? OR source_path LIKE ? OR reporter LIKE ?
      )`);
      const like = '%' + q + '%';
      bindings.push(like, like, like, like, like, like, like);
    }
    if (status && status !== 'all') {
      conditions.push('status = ?');
      bindings.push(status);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const { results } = await env.DB.prepare(
      `SELECT *
         FROM homepage_issues
         ${where}
        ORDER BY
          CASE status
            WHEN 'open' THEN 0
            WHEN 'monitoring' THEN 1
            WHEN 'resolved' THEN 2
            ELSE 3
          END ASC,
          CASE severity
            WHEN 'high' THEN 0
            WHEN 'medium' THEN 1
            ELSE 2
          END ASC,
          datetime(updated_at) DESC,
          id DESC
        LIMIT ?`
    ).bind(...bindings, limit).all();
    return json({ items: (results || []).map(normalizeHomepageIssue) });
  } catch (err) {
    console.error('GET /api/admin/homepage-issues error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }
  await logOperationalEvent(env, {
    channel: 'admin',
    type: 'homepage_issue_manual_blocked',
    level: 'warning',
    path: '/api/admin/homepage-issues',
    ip: deriveIp(request),
    message: 'Manual homepage issue creation blocked',
    details: { method: 'POST' },
  });
  return json({ error: '사이트 오류/이슈 기록은 자동 감지로만 누적됩니다.' }, 403);
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
