/**
 * Gilwell Media · GET /api/admin/users/:id/export
 *
 * GDPR Art. 15 (right of access) + Art. 20 (right to data portability).
 * Returns a self-contained JSON snapshot of everything we store about this
 * admin user: profile, permissions, operational events they've caused, AI
 * usage attributed to them, post_history entries where they were the actor,
 * and settings_history entries they authored.
 *
 * Access rules:
 *   - Owner can export any user.
 *   - A member can export themselves (session.uid must match :id).
 *
 * Response is a machine-readable JSON blob the operator can hand over on
 * request. Rate limited only by the admin session rate limit.
 */
import { loadAdminSession } from '../../../../_shared/admin-permissions.js';
import { loadAdminUserById, serializeAdminUser } from '../../../../_shared/admin-users.js';
import { queryRust } from '../../../../_shared/rust-server.js';

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function onRequestGet({ params, request, env }) {
  const session = await loadAdminSession(request, env);
  if (!session) return json({ error: '인증이 필요합니다.' }, 401);

  const id = parseId(params.id);
  if (!id) return json({ error: '유효하지 않은 사용자 ID입니다.' }, 400);

  const isSelf = session.uid && Number(session.uid) === id;
  if (!session.isOwner && !isSelf) {
    return json({ error: '본인 계정만 내보낼 수 있습니다.' }, 403);
  }

  const target = await loadAdminUserById(env, id);
  if (!target) return json({ error: '사용자를 찾을 수 없습니다.' }, 404);
  const username = target.username;

  const response = await queryRust({request, env}, 'admin-user-export', {username});
  if (!response.ok) return json({ error: '계정 내보내기 조회 중 오류가 발생했습니다.' }, 500);
  const {ops, ai, history, settings} = await response.json();

  const body = {
    export_format_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: session.username || 'owner',
    user: serializeAdminUser(target),
    counts: {
      operational_events: ops.length,
      ai_usage_log: ai.length,
      post_history: history.length,
      settings_history: settings.length,
    },
    operational_events: ops,
    ai_usage_log: ai,
    post_history: history,
    settings_history: settings,
    notice:
      '이 파일은 GDPR 제15조(열람권)·제20조(이동권)에 따라 생성된 스냅샷입니다. ' +
      '수록된 로그는 감사·보안 목적으로 보관되며 기본 90일 경과 시 자동 삭제/익명화 대상이 됩니다. ' +
      '추가 문의는 bpmedia.net 운영 담당자에게 연락하세요.',
  };

  const filename = `gilwell-admin-user-${username}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
