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
import { queryRust } from '../../_shared/rust-server.js';
import { storeDataImage, upgradeEditorContentImages, hasPostImageBucket } from '../../_shared/image-storage.js';

const MAX_DRAFTS_PER_OWNER = 10;
const TTL_DAYS = 14;
const DRAFT_TEXT_LIMITS = {title:400,subtitle:400,category:40,tag:1000,meta_tags:2000,author:100,publish_at:32,youtube_url:500,image_caption:500,location_name:200,location_address:400,special_feature:200};

export function normalizeDraftText(raw) {
  return Object.fromEntries(Object.entries(DRAFT_TEXT_LIMITS).map(([key,limit])=>[key,String(raw[key] || (key==='category' ? 'korea' : '')).slice(0,limit)]));
}

function draftTextUnits(raw) {
  return Object.fromEntries(Object.entries(DRAFT_TEXT_LIMITS).map(([key,limit])=>{
    const text=String(raw[key] || (key==='category' ? 'korea' : '')).slice(0,limit+1);
    return [key,Array.from({length:text.length},(_,i)=>text.charCodeAt(i))];
  }));
}

export async function normalizeDraftTextRust(raw,env,run=queryRust) {
  const units=draftTextUnits(raw);
  try {
    const response=await run({env,request:{url:'https://internal.invalid/'}},'draft-text-normalize',{units});
    if (!response.ok) throw new Error('Rust draft normalization failed');
    const result=await response.json();
    if (!result.units || Object.keys(DRAFT_TEXT_LIMITS).some(key=>!Array.isArray(result.units[key]) || result.units[key].length>DRAFT_TEXT_LIMITS[key] || result.units[key].some(unit=>!Number.isInteger(unit) || unit<0 || unit>65535))) throw new Error('Invalid draft normalization');
    return Object.fromEntries(Object.keys(DRAFT_TEXT_LIMITS).map(key=>[key,String.fromCharCode(...result.units[key])]));
  } catch (_) { return normalizeDraftText(raw); }
}

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
    const response = await queryRust({request, env}, 'draft-operation', {operation:'list', owner:ownerCode});
    if (!response.ok) throw new Error('Rust draft list failed');
    const { drafts: results } = await response.json();

    return json({
      drafts: results || [],
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
    fields = await normalizeDraftFields(body, env, origin, {deferText:true});
  } catch (err) {
    if (err instanceof DraftImageUploadError) {
      return json({ error: err.message, slot: err.slot, code: 'IMAGE_UPLOAD_FAILED' }, 400);
    }
    throw err;
  }

  try {
    const response = await queryRust({request, env}, 'draft-create', {
      owner: ownerCode,
      fields: [fields.editing_post_id, fields.title, fields.subtitle, fields.category, fields.tag, fields.meta_tags,
        fields.author, fields.publish_at, fields.youtube_url, fields.image_url, fields.image_caption, fields.gallery_images,
        fields.location_name, fields.location_address, fields.special_feature, fields.manual_related_posts,
        fields.published_flag, fields.featured_flag, fields.ai_assisted, fields.content],
      text_units:fields.text_units,
    });
    if (!response.ok) throw new Error('Rust draft creation failed');
    const { draft: row } = await response.json();
    return json({ draft: row });
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

// 클라이언트에서 받은 payload를 D1 컬럼 형태로 정규화 + 이미지 R2 업로드.
export async function normalizeDraftFields(body, env, origin, {deferText=false}={}) {
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

  const text=deferText ? Object.fromEntries(Object.keys(DRAFT_TEXT_LIMITS).map(key=>[key,''])) : await normalizeDraftTextRust(raw,env);

  return {
    editing_post_id: Number.isFinite(Number(raw.editing_post_id)) ? Number(raw.editing_post_id) : null,
    ...text,
    ...(deferText ? {text_units:draftTextUnits(raw)} : {}),
    image_url:        imageUrl,
    gallery_images:   galleryJson,
    manual_related_posts: typeof raw.manual_related_posts === 'string'
      ? raw.manual_related_posts.slice(0, 4000)
      : (Array.isArray(raw.manual_related_posts) ? JSON.stringify(raw.manual_related_posts.slice(0, 20)) : ''),
    published_flag:   raw.published_flag === false ? 0 : 1,
    featured_flag:    raw.featured_flag ? 1 : 0,
    ai_assisted:      raw.ai_assisted ? 1 : 0,
    content,
  };
}

export { getOwnerCode };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
