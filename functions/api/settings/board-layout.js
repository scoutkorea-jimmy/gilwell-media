import { singleSetting, queryRust } from '../../_shared/rust-server.js';
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_GAP = 6;

export async function onRequestGet({ env }) {
  try {
    const row = await singleSetting(env, 'board_card_gap');
    return json({ gap_px: await sanitizeGapRust(row && row.value, env) });
  } catch (err) {
    console.error('GET /api/settings/board-layout error:', err);
    return json({ gap_px: DEFAULT_GAP });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'board-copy', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const gap = await sanitizeGapRust(body && body.gap_px, env);
  try {
    const prevRow = await singleSetting(env, 'board_card_gap', 'put', String(gap));
    await recordSettingChange(env, {
      key: 'board_card_gap',
      previousValue: prevRow && prevRow.value,
      path: '/api/settings/board-layout',
      message: '게시판 간격 설정 변경',
      details: { gap_px: gap },
    });
    return json({ gap_px: gap });
  } catch (err) {
    console.error('PUT /api/settings/board-layout error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export function sanitizeGap(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_GAP;
  return Math.min(40, Math.max(5, parsed));
}

export async function sanitizeGapRust(value, env = {}) {
  const original=sanitizeGap(value);
  try {
    const response=await queryRust({env,request:{url:'https://internal.invalid/'}},'board-gap-normalize',{value:String(value)});
    if(!response.ok) return original;
    const {gap}=await response.json();
    return Number.isInteger(gap) && gap===original ? gap : original;
  } catch {return original;}
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
