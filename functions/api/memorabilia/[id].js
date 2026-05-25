/**
 * GET    /api/memorabilia/:id   — 관리자 상세 (드래프트 포함)
 * PATCH  /api/memorabilia/:id   — 수정 (관리자 전용)
 * DELETE /api/memorabilia/:id   — 삭제 (관리자 전용)
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import {
  normalizeMemorabiliaInput,
  getMemorabiliaById,
  updateMemorabilia,
  deleteMemorabilia,
  loadCategoryMap,
} from '../../_shared/memorabilia-store.js';

export async function onRequestGet({ request, env, params }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  const session = await loadAdminSession(request, env).catch(() => null);
  const includeDrafts = !!session;

  const item = await getMemorabiliaById(env.DB, id, { includeDrafts });
  if (!item) return json({ error: 'not_found' }, 404);
  return json({ item });
}

export async function onRequestPatch({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  // Optimistic locking — 동시편집 충돌 방지 (안정성 3차, 2026-05-26).
  // 클라이언트가 편집 진입 시점에 받은 updated_at 을 expected_updated_at 으로 넘기면,
  // 서버는 현재 row 의 updated_at 과 비교해 다르면 409 + version_mismatch 반환.
  // 누락 시 잠금 비활성 (구버전 클라이언트 호환).
  if (body && body.expected_updated_at) {
    const clientStamp = String(body.expected_updated_at).trim();
    const currentRow = await env.DB.prepare(
      `SELECT updated_at FROM memorabilia WHERE id = ?`
    ).bind(id).first();
    if (!currentRow) return json({ error: 'not_found' }, 404);
    if (String(currentRow.updated_at || '').trim() !== clientStamp) {
      return json({
        error: 'version_mismatch',
        reason: '다른 운영자가 먼저 저장했습니다. 페이지를 새로고침해 최신 내용을 확인한 뒤 변경 사항을 다시 적용해주세요.',
        server_updated_at: currentRow.updated_at,
      }, 409);
    }
  }

  const { errors, input } = normalizeMemorabiliaInput(body || {});
  if (errors.length) return json({ error: 'validation', details: errors }, 400);

  if (input.category_id) {
    const cats = await loadCategoryMap(env.DB);
    if (!cats.byId[input.category_id]) return json({ error: 'invalid_category' }, 400);
  }

  try {
    const result = await updateMemorabilia(env.DB, id, input);
    if (!result) return json({ error: 'not_found' }, 404);
    return json({ id });
  } catch (err) {
    console.error('PATCH /api/memorabilia error:', err);
    return json({ error: 'update_failed' }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json({ error: 'invalid_id' }, 400);

  try {
    await deleteMemorabilia(env.DB, id);
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/memorabilia error:', err);
    return json({ error: 'delete_failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
