/**
 * /api/admin/card-news/:id  — 카드뉴스 단건 삭제 (관리자 전용)
 *
 *   DELETE  gateMenuAccess('card-news','write')
 *
 * R2 객체와 D1 메타 행을 함께 제거한다. R2 가 먼저 실패해도 D1 행은 남겨
 * 재시도 가능하게 한다(반대 순서면 행은 사라지고 R2 고아가 남는다).
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../../_shared/settings-audit.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestDelete({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'write');
  if (gate) return gate;

  const id = parseInt(params && params.id, 10);
  if (!id || id < 1) return json({ error: 'invalid_id', reason: '잘못된 카드뉴스 ID 입니다.' }, 400);

  try {
    const row = await env.DB.prepare(
      `SELECT id, title, r2_key FROM card_news WHERE id = ?`
    ).bind(id).first();
    if (!row) return json({ error: 'not_found', reason: '카드뉴스를 찾을 수 없습니다.' }, 404);

    if (row.r2_key && env.POST_IMAGES && typeof env.POST_IMAGES.delete === 'function') {
      try { await env.POST_IMAGES.delete(row.r2_key); } catch (err) {
        console.error('card-news R2 delete failed:', err);
        return json({ error: 'store_failed', reason: 'R2 객체 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 502);
      }
    }

    await env.DB.prepare(`DELETE FROM card_news WHERE id = ?`).bind(id).run();
    await recordSettingChange(env, {
      key: 'card_news',
      path: `/api/admin/card-news/${id}`,
      message: `카드뉴스 삭제: ${row.title}`,
      details: { id, r2_key: row.r2_key },
    }).catch(() => {});
    return json({ ok: true, id });
  } catch (err) {
    console.error('DELETE /api/admin/card-news/:id error:', err);
    return json({ error: 'db_error', reason: '데이터베이스 오류가 발생했습니다.' }, 500);
  }
}
