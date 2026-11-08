import { queryRust } from './rust-server.js';
import { logOperationalEvent } from './ops-log.js';

export async function ensureSettingsHistoryTable(env) {
  if (!env || !env.DB) return;
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'settings-history-write', {operation:'ensure'});
  if (!response.ok) throw new Error('Rust settings history setup failed');
}

export async function recordSettingChange(env, input) {
  if (!env || !env.DB) return false;
  const payload = input && typeof input === 'object' ? input : {};
  const key = String(payload.key || '').trim();
  if (!key) return false;

  try {
    await ensureSettingsHistoryTable(env);
    if (payload.previousValue !== undefined && payload.previousValue !== null) {
      const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'settings-history-write', {operation:'insert', key, value:String(payload.previousValue)});
      if (!response.ok) throw new Error('Rust settings history insert failed');
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
