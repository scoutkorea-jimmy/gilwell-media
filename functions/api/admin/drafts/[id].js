/**
 * Gilwell Media · /api/admin/drafts/:id
 *
 *   PUT    /api/admin/drafts/:id   ← 본인 드래프트 갱신 (자동저장 debounce 호출)
 *   DELETE /api/admin/drafts/:id   ← 본인 드래프트 1건 삭제
 *
 * 본인 row만 수정/삭제 가능 — owner_editor_code 매치 검증.
 */

import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { normalizeDraftFields, serializeDraft, getOwnerCode } from '../drafts.js';

export async function onRequestPut({ params, request, env }) {
  const gate = await gateMenuAccess(request, env, 'write', 'write');
  if (gate) return gate;

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ error: 'invalid id' }, 400);

  const ownerCode = await getOwnerCode(request, env);
  if (!ownerCode) return json({ error: '운영자 식별 실패' }, 400);

  // 본인 row 검증
  const existing = await env.DB.prepare(`SELECT id FROM drafts WHERE id = ? AND owner_editor_code = ?`)
    .bind(id, ownerCode).first();
  if (!existing) return json({ error: '드래프트를 찾을 수 없거나 권한이 없습니다.' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const origin = new URL(request.url).origin;
  const fields = await normalizeDraftFields(body, env, origin);

  try {
    await env.DB.prepare(
      `UPDATE drafts SET
         editing_post_id = ?, title = ?, subtitle = ?, category = ?, tag = ?, meta_tags = ?,
         author = ?, publish_at = ?, youtube_url = ?, image_url = ?, image_caption = ?,
         gallery_images = ?, location_name = ?, location_address = ?, special_feature = ?,
         manual_related_posts = ?, published_flag = ?, featured_flag = ?, ai_assisted = ?,
         content = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(
      fields.editing_post_id, fields.title, fields.subtitle, fields.category, fields.tag, fields.meta_tags,
      fields.author, fields.publish_at, fields.youtube_url, fields.image_url, fields.image_caption,
      fields.gallery_images, fields.location_name, fields.location_address, fields.special_feature,
      fields.manual_related_posts, fields.published_flag, fields.featured_flag, fields.ai_assisted,
      fields.content, id
    ).run();

    const row = await env.DB.prepare(`SELECT * FROM drafts WHERE id = ?`).bind(id).first();
    return json({ draft: row ? serializeDraft(row) : null });
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
    const result = await env.DB.prepare(
      `DELETE FROM drafts WHERE id = ? AND owner_editor_code = ?`
    ).bind(id, ownerCode).run();
    const changes = result.meta && result.meta.changes ? result.meta.changes : 0;
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
