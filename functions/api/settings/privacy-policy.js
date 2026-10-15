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
import { requireOtp } from '../../_shared/otp-session.js';
import {
  DEFAULT_PRIVACY_POLICY_HTML,
  PRIVACY_POLICY_MAX_CHARS,
  PRIVACY_SETTINGS_KEY,
  PRIVACY_SETTINGS_UPDATED_KEY,
  loadPrivacyPolicy,
  normalizePrivacyHtml,
} from '../../_shared/privacy-policy.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';
import { ensureSettingsHistoryTable } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  let result;
  if (request && new URL(request.url).searchParams.get('scope') === 'admin') {
    try {
      const snapshot = await readPrivacyState(env);
      const stored = String(snapshot.html || '').trim();
      result = { html: stored || DEFAULT_PRIVACY_POLICY_HTML, updated_at: stored ? snapshot.updated : null, is_default: !stored, revision: snapshot.revision };
    } catch { return json({ error: '개인정보 처리방침을 불러오지 못했습니다.' }, 500); }
  } else result = await loadPrivacyPolicy(env);
  // Intentionally no-store: the admin editor must always see the fresh copy
  // after a save. The payload is small (<100KB) and Pages Functions are
  // cheap; consistency > CDN caching for this endpoint.
  return json({
    html: result.html,
    updated_at: result.updated_at,
    is_default: result.is_default,
    max_chars: PRIVACY_POLICY_MAX_CHARS,
    ...(result.revision !== undefined ? { revision: result.revision } : {}),
  });
}

export async function onRequestPut({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;
  const __otp = await requireOtp(request, env); if (__otp) return __otp;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (String(body && body.html || '').length > PRIVACY_POLICY_MAX_CHARS) return json({ error: `최대 ${PRIVACY_POLICY_MAX_CHARS.toLocaleString()}자까지 입력 가능합니다.` }, 400);
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
    const result = await commitPrivacyState(env, body, html, nowIso);
    if (!result.committed) return json({ error: '개인정보 처리방침이 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 본문을 확인해주세요.' }, 409);

    await logOperationalEvent(env, {
      channel: 'admin', type: 'privacy_policy_updated', level: 'info',
      actor: session.username || 'owner', path: '/api/settings/privacy-policy',
      message: `개인정보 처리방침 수정 (${html.length.toLocaleString()}자)`,
    });

    return json({ success: true, html, updated_at: nowIso, is_default: false, revision: result.revision });
  } catch (err) {
    console.error('PUT /api/settings/privacy-policy error:', err);
    return json({ error: '저장 중 오류가 발생했습니다.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;
  const __otp = await requireOtp(request, env); if (__otp) return __otp;
  try {
    let body = {}; try { body = await request.json(); } catch (_) { /* Legacy DELETE has no body. */ }
    const result = await commitPrivacyState(env, body, null, null);
    if (!result.committed) return json({ error: '개인정보 처리방침이 다른 화면에서 변경되었습니다. 최신 본문을 확인하고 다시 복원해주세요.' }, 409);
    await logOperationalEvent(env, {
      channel: 'admin', type: 'privacy_policy_reset', level: 'info',
      actor: session.username || 'owner', path: '/api/settings/privacy-policy',
      message: '개인정보 처리방침을 기본값으로 복원',
    });
    return json({ success: true, html: DEFAULT_PRIVACY_POLICY_HTML, updated_at: null, is_default: true, revision: result.revision });
  } catch (err) {
    console.error('DELETE /api/settings/privacy-policy error:', err);
    return json({ error: '복원 중 오류가 발생했습니다.' }, 500);
  }
}

async function readPrivacyState(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (?, ?, 'privacy_policy_rev')`).bind(PRIVACY_SETTINGS_KEY, PRIVACY_SETTINGS_UPDATED_KEY).all();
  const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
  return { html: values[PRIVACY_SETTINGS_KEY] ?? null, updated: values[PRIVACY_SETTINGS_UPDATED_KEY] ?? null, revision: parseInt(values.privacy_policy_rev, 10) || 0 };
}
async function commitPrivacyState(env, expected, html, timestamp) {
  const previous = await readPrivacyState(env);
  const currentHtml = String(previous.html || '').trim() || DEFAULT_PRIVACY_POLICY_HTML;
  if ((Number.isInteger(expected.if_revision) && expected.if_revision !== previous.revision) || (expected.if_current && expected.if_current.html !== currentHtml)) return { committed: false };
  await ensureSettingsHistoryTable(env);
  const revision = previous.revision + 1;
  const claim = String(revision) + '|' + crypto.randomUUID();
  const owned = `EXISTS(SELECT 1 FROM settings WHERE key = 'privacy_policy_rev' AND value = ?)`;
  const statements = [
    env.DB.prepare(`INSERT INTO settings(key, value) SELECT 'privacy_policy_rev', ?
      WHERE (SELECT value FROM settings WHERE key = ?) IS ? AND (SELECT value FROM settings WHERE key = ?) IS ?
      ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`).bind(claim, PRIVACY_SETTINGS_KEY, previous.html, PRIVACY_SETTINGS_UPDATED_KEY, previous.updated, previous.revision),
    env.DB.prepare(`INSERT INTO settings_history(key, value) SELECT key, value FROM settings WHERE key = ? AND ${owned}`).bind(PRIVACY_SETTINGS_KEY, claim),
  ];
  if (html === null) {
    statements.push(env.DB.prepare(`DELETE FROM settings WHERE key IN (?, ?) AND ${owned}`).bind(PRIVACY_SETTINGS_KEY, PRIVACY_SETTINGS_UPDATED_KEY, claim));
  } else {
    statements.push(env.DB.prepare(`INSERT INTO settings(key, value) SELECT ?, ? WHERE ${owned} ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(PRIVACY_SETTINGS_KEY, html, claim));
    statements.push(env.DB.prepare(`INSERT INTO settings(key, value) SELECT ?, ? WHERE ${owned} ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(PRIVACY_SETTINGS_UPDATED_KEY, timestamp, claim));
  }
  statements.push(env.DB.prepare(`UPDATE settings SET value = ? WHERE key = 'privacy_policy_rev' AND value = ?`).bind(String(revision), claim));
  const writes = await env.DB.batch(statements);
  return { committed: !!(writes[0].meta && writes[0].meta.changes === 1), revision };
}
function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  for (const [k, v] of Object.entries(extraHeaders || {})) headers.set(k, v);
  return new Response(JSON.stringify(data), { status, headers });
}
