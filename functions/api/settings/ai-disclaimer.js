/**
 * GET  /api/settings/ai-disclaimer  ← public, get current disclaimer text
 * PUT  /api/settings/ai-disclaimer  ← admin only, update disclaimer text
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ai_disclaimer'`).first();
    return json({ text: row?.value || '본 글은 AI의 도움을 받아 작성되었습니다.' });
  } catch {
    return json({ text: '본 글은 AI의 도움을 받아 작성되었습니다.' });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'author', 'view'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const text = (body.text && typeof body.text === 'string') ? body.text.trim().slice(0, 500) : '본 글은 AI의 도움을 받아 작성되었습니다.';
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'ai_disclaimer'`).first();
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('ai_disclaimer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(text).run();
    await recordSettingChange(env, {
      key: 'ai_disclaimer',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/ai-disclaimer',
      message: 'AI 안내 문구 설정 변경',
    });
    return json({ text });
  } catch {
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
