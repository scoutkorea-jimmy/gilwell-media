export const HOMEPAGE_ISSUE_TYPE_OPTIONS = ['error', 'issue', 'risk', 'improvement'];
export const HOMEPAGE_ISSUE_STATUS_OPTIONS = ['open', 'monitoring', 'resolved', 'archived'];
export const HOMEPAGE_ISSUE_SEVERITY_OPTIONS = ['high', 'medium', 'low'];
export const HOMEPAGE_ISSUE_AREA_OPTIONS = ['homepage', 'api', 'ui', 'data', 'mobile', 'accessibility', 'seo', 'performance', 'analytics', 'other'];

export async function ensureHomepageIssuesTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS homepage_issues (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      issue_type   TEXT NOT NULL DEFAULT 'issue',
      status       TEXT NOT NULL DEFAULT 'open',
      severity     TEXT NOT NULL DEFAULT 'medium',
      area         TEXT NOT NULL DEFAULT 'homepage',
      source_path  TEXT,
      summary      TEXT,
      impact       TEXT,
      cause        TEXT,
      action_items TEXT,
      reporter     TEXT,
      occurred_at  TEXT,
      last_seen_at TEXT,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at  TEXT
    )`
  ).run();
  const columns = await listHomepageIssueColumns(env);
  if (!columns.has('last_seen_at')) {
    await runOptionalAlter(env, `ALTER TABLE homepage_issues ADD COLUMN last_seen_at TEXT`);
  }
  if (!columns.has('occurrence_count')) {
    await runOptionalAlter(env, `ALTER TABLE homepage_issues ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 1`);
  }
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_homepage_issues_status_updated
       ON homepage_issues(status, updated_at DESC)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_homepage_issues_severity_updated
      ON homepage_issues(severity, updated_at DESC)`
  ).run();
}

export function normalizeHomepageIssue(row) {
  const item = row && typeof row === 'object' ? row : {};
  return {
    id: Number(item.id || 0),
    title: String(item.title || ''),
    issue_type: normalizeEnum(item.issue_type, HOMEPAGE_ISSUE_TYPE_OPTIONS, 'issue'),
    status: normalizeEnum(item.status, HOMEPAGE_ISSUE_STATUS_OPTIONS, 'open'),
    severity: normalizeEnum(item.severity, HOMEPAGE_ISSUE_SEVERITY_OPTIONS, 'medium'),
    area: normalizeEnum(item.area, HOMEPAGE_ISSUE_AREA_OPTIONS, 'homepage'),
    source_path: String(item.source_path || ''),
    summary: String(item.summary || ''),
    impact: String(item.impact || ''),
    cause: String(item.cause || ''),
    action_items: String(item.action_items || ''),
    reporter: String(item.reporter || ''),
    occurred_at: String(item.occurred_at || ''),
    last_seen_at: String(item.last_seen_at || item.occurred_at || ''),
    occurrence_count: Math.max(1, Number(item.occurrence_count || 1) || 1),
    created_at: String(item.created_at || ''),
    updated_at: String(item.updated_at || ''),
    resolved_at: String(item.resolved_at || ''),
  };
}

export function sanitizeHomepageIssueInput(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const title = clean(payload.title, 180);
  if (!title) {
    return { ok: false, error: '이슈 제목을 입력해주세요.' };
  }
  const status = normalizeEnum(payload.status, HOMEPAGE_ISSUE_STATUS_OPTIONS, 'open');
  const resolvedAt = status === 'resolved'
    ? normalizeDateTime(payload.resolved_at) || new Date().toISOString().slice(0, 19).replace('T', ' ')
    : null;
  return {
    ok: true,
    value: {
      title,
      issue_type: normalizeEnum(payload.issue_type, HOMEPAGE_ISSUE_TYPE_OPTIONS, 'issue'),
      status,
      severity: normalizeEnum(payload.severity, HOMEPAGE_ISSUE_SEVERITY_OPTIONS, 'medium'),
      area: normalizeEnum(payload.area, HOMEPAGE_ISSUE_AREA_OPTIONS, 'homepage'),
      source_path: clean(payload.source_path, 260),
      summary: cleanMultiline(payload.summary, 2000),
      impact: cleanMultiline(payload.impact, 2000),
      cause: cleanMultiline(payload.cause, 2000),
      action_items: cleanMultiline(payload.action_items, 2000),
      reporter: clean(payload.reporter, 120),
      occurred_at: normalizeDateTime(payload.occurred_at),
      resolved_at: resolvedAt,
    },
  };
}

