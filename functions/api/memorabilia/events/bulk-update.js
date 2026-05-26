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

  const ids = Array.isArray(body?.ids) ? body.ids.map((n) => parseInt(n, 10)).filter(Number.isFinite) : [];
  const updates = (body && typeof body.updates === 'object') ? body.updates : null;
  if (!ids.length)   return json({ error: 'no_ids',     detail: '하나 이상의 행사를 선택하세요.' }, 400);
  if (!updates)      return json({ error: 'no_updates', detail: '변경할 필드를 지정하세요.' }, 400);

  const u = {};
  if (updates.category_id !== undefined) {
    if (updates.category_id === null) u.category_id = null;
    else {
      const n = parseInt(updates.category_id, 10);
      if (!Number.isFinite(n)) return json({ error: 'invalid_category_id' }, 400);
      // 존재 여부 확인
      const exists = await env.DB.prepare(`SELECT 1 FROM memorabilia_event_categories WHERE id = ?`).bind(n).first();
      if (!exists) return json({ error: 'category_not_found' }, 400);
      u.category_id = n;
    }
  }
  if (updates.archived !== undefined) u.archived = updates.archived ? 1 : 0;

  if (!Object.keys(u).length) return json({ error: 'no_updates', detail: '체크된 필드가 없습니다.' }, 400);

  const setParts = [];
  const setBinds = [];
  if ('category_id' in u) { setParts.push('category_id = ?'); setBinds.push(u.category_id); }
  if ('archived'    in u) { setParts.push('archived = ?');    setBinds.push(u.archived);    }
  setParts.push("updated_at = datetime('now')");

  const placeholders = ids.map(() => '?').join(',');
  const sql = `UPDATE memorabilia_events SET ${setParts.join(', ')} WHERE id IN (${placeholders})`;
  const allBinds = setBinds.concat(ids);

  try {
    const res = await env.DB.prepare(sql).bind(...allBinds).run();
    const updated = (res.meta && res.meta.changes) || 0;
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
