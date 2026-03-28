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
  return logOperationalEvent(env, {
    channel: input.channel || 'site',
    type: input.type || 'api_error',
    level: 'error',
    actor: input.actor || '',
    ip: deriveIp(request),
    path,
    message: truncate((error && error.message) || input.message || 'API error', 500),
    details: {
      stack: error && error.stack ? String(error.stack).slice(0, 2000) : '',
      method: request && request.method ? request.method : '',
      meta: input.details || null,
    },
  });
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

function truncate(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}
