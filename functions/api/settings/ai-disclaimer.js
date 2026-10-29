import { singleSetting, compareAndSetSetting, queryRust } from '../../_shared/rust-server.js';
/**
 * GET  /api/settings/ai-disclaimer  ← public, get current disclaimer text
 * PUT  /api/settings/ai-disclaimer  ← admin only, update disclaimer text
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

export async function onRequestGet({ env, request }) {
  try {
    const row = await singleSetting(env, 'ai_disclaimer');
    return json({ text: row?.value || '본 글은 AI의 도움을 받아 작성되었습니다.' });
  } catch {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    return json({ text: '본 글은 AI의 도움을 받아 작성되었습니다.' });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'author', 'write'); if (__gate) return __gate
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  try {
    const response = await queryRust({request,env}, 'settings-text-normalize', {kind:'ai-disclaimer',body});
    if (!response.ok) throw new Error('Rust disclaimer normalization failed');
    const {text} = await response.json();
    const prevRow = await singleSetting(env, 'ai_disclaimer');
    if (body.if_current && body.if_current.text !== (prevRow?.value || '본 글은 AI의 도움을 받아 작성되었습니다.')) return json({ error: 'AI 고지 문구가 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const changes = await compareAndSetSetting(env, 'ai_disclaimer', text, prevRow ? prevRow.value : null);
    if (changes !== 1) return json({ error: '동시 고지 변경이 감지되었습니다.' }, 409);
    await recordSettingChange(env, {
      key: 'ai_disclaimer',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/ai-disclaimer',
      message: 'AI 안내 문구 설정 변경',
    });
    return json({ text });
  } catch {
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
