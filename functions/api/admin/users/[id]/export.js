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

  // Parallel collection — all tables use `actor` TEXT (username) consistently.
  const [opsLog, aiUsage, postHistory, settingsHistory] = await Promise.all([
    env.DB.prepare(
      `SELECT id, channel, type, level, ip, path, message, details, created_at
         FROM operational_events
        WHERE actor = ?
        ORDER BY created_at DESC LIMIT 500`
    ).bind(username).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT id, created_at, endpoint, model, input_chars, output_chars,
              prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_code
         FROM ai_usage_log
        WHERE actor = ?
        ORDER BY created_at DESC LIMIT 500`
    ).bind(username).all().catch(() => ({ results: [] })),
    _safePostHistoryQuery(env, username),
    _safeSettingsHistoryQuery(env, username),
  ]);

  const body = {
    export_format_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: session.username || 'owner',
    user: serializeAdminUser(target),
    counts: {
      operational_events: (opsLog.results || []).length,
      ai_usage_log: (aiUsage.results || []).length,
      post_history: (postHistory.results || []).length,
      settings_history: (settingsHistory.results || []).length,
    },
    operational_events: opsLog.results || [],
    ai_usage_log: aiUsage.results || [],
    post_history: postHistory.results || [],
    settings_history: settingsHistory.results || [],
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

async function _safePostHistoryQuery(env, username) {
  try {
    return await env.DB.prepare(
      `SELECT id, post_id, action, summary, created_at
         FROM post_history
        WHERE summary LIKE ? OR action IN ('create', 'update', 'delete') AND id IN (
          SELECT post_history.id FROM post_history
            JOIN operational_events oe ON oe.type LIKE 'post_%' AND oe.actor = ? AND datetime(oe.created_at) = datetime(post_history.created_at)
        )
        ORDER BY created_at DESC LIMIT 200`
    ).bind('%' + username + '%', username).all();
  } catch {
    // Schema may not support JOIN depending on engine — fall back to direct
    // query on post_history alone matching the summary field.
    try {
      return await env.DB.prepare(
        `SELECT id, post_id, action, summary, created_at
           FROM post_history
          WHERE summary LIKE ?
          ORDER BY created_at DESC LIMIT 200`
      ).bind('%' + username + '%').all();
    } catch {
      return { results: [] };
    }
  }
}

async function _safeSettingsHistoryQuery(env, username) {
  try {
    return await env.DB.prepare(
      `SELECT id, setting_key, actor, created_at, message
         FROM settings_history
        WHERE actor = ?
        ORDER BY created_at DESC LIMIT 200`
    ).bind(username).all();
  } catch {
    return { results: [] };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
