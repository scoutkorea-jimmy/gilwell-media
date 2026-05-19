/**
 * Gilwell Media · Editors Setting
 *
 * GET /api/settings/editors  ← admin (view), returns editor letter→name map (A-Z)
 * PUT /api/settings/editors  ← admin (write), update editor names
 *
 * Stored in settings table as key='editors', value=JSON { "A": "name", "B": "", ... }
 * Letters A/B/C are always present (historical posts reference Editor.A/B/C) and
 * cannot be dropped. Letters D-Z are optional and may be freely added/removed
 * by the operator. Internal names are NOT shown publicly on posts — only used
 * in the admin panel for routing real-name overrides.
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const REQUIRED_LETTERS = ['A', 'B', 'C'];
const LETTER_RE = /^[A-Z]$/;
const MAX_NAME_LEN = 60;

function normalizeEditors(stored) {
  const out = {};
  REQUIRED_LETTERS.forEach((l) => { out[l] = ''; });
  if (stored && typeof stored === 'object') {
    Object.keys(stored).forEach((rawKey) => {
      const key = String(rawKey || '').trim().toUpperCase();
      if (!LETTER_RE.test(key)) return;
      const value = stored[rawKey];
      out[key] = (typeof value === 'string') ? value.trim().slice(0, MAX_NAME_LEN) : '';
    });
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  // Require auth — editor real names are private
  const __gate = await gateMenuAccess(request, env, 'editors', 'view'); if (__gate) return __gate

  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'editors'`
    ).first();
    const stored = row ? JSON.parse(row.value) : {};
    return json({ editors: normalizeEditors(stored) });
  } catch (err) {
    console.error('GET /api/settings/editors error:', err);
    return json({ editors: normalizeEditors(null) });
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

  const safe = normalizeEditors(editors);

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
      details: { letterCount: Object.keys(safe).length },
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
