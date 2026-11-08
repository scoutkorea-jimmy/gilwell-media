import { singleSetting, compareAndSetSetting, queryRust } from '../../_shared/rust-server.js';
/**
 * Gilwell Media · Ticker Settings
 *
 * GET /api/settings/ticker  ← public, returns ticker items
 * PUT /api/settings/ticker  ← admin only, update ticker items
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { DEFAULT_TICKER_ITEMS } from '../../_shared/site-copy.mjs';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const row = await singleSetting(env, 'ticker');
    const items = row ? JSON.parse(row.value) : DEFAULT_TICKER_ITEMS;
    return json({ items }, 200, publicCacheHeaders(300, 1800));
  } catch (err) {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    console.error('GET /api/settings/ticker error:', err);
    return json({ items: DEFAULT_TICKER_ITEMS }, 200, publicCacheHeaders(300, 1800));
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'ticker', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  try {
    const response = await queryRust({request,env}, 'settings-text-normalize', {kind:'ticker',body});
    if (!response.ok) throw new Error('Rust ticker normalization failed');
    const {items:safe,error} = await response.json();
    if (error) return json({error},400);
    const prevRow = await singleSetting(env, 'ticker');
    if (body.if_current && JSON.stringify(body.if_current.items) !== JSON.stringify(prevRow ? JSON.parse(prevRow.value) : DEFAULT_TICKER_ITEMS)) return json({ error: '티커가 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const changes = await compareAndSetSetting(env, 'ticker', JSON.stringify(safe), prevRow ? prevRow.value : null);
    if (changes !== 1) return json({ error: '동시 티커 변경이 감지되었습니다.' }, 409);
    await recordSettingChange(env, {
      key: 'ticker',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/ticker',
      message: '헤드라인 티커 설정 변경',
      details: { count: safe.length },
    });
    return json({ items: safe });
  } catch (err) {
    console.error('PUT /api/settings/ticker error:', err);
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
