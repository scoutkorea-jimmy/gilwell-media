/**
 * Gilwell Media · /api/admin/publish-kill-switch
 *
 *   GET — current state ('on' | 'off') [any admin]
 *   PUT — flip state (owner only). Body: { on: boolean }
 *
 * When ON, non-owner sessions get 403 on any attempt to set posts.published=1.
 * Owner retains full control. Unpublishing (published=false) is always allowed
 * so writers can continue to hide their own posts regardless of switch state.
 */
import { extractToken, verifyToken } from '../../_shared/auth.js';
import { requireOwner, isPublishKillSwitchOn } from '../../_shared/admin-permissions.js';
import { logOperationalEvent } from '../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyToken(token, env))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }
  const on = await isPublishKillSwitchOn(env);
  return json({ on, state: on ? 'on' : 'off' });
}

export async function onRequestPut({ request, env }) {
  const { session, error } = await requireOwner(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const nextOn = !!(body && body.on);
  const nextValue = nextOn ? 'on' : 'off';

  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('publish_kill_switch', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(nextValue).run();

    await logOperationalEvent(env, {
      channel: 'admin', type: 'admin_publish_kill_switch', level: nextOn ? 'warn' : 'info',
      actor: session.username || 'owner', path: '/api/admin/publish-kill-switch',
      message: `공개 전환 킬 스위치 ${nextOn ? '활성화 (비오너 발행 차단)' : '해제 (정상 운영)'}`,
    });

    return json({ on: nextOn, state: nextValue });
  } catch (err) {
    console.error('PUT /api/admin/publish-kill-switch error:', err);
    return json({ error: '킬 스위치 상태 저장 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
