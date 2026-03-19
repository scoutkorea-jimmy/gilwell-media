import { previewOnly, json } from './preview-ops.js';

const CODE_KEY = 'preview_login_code';
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_API = 'https://api.resend.com/emails';

export function requirePreviewRuntime(request, env) {
  return previewOnly(request, env);
}

export function getPreviewLoginEmail(env) {
  return String((env && env.PREVIEW_LOGIN_EMAIL) || 'info@bpmedia.net').trim().toLowerCase();
}

export async function storePreviewLoginCode(env, code) {
  const payload = {
    hash: await hashCode(code, env.ADMIN_SECRET || ''),
    expires_at: Date.now() + CODE_TTL_MS,
    created_at: Date.now(),
  };
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(CODE_KEY, JSON.stringify(payload)).run();
  return payload;
}

export async function verifyPreviewLoginCode(env, code) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(CODE_KEY).first();
  if (!row || !row.value) return { ok: false, reason: '인증코드를 먼저 요청해주세요.' };
  let payload = null;
  try {
    payload = JSON.parse(row.value);
  } catch (_) {
    return { ok: false, reason: '인증코드를 다시 요청해주세요.' };
  }
  if (!payload || !payload.hash || !payload.expires_at) {
    return { ok: false, reason: '인증코드를 다시 요청해주세요.' };
  }
  if (Date.now() > Number(payload.expires_at)) {
    return { ok: false, reason: '인증코드가 만료되었습니다. 다시 요청해주세요.' };
  }
  const incomingHash = await hashCode(code, env.ADMIN_SECRET || '');
  if (incomingHash !== payload.hash) {
    return { ok: false, reason: '인증코드가 올바르지 않습니다.' };
  }
  return { ok: true };
}

export async function clearPreviewLoginCode(env) {
  await env.DB.prepare(`DELETE FROM settings WHERE key = ?`).bind(CODE_KEY).run();
}

export async function sendPreviewLoginEmail(env, code) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY secret is missing');
  }
  const to = getPreviewLoginEmail(env);
  const subject = '[BPmedia Preview] 관리자 인증코드';
  const text = [
    'BP미디어 preview 관리자 인증코드입니다.',
    '',
    '인증코드: ' + code,
    '',
    '이 코드는 5분 동안만 유효합니다.',
  ].join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">',
    '<h2 style="margin:0 0 12px;">BP미디어 Preview 관리자 인증코드</h2>',
    '<p style="margin:0 0 12px;">아래 코드를 preview 관리자 로그인 화면에 입력해주세요.</p>',
    '<p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:0.18em;">' + escapeHtml(code) + '</p>',
    '<p style="margin:0;color:#555;">이 코드는 5분 동안만 유효합니다.</p>',
    '</div>',
  ].join('');

  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BPmedia Preview <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!response.ok) {
    const textBody = await response.text();
    throw new Error('메일 전송에 실패했습니다: ' + textBody);
  }
  return response.json().catch(function () { return { ok: true }; });
}

export function generatePreviewLoginCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashCode(code, secret) {
  const raw = new TextEncoder().encode(String(code || '') + '|' + String(secret || ''));
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(digest)).map(function (byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { json };
