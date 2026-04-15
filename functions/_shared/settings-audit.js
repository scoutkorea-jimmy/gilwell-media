import { logOperationalEvent } from './ops-log.js';

export async function ensureSettingsHistoryTable(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS settings_history (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      key      TEXT NOT NULL,
      value    TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_settings_history_time
       ON settings_history(saved_at DESC, id DESC)`
  ).run();
}

export async function recordSettingChange(env, input) {
  if (!env || !env.DB) return false;
  const payload = input && typeof input === 'object' ? input : {};
  const key = String(payload.key || '').trim();
  if (!key) return false;

  try {
    await ensureSettingsHistoryTable(env);
    if (payload.previousValue !== undefined && payload.previousValue !== null) {
      await env.DB.prepare(
        `INSERT INTO settings_history (key, value) VALUES (?, ?)`
      ).bind(key, String(payload.previousValue)).run();
    }
    await logOperationalEvent(env, {
      channel: 'admin',
      type: 'settings_change',
      level: 'info',
      actor: payload.actor || 'admin',
      path: payload.path || ('/api/settings/' + key),
      message: payload.message || (key + ' 설정 변경'),
      details: Object.assign({}, payload.details || {}, { key: key }),
    });
    return true;
  } catch (error) {
    console.warn('recordSettingChange skipped:', error);
    return false;
  }
}
