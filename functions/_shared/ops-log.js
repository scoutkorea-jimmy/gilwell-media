import { recordHomepageIssue } from './homepage-issues.js';

export async function ensureOperationalEventsTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS operational_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      channel    TEXT NOT NULL DEFAULT 'site',
      type       TEXT NOT NULL,
      level      TEXT NOT NULL DEFAULT 'info',
      actor      TEXT,
      ip         TEXT,
      path       TEXT,
      message    TEXT,
      details    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_operational_events_time
       ON operational_events(created_at DESC)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_operational_events_level_type
       ON operational_events(level, type, created_at DESC)`
  ).run();
}

export async function logOperationalEvent(env, input) {
  if (!env || !env.DB) return false;
  const payload = input && typeof input === 'object' ? input : {};
  try {
    await ensureOperationalEventsTable(env);
    await env.DB.prepare(
      `INSERT INTO operational_events (channel, type, level, actor, ip, path, message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      truncate(payload.channel || 'site', 40),
      truncate(payload.type || 'event', 60),
      truncate(payload.level || 'info', 20),
      truncate(payload.actor || '', 120) || null,
      truncate(payload.ip || '', 80) || null,
      truncate(payload.path || '', 260) || null,
      truncate(payload.message || '', 500) || null,
      serializeDetails(payload.details)
    ).run();
    return true;
  } catch (error) {
    console.warn('logOperationalEvent skipped:', error);
    return false;
  }
}

export async function logApiError(env, request, error, meta) {
  const input = meta && typeof meta === 'object' ? meta : {};
  const path = derivePath(request, input.path);
  const message = truncate((error && error.message) || input.message || 'API error', 500);
  const result = await logOperationalEvent(env, {
    channel: input.channel || 'site',
    type: input.type || 'api_error',
    level: 'error',
    actor: input.actor || '',
    ip: deriveIp(request),
    path,
    message,
    details: {
      stack: error && error.stack ? String(error.stack).slice(0, 2000) : '',
      method: request && request.method ? request.method : '',
      meta: input.details || null,
    },
  });
  await recordHomepageIssue(env, {
    title: buildGlobalIssueTitle(input.channel || 'site', path),
    issue_type: 'error',
    status: 'open',
    severity: pickSeverity(path, input),
    area: deriveArea(path, input),
    source_path: path,
    summary: message,
    impact: buildImpact(path, input),
    cause: buildCause(message, input),
    action_items: '재현 경로, 최근 배포, 관련 API/DB 상태를 확인하고 원인 수정 후 정상 응답 여부를 다시 검증합니다.',
    reporter: 'system:auto-api',
    occurred_at: nowUtcText(),
  }).catch(function () {});
  return result;
}

export function deriveIp(request) {
  return request && request.headers
    ? String(request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '').trim()
    : '';
}

function derivePath(request, fallback) {
  if (fallback) return truncate(fallback, 260);
  try {
    return truncate(new URL(request.url).pathname || '', 260);
  } catch (_) {
    return '';
  }
}

function serializeDetails(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch (_) {
    return truncate(String(value || ''), 4000) || null;
  }
}

function buildGlobalIssueTitle(channel, path) {
  var scope = String(channel || 'site').trim() === 'admin' ? '관리자' : '사이트';
  return scope + ' API 오류 · ' + (path || 'unknown');
}

function deriveArea(path, input) {
  var safePath = String(path || '').trim();
  if (safePath.indexOf('/api/admin/') === 0) return 'api';
  if (safePath.indexOf('/api/home') === 0) return 'homepage';
  if (safePath.indexOf('/api/analytics') === 0) return 'analytics';
  if (safePath.indexOf('/api/settings/') === 0) return 'data';
  if (input && input.channel === 'admin') return 'api';
  return 'api';
}

function pickSeverity(path, input) {
  var safePath = String(path || '').trim();
  if (safePath.indexOf('/api/home') === 0) return 'high';
  if (safePath.indexOf('/api/posts') === 0) return 'high';
  if (input && input.channel === 'admin') return 'medium';
  return 'medium';
}

function buildImpact(path, input) {
  if (String(path || '').indexOf('/api/admin/') === 0 || (input && input.channel === 'admin')) {
    return '관리자 화면 일부 집계, 저장, 목록 기능이 실패하거나 오래된 상태로 보일 수 있습니다.';
  }
  return '공개 사이트 일부 화면이나 데이터 로딩이 실패할 수 있습니다.';
}

function buildCause(message, input) {
  var parts = [];
  if (message) parts.push('message=' + message);
  if (input && input.type) parts.push('type=' + input.type);
  return truncate(parts.join(' | '), 2000);
}

function nowUtcText() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function truncate(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}
