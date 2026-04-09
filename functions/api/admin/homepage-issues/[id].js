import { extractToken, verifyTokenRole } from '../../../_shared/auth.js';
import { ensureHomepageIssuesTable, normalizeHomepageIssue, sanitizeHomepageIssueInput } from '../../../_shared/homepage-issues.js';
import { deriveIp, logOperationalEvent } from '../../../_shared/ops-log.js';

export async function onRequestPatch({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params && params.id);
  if (!id) return json({ error: '유효하지 않은 이슈 ID입니다.' }, 400);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const safe = sanitizeHomepageIssueInput(body);
  if (!safe.ok) return json({ error: safe.error }, 400);

  try {
    await ensureHomepageIssuesTable(env);
    const before = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(id).first();
    if (!before) return json({ error: '기록을 찾을 수 없습니다.' }, 404);
    const item = safe.value;
    await env.DB.prepare(
      `UPDATE homepage_issues
          SET title = ?,
              issue_type = ?,
              status = ?,
              severity = ?,
              area = ?,
              source_path = ?,
              summary = ?,
              impact = ?,
              cause = ?,
              action_items = ?,
              reporter = ?,
              occurred_at = ?,
              resolved_at = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(
      item.title,
      item.issue_type,
      item.status,
      item.severity,
      item.area,
      item.source_path || null,
      item.summary || null,
      item.impact || null,
      item.cause || null,
      item.action_items || null,
      item.reporter || null,
      item.occurred_at || null,
      item.resolved_at || null,
      id
    ).run();
    const updated = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(id).first();
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'homepage_issue_update',
      level: 'info',
      path: '/api/admin/homepage-issues/' + id,
      ip: deriveIp(request),
      message: item.title,
      details: {
        before_status: before.status || '',
        after_status: item.status,
        severity: item.severity,
        area: item.area,
      },
    });
    return json({ item: normalizeHomepageIssue(updated) });
  } catch (err) {
    console.error('PATCH /api/admin/homepage-issues/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  const id = parseId(params && params.id);
  if (!id) return json({ error: '유효하지 않은 이슈 ID입니다.' }, 400);

  try {
    await ensureHomepageIssuesTable(env);
    const before = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(id).first();
    if (!before) return json({ error: '기록을 찾을 수 없습니다.' }, 404);
    await env.DB.prepare(`DELETE FROM homepage_issues WHERE id = ?`).bind(id).run();
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'homepage_issue_delete',
      level: 'warning',
      path: '/api/admin/homepage-issues/' + id,
      ip: deriveIp(request),
      message: before.title || '',
      details: {
        status: before.status || '',
        severity: before.severity || '',
        area: before.area || '',
      },
    });
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/homepage-issues/:id error:', err);
    return json({ error: 'Database error' }, 500);
  }
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
