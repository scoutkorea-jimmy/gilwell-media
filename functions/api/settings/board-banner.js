import { singleSetting, compareAndSetSetting, queryRust } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_BOARD_BANNER = Object.freeze({
  items: {
    korea: { event_name: '', event_date: '' },
    apr: { event_name: '', event_date: '' },
    wosm: { event_name: '', event_date: '' },
    people: { event_name: '', event_date: '' },
  },
});

export async function onRequestGet({ env, request }) {
  try {
    const row = await singleSetting(env, 'board_banner_events');
    return json(await normalizeBoardBannerSettings(env, row && row.value));
  } catch (err) {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    console.error('GET /api/settings/board-banner error:', err);
    return json(DEFAULT_BOARD_BANNER);
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'banner', 'write'); if (__gate) return __gate

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  try {
    const normalized = await normalizeBoardBannerSettings(env, body);
    const prevRow = await singleSetting(env, 'board_banner_events');
    if (body.if_current && JSON.stringify(await normalizeBoardBannerSettings(env, body.if_current)) !== JSON.stringify(await normalizeBoardBannerSettings(env, prevRow && prevRow.value))) return json({ error: '게시판 배너가 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const changes = await compareAndSetSetting(env, 'board_banner_events', JSON.stringify(normalized), prevRow ? prevRow.value : null);
    if (changes !== 1) return json({ error: '동시 게시판 배너 변경이 감지되었습니다.' }, 409);
    await recordSettingChange(env, {
      key: 'board_banner_events',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/board-banner',
      message: '게시판 배너 설정 변경',
    });
    return json(normalized);
  } catch (err) {
    console.error('PUT /api/settings/board-banner error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function normalizeBoardBannerSettings(env, raw) {
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'board-banner-normalize', raw === undefined ? null : raw);
  if (!response.ok) throw new Error('Rust board banner normalization failed');
  const {items:rows} = await response.json();
  const items = {};
  for (const row of rows) items[row.category] = {event_name:row.name,event_date:row.date};
  return { items };
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
