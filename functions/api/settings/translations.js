import { singleSetting, compareAndSetSetting, queryRust } from '../../_shared/rust-server.js';
/**
 * Gilwell Media · UI Translations
 *
 * GET /api/settings/translations  ← public, returns merged { strings }
 * PUT /api/settings/translations  ← admin only, saves custom overrides
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { loadNavLabels } from '../../_shared/nav-labels.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

// ── GET /api/settings/translations ───────────────────────────
export async function onRequestGet({ env }) {
  try {
    const [row, navLabels] = await Promise.all([
      singleSetting(env, 'translations'),
      loadNavLabels(env),
    ]);
    const custom = await sanitizeTranslationStrings(env, row ? JSON.parse(row.value || '{}') : {});
    return json({ strings: custom, nav_labels: navLabels }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    console.error('GET /api/settings/translations error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/translations ───────────────────────────
export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'translations', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const strings = await sanitizeTranslationStrings(env, body.strings || {});
    const prevRow = await singleSetting(env, 'translations');
    if (body.if_current && JSON.stringify(await sanitizeTranslationStrings(env, body.if_current.strings || {})) !== JSON.stringify(await sanitizeTranslationStrings(env, prevRow ? JSON.parse(prevRow.value) : {}))) return json({ error: 'UI 번역이 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const changes = await compareAndSetSetting(env, 'translations', JSON.stringify(strings), prevRow ? prevRow.value : null);
    if (changes !== 1) return json({ error: '동시 번역 변경이 감지되었습니다.' }, 409);
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

async function sanitizeTranslationStrings(env, strings) {
  if (!strings || typeof strings !== 'object') return {};
  const input = Object.keys(strings).map(key=>({key,value:JSON.stringify(strings[key])}));
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'translations-normalize', input);
  if (!response.ok) throw new Error('Rust translation normalization failed');
  const {entries} = await response.json();
  const sanitized = {};
  for (const entry of entries) sanitized[entry.key] = JSON.parse(entry.value);
  return sanitized;
}
