/**
 * Gilwell Media · /api/admin/drafts
 *
 * 임시저장(drafts) 컬렉션 — 운영자별 최대 10개, 14일 TTL.
 *
 *   GET    /api/admin/drafts            ← 본인 드래프트 목록 (updated_at DESC, max 10)
 *                                         호출 시 14일 초과 row lazy 삭제
 *   POST   /api/admin/drafts            ← 새 드래프트 생성 (10개 초과 시 LRU 삭제)
 *
 * 권한: 'write' slug 'write' action. 운영자 본인 row만 보이고/만들 수 있다.
 * 이미지: base64 data: URL은 storeDataImage()로 R2에 업로드 후 URL만 D1에 저장.
 *
 * 운영자 식별:
 *   - session.user.editor_code (멤버) — 보통 "Editor.D" 같은 코드
 *   - 오너의 legacy session은 user=null이라 'owner' 마커로 격리
 */

import { gateMenuAccess, loadAdminSession } from '../../_shared/admin-permissions.js';
import { storeDataImage, upgradeEditorContentImages, hasPostImageBucket } from '../../_shared/image-storage.js';

const MAX_DRAFTS_PER_OWNER = 10;
const TTL_DAYS = 14;

// normalizeDraftFields 에서 R2 업로드 실패 시 던져 POST/PUT 핸들러가 400 으로 변환.
export class DraftImageUploadError extends Error {
  constructor(message, slot) {
    super(message);
    this.name = 'DraftImageUploadError';
    this.slot = slot; // 'cover' | 'gallery'
  }
}

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'write', 'view');
  if (gate) return gate;

  const ownerCode = await getOwnerCode(request, env);
  if (!ownerCode) return json({ drafts: [] });

  try {
    // 14일 이전 row lazy 정리 — 운영자 전체 대상.
    await env.DB.prepare(
      `DELETE FROM drafts WHERE datetime(updated_at) < datetime('now', '-${TTL_DAYS} days')`
    ).run();

    const { results } = await env.DB.prepare(
      `SELECT * FROM drafts
        WHERE owner_editor_code = ?
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ?`
    ).bind(ownerCode, MAX_DRAFTS_PER_OWNER).all();

    return json({
      drafts: (results || []).map(serializeDraft),
      max_drafts: MAX_DRAFTS_PER_OWNER,
      ttl_days: TTL_DAYS,
    });
  } catch (err) {
    console.error('GET /api/admin/drafts error:', err);
    return json({ error: '드래프트 목록을 불러오지 못했습니다.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'write', 'write');
  if (gate) return gate;

  const ownerCode = await getOwnerCode(request, env);
  if (!ownerCode) return json({ error: '운영자 식별 실패' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const origin = new URL(request.url).origin;
  let fields;
  try {
    fields = await normalizeDraftFields(body, env, origin);
  } catch (err) {
    if (err instanceof DraftImageUploadError) {
      return json({ error: err.message, slot: err.slot, code: 'IMAGE_UPLOAD_FAILED' }, 400);
    }
    throw err;
  }

  try {
    // 11번째 슬롯 진입 시 가장 오래된 1건 삭제 (LRU).
    await pruneToCapacity(env, ownerCode);

    const insert = await env.DB.prepare(
      `INSERT INTO drafts (
         owner_editor_code, editing_post_id,
         title, subtitle, category, tag, meta_tags, author, publish_at, youtube_url,
         image_url, image_caption, gallery_images, location_name, location_address,
         special_feature, manual_related_posts, published_flag, featured_flag, ai_assisted, content
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      ownerCode, fields.editing_post_id,
      fields.title, fields.subtitle, fields.category, fields.tag, fields.meta_tags,
      fields.author, fields.publish_at, fields.youtube_url,
      fields.image_url, fields.image_caption, fields.gallery_images,
      fields.location_name, fields.location_address,
      fields.special_feature, fields.manual_related_posts,
      fields.published_flag, fields.featured_flag, fields.ai_assisted, fields.content
    ).run();

    const id = insert.meta && insert.meta.last_row_id ? Number(insert.meta.last_row_id) : 0;
    const row = await env.DB.prepare(`SELECT * FROM drafts WHERE id = ?`).bind(id).first();
    return json({ draft: row ? serializeDraft(row) : null });
  } catch (err) {
    console.error('POST /api/admin/drafts error:', err);
    return json({ error: '드래프트 저장에 실패했습니다.' }, 500);
  }
}

// ─── helpers ──────────────────────────────────────────

async function getOwnerCode(request, env) {
  const session = await loadAdminSession(request, env);
  if (!session) return '';
  // 오너 legacy session은 user=null. 'owner' 식별자로 격리.
  if (!session.user) return 'owner';
  return String(session.user.editor_code || `user:${session.user.id}` || '');
}

async function pruneToCapacity(env, ownerCode) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM drafts WHERE owner_editor_code = ?
      ORDER BY datetime(updated_at) DESC, id DESC`
  ).bind(ownerCode).all();
  const rows = results || [];
  // 이미 10개면 새 1개 진입 시 11번째가 됨 → 가장 오래된 1건 삭제해서 자리 확보.
  if (rows.length < MAX_DRAFTS_PER_OWNER) return;
  const toDelete = rows.slice(MAX_DRAFTS_PER_OWNER - 1).map((r) => r.id);
  if (!toDelete.length) return;
  const placeholders = toDelete.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM drafts WHERE id IN (${placeholders})`).bind(...toDelete).run();
}

// 클라이언트에서 받은 payload를 D1 컬럼 형태로 정규화 + 이미지 R2 업로드.
export async function normalizeDraftFields(body, env, origin) {
  const raw = body && typeof body === 'object' ? body : {};

  // Cover image: base64 data URL이면 R2 업로드 후 URL로 치환.
  let imageUrl = String(raw.image_url || '').trim();
  if (imageUrl.startsWith('data:image/')) {
    if (hasPostImageBucket(env)) {
      try {
        const stored = await storeDataImage(env, imageUrl, origin, 'draft-cover');
        imageUrl = stored.url || '';
      } catch (err) {
        throw new DraftImageUploadError(
          '대표 이미지 업로드에 실패했습니다. 이미지 크기를 줄이거나 잠시 후 다시 시도해주세요.',
          'cover'
        );
      }
    } else {
      // R2 미구성 — 짧으면(<512KB) 그냥 저장, 크면 비움 (D1 1MB cell 안전).
      if (imageUrl.length > 512 * 1024) imageUrl = '';
    }
  }

  // Gallery images: array of { url, caption } — 각 url을 cover와 동일 처리.
  let galleryJson = '';
  if (Array.isArray(raw.gallery_images)) {
    const normalized = [];
    let galleryIndex = 0;
    for (const item of raw.gallery_images.slice(0, 10)) {
      galleryIndex += 1;
      if (!item || typeof item !== 'object') continue;
      let url = String(item.url || '').trim();
      if (url.startsWith('data:image/')) {
        if (hasPostImageBucket(env)) {
          try {
            const stored = await storeDataImage(env, url, origin, 'draft-gallery');
            url = stored.url || '';
          } catch (err) {
            throw new DraftImageUploadError(
              `갤러리 ${galleryIndex}번째 이미지 업로드에 실패했습니다. 해당 이미지를 빼거나 크기를 줄여 다시 시도해주세요.`,
              'gallery'
            );
          }
        } else if (url.length > 512 * 1024) {
          url = '';
        }
      }
      if (url) normalized.push({ url, caption: String(item.caption || '').slice(0, 500) });
    }
    galleryJson = normalized.length ? JSON.stringify(normalized) : '';
  } else if (typeof raw.gallery_images === 'string') {
    galleryJson = raw.gallery_images.slice(0, 200000); // safety cap
  }

  // Editor.js content 안의 이미지 블록도 R2로 (publish 흐름과 동일).
  let content = String(raw.content || '');
  if (content && hasPostImageBucket(env)) {
    try {
      content = await upgradeEditorContentImages(content, env, origin, 'draft-body');
    } catch (_) { /* 그대로 유지 */ }
  }

  return {
    editing_post_id: Number.isFinite(Number(raw.editing_post_id)) ? Number(raw.editing_post_id) : null,
    title:            String(raw.title || '').slice(0, 400),
    subtitle:         String(raw.subtitle || '').slice(0, 400),
    category:         String(raw.category || 'korea').slice(0, 40),
    tag:              String(raw.tag || '').slice(0, 1000),
    meta_tags:        String(raw.meta_tags || '').slice(0, 2000),
    author:           String(raw.author || '').slice(0, 100),
    publish_at:       String(raw.publish_at || '').slice(0, 32),
    youtube_url:      String(raw.youtube_url || '').slice(0, 500),
    image_url:        imageUrl,
    image_caption:    String(raw.image_caption || '').slice(0, 500),
    gallery_images:   galleryJson,
    location_name:    String(raw.location_name || '').slice(0, 200),
    location_address: String(raw.location_address || '').slice(0, 400),
    special_feature:  String(raw.special_feature || '').slice(0, 200),
    manual_related_posts: typeof raw.manual_related_posts === 'string'
      ? raw.manual_related_posts.slice(0, 4000)
      : (Array.isArray(raw.manual_related_posts) ? JSON.stringify(raw.manual_related_posts.slice(0, 20)) : ''),
    published_flag:   raw.published_flag === false ? 0 : 1,
    featured_flag:    raw.featured_flag ? 1 : 0,
    ai_assisted:      raw.ai_assisted ? 1 : 0,
    content,
  };
}

export function serializeDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    editing_post_id: row.editing_post_id,
    title: row.title || '',
    subtitle: row.subtitle || '',
    category: row.category || '',
    tag: row.tag || '',
    meta_tags: row.meta_tags || '',
    author: row.author || '',
    publish_at: row.publish_at || '',
    youtube_url: row.youtube_url || '',
    image_url: row.image_url || '',
    image_caption: row.image_caption || '',
    gallery_images: row.gallery_images || '',
    location_name: row.location_name || '',
    location_address: row.location_address || '',
    special_feature: row.special_feature || '',
    manual_related_posts: row.manual_related_posts || '',
    published_flag: !!row.published_flag,
    featured_flag: !!row.featured_flag,
    ai_assisted: !!row.ai_assisted,
    content: row.content || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  };
}

export { getOwnerCode };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