export async function recordHomepageIssue(env, input) {
  if (!env || !env.DB) return null;
  const safe = sanitizeHomepageIssueInput(input);
  if (!safe.ok) return null;

  await ensureHomepageIssuesTable(env);
  const item = safe.value;
  const occurredAt = item.occurred_at || nowUtcText();
  const existing = await env.DB.prepare(
    `SELECT *
       FROM homepage_issues
      WHERE title = ?
        AND issue_type = ?
        AND area = ?
        AND COALESCE(source_path, '') = ?
        AND status IN ('open', 'monitoring')
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT 1`
  ).bind(
    item.title,
    item.issue_type,
    item.area,
    item.source_path || ''
  ).first();

  if (existing) {
    const current = normalizeHomepageIssue(existing);
    const nextSeverity = pickHigherSeverity(current.severity, item.severity);
    const nextStatus = current.status === 'resolved' || current.status === 'archived'
      ? item.status
      : current.status;
    await env.DB.prepare(
      `UPDATE homepage_issues
          SET status = ?,
              severity = ?,
              summary = ?,
              impact = ?,
              cause = ?,
              action_items = ?,
              reporter = ?,
              occurred_at = COALESCE(occurred_at, ?),
              last_seen_at = ?,
              occurrence_count = COALESCE(occurrence_count, 1) + 1,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(
      nextStatus,
      nextSeverity,
      item.summary || current.summary || null,
      item.impact || current.impact || null,
      item.cause || current.cause || null,
      item.action_items || current.action_items || null,
      item.reporter || current.reporter || null,
      occurredAt,
      occurredAt,
      current.id
    ).run();
    const updated = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(current.id).first();
    return normalizeHomepageIssue(updated);
  }

  const created = await env.DB.prepare(
    `INSERT INTO homepage_issues (
      title, issue_type, status, severity, area, source_path, summary, impact, cause, action_items, reporter, occurred_at, last_seen_at, occurrence_count, resolved_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`
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
    occurredAt,
    occurredAt,
    item.resolved_at || null
  ).run();
  const row = await env.DB.prepare(`SELECT * FROM homepage_issues WHERE id = ?`).bind(created.meta.last_row_id).first();
  return normalizeHomepageIssue(row);
}

async function listHomepageIssueColumns(env) {
  try {
    const { results } = await env.DB.prepare(`PRAGMA table_info(homepage_issues)`).all();
    return new Set((results || []).map((row) => String(row && row.name || '').trim()).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

async function runOptionalAlter(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch (error) {
    const message = String(error && error.message || '');
    if (message.indexOf('duplicate column name') >= 0) return;
    throw error;
  }
}

function normalizeEnum(value, allowed, fallback) {
  const text = String(value || '').trim().toLowerCase();
  return allowed.indexOf(text) >= 0 ? text : fallback;
}

function clean(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function cleanMultiline(value, max) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text.replace('T', ' ') + ':00';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;
  return '';
}

function nowUtcText() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function pickHigherSeverity(a, b) {
  const rank = { high: 3, medium: 2, low: 1 };
  const left = normalizeEnum(a, HOMEPAGE_ISSUE_SEVERITY_OPTIONS, 'medium');
  const right = normalizeEnum(b, HOMEPAGE_ISSUE_SEVERITY_OPTIONS, 'medium');
  return (rank[right] || 0) > (rank[left] || 0) ? right : left;
}
