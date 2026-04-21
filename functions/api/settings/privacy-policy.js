/**
 * Gilwell Media · /api/settings/privacy-policy
 *
 *   GET — public, returns { html, updated_at, is_default }.
 *         Used by /privacy to render the body dynamically.
 *   PUT — owner only, body { html }. Persists to settings + updates timestamp.
 *   DELETE — owner only, clears override so built-in DEFAULT_PRIVACY_POLICY_HTML
 *           takes over again. Useful if the operator wants to revert.
 *
 * The policy HTML is sanitised on the client with DOMPurify before injection.
 * Server-side we only enforce length limits and a CHECK for `<script>` so we
 * can reject obvious tampering early; we deliberately do not strip styling
 * because the owner may legitimately want inline tags.
 */
import { requireOwner } from '../../_shared/admin-permissions.js';
import {
  DEFAULT_PRIVACY_POLICY_HTML,
  PRIVACY_POLICY_MAX_CHARS,
  PRIVACY_SETTINGS_KEY,
  PRIVACY_SETTINGS_UPDATED_KEY,
  loadPrivacyPolicy,
  normalizePrivacyHtml,
} from '../../_shared/privacy-policy.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

export async function onRequestGet({ env }) {
  const result = await loadPrivacyPolicy(env);
  // Intentionally no-store: the admin editor must always see the fresh copy
  // after a save. The payload is small (<100KB) and Pages Functions are
  // cheap; consistency > CDN caching for this endpoint.
  return json({
    html: result.html,
    updated_at: result.updated_at,
    is_default: result.is_default,
    max_chars: PRIVACY_POLICY_MAX_CHARS,
  });
}

export async function onRequestPut({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const html = normalizePrivacyHtml(body && body.html);
  if (!html.trim()) {
    return json({ error: '본문을 입력해주세요.' }, 400);
  }
  if (html.length > PRIVACY_POLICY_MAX_CHARS) {
    return json({ error: `최대 ${PRIVACY_POLICY_MAX_CHARS.toLocaleString()}자까지 입력 가능합니다.` }, 400);
  }
  if (/<script[\s>]/i.test(html)) {
    return json({ error: '<script> 태그는 허용되지 않습니다.' }, 400);
  }

  const nowIso = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(PRIVACY_SETTINGS_KEY, html),
      env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(PRIVACY_SETTINGS_UPDATED_KEY, nowIso),
    ]);

    await logOperationalEvent(env, {
      channel: 'admin', type: 'privacy_policy_updated', level: 'info',
      actor: session.username || 'owner', path: '/api/settings/privacy-policy',
      message: `개인정보 처리방침 수정 (${html.length.toLocaleString()}자)`,
    });

    return json({ success: true, html, updated_at: nowIso, is_default: false });
  } catch (err) {
    console.error('PUT /api/settings/privacy-policy error:', err);
    return json({ error: '저장 중 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM settings WHERE key = ?`).bind(PRIVACY_SETTINGS_KEY),
      env.DB.prepare(`DELETE FROM settings WHERE key = ?`).bind(PRIVACY_SETTINGS_UPDATED_KEY),
    ]);
    await logOperationalEvent(env, {
      channel: 'admin', type: 'privacy_policy_reset', level: 'info',
      actor: session.username || 'owner', path: '/api/settings/privacy-policy',
      message: '개인정보 처리방침을 기본값으로 복원',
    });
    return json({ success: true, html: DEFAULT_PRIVACY_POLICY_HTML, is_default: true });
  } catch (err) {
    console.error('DELETE /api/settings/privacy-policy error:', err);
    return json({ error: '복원 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  for (const [k, v] of Object.entries(extraHeaders || {})) headers.set(k, v);
  return new Response(JSON.stringify(data), { status, headers });
}
