/**
 * Gilwell Media · Editors Setting
 *
 * GET /api/settings/editors  ← public, returns A-C editor list with internal names
 * PUT /api/settings/editors  ← admin only, update editor names
 *
 * Stored in settings table as key='editors', value=JSON { "A": "name", "B": "", ... }
 * Internal names are NOT shown publicly on posts — only used in admin panel.
 * Posts store author as "Editor A", "Editor B", etc.
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const LETTERS = ['A', 'B', 'C'];

export async function onRequestGet({ request, env }) {
  // Require auth — editor real names are private
  const __gate = await gateMenuAccess(request, env, 'editors', 'view'); if (__gate) return __gate

  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'editors'`
    ).first();

    const stored = row ? JSON.parse(row.value) : {};
    const editors = {};
    LETTERS.forEach(l => { editors[l] = stored[l] || ''; });

    return json({ editors });
  } catch (err) {
    console.error('GET /api/settings/editors error:', err);
    const editors = {};
    LETTERS.forEach(l => { editors[l] = ''; });
    return json({ editors });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'editors', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { editors } = body;
  if (!editors || typeof editors !== 'object') {
    return json({ error: 'editors 객체를 입력해주세요' }, 400);
  }

  const safe = {};
  LETTERS.forEach(l => {
    safe[l] = (editors[l] && typeof editors[l] === 'string')
      ? editors[l].trim().slice(0, 60)
      : '';
  });

  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'editors'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('editors', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(safe)).run();
    await recordSettingChange(env, {
      key: 'editors',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/editors',
      message: '에디터 실명 설정 변경',
    });
    return json({ editors: safe });
  } catch (err) {
    console.error('PUT /api/settings/editors error:', err);
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
