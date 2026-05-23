/**
 * Gilwell Media · /api/jobs/cleanup-drafts
 *
 * D1 `drafts` 테이블의 14일 TTL을 강제 정리하는 백그라운드 작업.
 * 평소엔 GET /api/admin/drafts 호출 시점에 lazy 정리되지만, 운영자가 admin
 * 콘솔을 며칠간 열지 않으면 row가 누적된다. publish-due cron worker(5분 간격)가
 * 같이 호출해서 daily-equivalent로 강제 청소한다.
 *
 * 권한: 인증 없음 — publish-due 같이 idempotent + side-effect 좁음.
 * 외부 노출돼도 14일 초과 row 삭제만 가능해 악용 여지 적음.
 */

const TTL_DAYS = 14;

export async function onRequestGet({ env }) {
  return handleCleanup(env);
}

export async function onRequestPost({ env }) {
  return handleCleanup(env);
}

async function handleCleanup(env) {
  try {
    const result = await env.DB.prepare(
      `DELETE FROM drafts WHERE datetime(updated_at) < datetime('now', '-${TTL_DAYS} days')`
    ).run();
    const deleted = (result && result.meta && result.meta.changes) || 0;

    env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('drafts_cleanup_last_run', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(new Date().toISOString()).run().catch(() => {});

    return json({ success: true, deleted_count: deleted, ttl_days: TTL_DAYS });
  } catch (err) {
    console.error('cleanup-drafts error:', err);
    return json({ error: 'drafts 정리 작업에 실패했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
