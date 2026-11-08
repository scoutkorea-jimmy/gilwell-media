/**
 * Gilwell Media · /api/admin/drafts/:id
 *
 *   PUT    /api/admin/drafts/:id   ← 본인 드래프트 갱신 (자동저장 debounce 호출)
 *   DELETE /api/admin/drafts/:id   ← 본인 드래프트 1건 삭제
 *
 * 본인 row만 수정/삭제 가능 — owner_editor_code 매치 검증.
 */

import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { queryRust } from '../../../_shared/rust-server.js';
import { normalizeDraftFields, getOwnerCode, DraftImageUploadError } from '../drafts.js';

export async function onRequestPut({ params, request, env }) {
  const gate = await gateMenuAccess(request, env, 'write', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid id' }, 400);

  const ownerCode = await getOwnerCode(request, env);
  if (!ownerCode) return json({ error: '운영자 식별 실패' }, 400);

  // 본인 row 검증
  const check = await queryRust({request, env}, 'draft-operation', {operation:'get', owner:ownerCode, id});
  if (!check.ok) return json({ error: '드래프트 갱신에 실패했습니다.' }, 500);
  const { draft: existing } = await check.json();
  if (!existing) return json({ error: '드래프트를 찾을 수 없거나 권한이 없습니다.' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const origin = new URL(request.url).origin;
  let fields;
  try {
    fields = await normalizeDraftFields(body, env, origin, {deferText:true});
  } catch (err) {
    if (err instanceof DraftImageUploadError) {
      return json({ error: err.message, slot: err.slot, code: 'IMAGE_UPLOAD_FAILED' }, 400);
    }
    throw err;
  }

  try {
    const response = await queryRust({request, env}, 'draft-operation', {
      operation:'update', owner:ownerCode, id,
      fields:[fields.editing_post_id, fields.title, fields.subtitle, fields.category, fields.tag, fields.meta_tags,
        fields.author, fields.publish_at, fields.youtube_url, fields.image_url, fields.image_caption, fields.gallery_images,
        fields.location_name, fields.location_address, fields.special_feature, fields.manual_related_posts,
        fields.published_flag, fields.featured_flag, fields.ai_assisted, fields.content],
      text_units:fields.text_units,
    });
    if (!response.ok) throw new Error('Rust draft update failed');
    const { draft: row } = await response.json();
    if (!row) return json({ error: '드래프트를 찾을 수 없거나 권한이 없습니다.' }, 404);
    return json({ draft: row });
  } catch (err) {
    console.error('PUT /api/admin/drafts/:id error:', err);
    return json({ error: '드래프트 갱신에 실패했습니다.' }, 500);
  }
}

export async function onRequestDelete({ params, request, env }) {
  const gate = await gateMenuAccess(request, env, 'write', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid id' }, 400);

  const ownerCode = await getOwnerCode(request, env);
  if (!ownerCode) return json({ error: '운영자 식별 실패' }, 400);

  try {
    const response = await queryRust({request, env}, 'draft-operation', {operation:'delete', owner:ownerCode, id});
    if (!response.ok) throw new Error('Rust draft deletion failed');
    const { changes } = await response.json();
    if (!changes) return json({ error: '드래프트를 찾을 수 없거나 권한이 없습니다.' }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/drafts/:id error:', err);
    return json({ error: '드래프트 삭제에 실패했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
