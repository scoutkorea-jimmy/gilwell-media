/**
 * Gilwell Media · UI Translations
 *
 * GET /api/settings/translations  ← public, returns merged { strings }
 * PUT /api/settings/translations  ← admin only, saves custom overrides
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { loadNavLabels } from '../../_shared/nav-labels.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const LOCKED_TRANSLATION_KEYS = {
  'nav.contributors': true,
  'nav.home': true,
  'nav.latest': true,
  'nav.korea': true,
  'nav.apr': true,
  'nav.wosm': true,
  'nav.wosm_members': true,
  'nav.people': true,
  'nav.calendar': true,
  'nav.glossary': true,
};

// ── GET /api/settings/translations ───────────────────────────
export async function onRequestGet({ env }) {
  try {
    const [row, navLabels] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'translations'`).first(),
      loadNavLabels(env),
    ]);
    const custom = sanitizeTranslationStrings(row ? JSON.parse(row.value || '{}') : {});
    return json({ strings: custom, nav_labels: navLabels }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    console.error('GET /api/settings/translations error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/translations ───────────────────────────
export async function onRequestPut({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const strings = sanitizeTranslationStrings(body.strings || {});

  try {
    const prevRow = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'translations'`).first();
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('translations', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify(strings)).run();
    await recordSettingChange(env, {
      key: 'translations',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/translations',
      message: '번역 문구 설정 변경',
      details: { count: Object.keys(strings).length },
    });

    return json({ success: true });
  } catch (err) {
    console.error('PUT /api/settings/translations error:', err);
    return json({ error: 'Database error' }, 500);
  }
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

function sanitizeTranslationStrings(strings) {
  if (!strings || typeof strings !== 'object') return {};
  const sanitized = {};
  Object.keys(strings).forEach((key) => {
    if (LOCKED_TRANSLATION_KEYS[key]) return;
    sanitized[key] = strings[key];
  });
  return sanitized;
}
