import { singleSetting, compareAndSetSetting, queryRust } from '../../_shared/rust-server.js';
/**
 * GET  /api/settings/author  ← public, get current author name
 * PUT  /api/settings/author  ← admin only, update author name
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const row = await singleSetting(env, 'author_name');
    return json({ author: row?.value || 'Editor.A' });
  } catch {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    return json({ author: 'Editor.A' });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'author', 'write'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  try {
    const response = await queryRust({request,env}, 'settings-text-normalize', {kind:'author',body});
    if (!response.ok) throw new Error('Rust author normalization failed');
    const {author} = await response.json();
    const prevRow = await singleSetting(env, 'author_name');
    if (body.if_current && body.if_current.author !== (prevRow?.value || 'Editor.A')) return json({ error: '기본 저자명이 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const changes = await compareAndSetSetting(env, 'author_name', author, prevRow ? prevRow.value : null);
    if (changes !== 1) return json({ error: '동시 저자명 변경이 감지되었습니다.' }, 409);
    await recordSettingChange(env, {
      key: 'author_name',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/author',
      message: '기본 작성자 설정 변경',
      details: { author: author },
    });
    return json({ author });
  } catch (err) {
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
