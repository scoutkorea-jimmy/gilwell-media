/**
 * Gilwell Media · Homepage Text Settings
 *
 * GET /api/settings/homepage-text  ← public, returns current copy + field defs
 * PUT /api/settings/homepage-text  ← admin only, accepts partial patch
 *
 * The admin "홈페이지 본문" panel posts a partial dict; unspecified keys are
 * preserved. Unknown keys are dropped server-side (see sanitizeHomepageText…).
 */
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';
import {
  HOMEPAGE_TEXT_SETTINGS_KEY,
  HOMEPAGE_TEXT_FIELDS,
  defaultHomepageText,
  loadHomepageText,
  normalizeHomepageText,
  sanitizeHomepageTextPatch,
} from '../../_shared/homepage-text.js';

export async function onRequestGet({ env }) {
  try {
    const text = await loadHomepageText(env);
    return json({
      text,
      fields: HOMEPAGE_TEXT_FIELDS,
      defaults: defaultHomepageText(),
    }, 200, publicCacheHeaders(120, 600));
  } catch (err) {
    console.error('GET /api/settings/homepage-text error:', err);
    return json({
      text: defaultHomepageText(),
      fields: HOMEPAGE_TEXT_FIELDS,
      defaults: defaultHomepageText(),
    }, 200, publicCacheHeaders(120, 600));
  }
}

export async function onRequestPut({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'homepage-text', 'view');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const patch = body && (body.text || body);
  let cleaned;
  try {
    cleaned = sanitizeHomepageTextPatch(patch);
  } catch (err) {
    return json({ error: err.message || '입력값을 확인해주세요.' }, 400);
  }

  try {
    const prevRow = await env.DB
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .bind(HOMEPAGE_TEXT_SETTINGS_KEY)
      .first();
    const prev = prevRow ? normalizeHomepageText(safeJson(prevRow.value)) : defaultHomepageText();
    const next = Object.assign({}, prev, cleaned);
    const finalText = normalizeHomepageText(next);

    await env.DB
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .bind(HOMEPAGE_TEXT_SETTINGS_KEY, JSON.stringify(finalText))
      .run();

    const changedKeys = Object.keys(cleaned).filter((k) => prev[k] !== finalText[k]);
    await recordSettingChange(env, {
      key: HOMEPAGE_TEXT_SETTINGS_KEY,
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/homepage-text',
      message: '홈페이지 본문(문구) 수정',
      details: { changedKeys, fieldCount: HOMEPAGE_TEXT_FIELDS.length },
    });

    return json({
      text: finalText,
      fields: HOMEPAGE_TEXT_FIELDS,
      defaults: defaultHomepageText(),
      changedKeys,
    });
  } catch (err) {
    console.error('PUT /api/settings/homepage-text error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function safeJson(raw) {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}

function publicCacheHeaders(maxAge, swr) {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}
