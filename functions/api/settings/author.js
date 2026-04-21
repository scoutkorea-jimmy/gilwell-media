/**
 * GET  /api/settings/author  ← public, get current author name
 * PUT  /api/settings/author  ← admin only, update author name
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'author_name'`).first();
    return json({ author: row?.value || 'Editor.A' });
  } catch {
    return json({ author: 'Editor.A' });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'author', 'view'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const author = (body.author && typeof body.author === 'string') ? body.author.trim().slice(0, 60) : 'Editor.A';
  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'author_name'`).first();
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('author_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(author).run();
    await recordSettingChange(env, {
      key: 'author_name',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/author',
      message: '기본 작성자 설정 변경',
      details: { author: author },
    });
    return json({ author });
  } catch (err) {
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
