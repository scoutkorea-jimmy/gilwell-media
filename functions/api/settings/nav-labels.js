import { singleSetting, compareAndSetSetting } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { loadNavLabels, normalizeNavLabels, normalizeNavLabelsRust } from '../../_shared/nav-labels.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const strict = request && new URL(request.url).searchParams.get('scope') === 'admin';
    const row = strict ? await singleSetting(env, 'nav_labels') : null;
    const labels = strict ? await normalizeNavLabelsRust(env, row ? JSON.parse(row.value) : {}) : await loadNavLabels(env);
    return json({ labels }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '공개 메뉴명을 불러오지 못했습니다.' }, 500);
    console.error('GET /api/settings/nav-labels error:', err);
    return json({ labels: normalizeNavLabels({}) }, 200, publicCacheHeaders(300, 1800));
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'translations', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const labels = await normalizeNavLabelsRust(env, body && body.labels);
    const prevRow = await singleSetting(env, 'nav_labels');
    if (body.if_current && JSON.stringify(await normalizeNavLabelsRust(env, body.if_current.labels)) !== JSON.stringify(await normalizeNavLabelsRust(env, prevRow ? JSON.parse(prevRow.value) : {}))) return json({ error: '공개 메뉴명이 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const changes = await compareAndSetSetting(env, 'nav_labels', JSON.stringify(labels), prevRow ? prevRow.value : null);
    if (changes !== 1) return json({ error: '동시 공개 메뉴명 변경이 감지되었습니다.' }, 409);
    await recordSettingChange(env, {
      key: 'nav_labels',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/nav-labels',
      message: '메뉴명 설정 변경',
      details: { labels: labels },
    });
    return json({ labels });
  } catch (err) {
    console.error('PUT /api/settings/nav-labels error:', err);
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
