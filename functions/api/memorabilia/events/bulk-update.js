import { queryRust } from '../../../_shared/rust-server.js';
/**
 * POST /api/memorabilia/events/bulk-update
 *
 * 선택한 행사 여러 개에 동일한 변경을 일괄 적용. 카테고리 일괄 부여 / 아카이브
 * 상태 일괄 전환 등에 사용.
 *
 * Body:
 *   {
 *     ids: number[],
 *     updates: {
 *       category_id?: number | null,
 *       archived?: boolean,
 *     }
 *   }
 *
 * 결과: { ok, updated, errors:[{id, error}] }
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const checked = await queryRust({env, request}, 'memorabilia-events-bulk-validate', body);
  if (!checked.ok) throw new Error('Rust event bulk validation failed');
  const normalized = await checked.json();
  if (normalized.error) return json(normalized, 400);
  const {ids} = normalized;

  try {
    const response = await queryRust({env,request}, 'memorabilia-events-bulk-update', normalized);
    if (!response.ok) throw new Error('Rust event bulk update failed');
    const {updated, error} = await response.json();
    if (error) throw new Error(error);
    return json({ ok: true, updated, applied_ids: ids });
  } catch (err) {
    console.error('POST /api/memorabilia/events/bulk-update error:', err);
    return json({ error: 'update_failed', detail: String(err && err.message || err) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
