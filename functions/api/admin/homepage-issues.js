import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { ensureHomepageIssuesTable, normalizeHomepageIssue, sanitizeHomepageIssueInput } from '../../_shared/homepage-issues.js';
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
    const item = safe.value;
    const result = await env.DB.prepare(
      `INSERT INTO homepage_issues (
        title, issue_type, status, severity, area, source_path, summary, impact, cause, action_items, reporter, occurred_at, resolved_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
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
      item.resolved_at || null
    ).run();
    const created = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(result.meta.last_row_id).first();
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'homepage_issue_create',
      level: 'info',
      path: '/api/admin/homepage-issues',
      ip: deriveIp(request),
      message: item.title,
      details: {
        issue_type: item.issue_type,
        status: item.status,
        severity: item.severity,
        area: item.area,
      },
    });
    return json({ item: normalizeHomepageIssue(created) }, 201);
  } catch (err) {
    console.error('POST /api/admin/homepage-issues error:', err);
    return json({ error: 'Database error' }, 500);
  }
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
