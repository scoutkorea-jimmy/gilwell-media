/**
 * POST /api/memorabilia/upload-image
 * Body: { data_url: "data:image/...;base64,..." }
 * Response (success): { url: "/api/images/<key>" }
 * Response (error):   { error: "<code>", reason: "<사용자에게 보일 한국어 사유>" }
 *
 * 관리자 전용 (gateMenuAccess('memorabilia','write')).
 * 클라이언트는 error 코드를 알람으로 그대로 노출할 수 있게 reason 을 항상 동봉.
 *
 * 에러 코드:
 *   not_authenticated  — 로그인 필요 (401, gateMenuAccess 가 별도 응답)
 *   no_permission      — write:memorabilia 권한 없음 (403, gateMenuAccess)
 *   invalid_json       — body JSON 파싱 실패
 *   missing_data_url   — data_url 누락
 *   invalid_data_url   — data: 프로토콜이 아니거나 image/* 가 아님
 *   unsupported_type   — HEIC/SVG 등 허용 MIME 외 (jpeg/png/webp/gif 만)
 *   too_large          — base64 길이 > UPLOAD_MAX (12MB ≈ raw 9MB)
 *   bucket_unavailable — POST_IMAGES R2 바인딩 미설정
 *   store_failed       — R2 put 실패 (네트워크/권한)
 *   upload_failed      — 그 외 unknown
 */

import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { hasPostImageBucket, storeDataImage } from '../../_shared/image-storage.js';

const UPLOAD_MAX_BYTES = 12 * 1024 * 1024; // data URL 12MB ≈ raw ~9MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

const REASONS = {
  invalid_json: '요청 본문이 JSON 형식이 아닙니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
  missing_data_url: '이미지 데이터가 첨부되지 않았습니다.',
  invalid_data_url: '이미지 형식이 잘못됐습니다 (data:image/* URL 이 아닙니다).',
  unsupported_type: '지원하지 않는 이미지 형식입니다. JPG · PNG · WebP · GIF 만 업로드할 수 있습니다 (HEIC · SVG · TIFF 등은 변환 후 다시 시도해주세요).',
  too_large: '파일이 너무 큽니다 (최대 약 9MB). 이미지를 축소하거나 JPG로 변환한 뒤 다시 시도해주세요.',
  bucket_unavailable: '이미지 저장소(R2)가 연결돼 있지 않습니다. 운영자에게 알려주세요.',
  store_failed: '이미지 저장 중 실패했습니다. 잠시 후 다시 시도하거나 다른 이미지를 사용해주세요.',
  upload_failed: '알 수 없는 오류로 업로드가 실패했습니다. 잠시 후 다시 시도해주세요.',
};

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson('invalid_json', 400);
  }

  const dataUrl = String(body?.data_url || '');
  if (!dataUrl) return errorJson('missing_data_url', 400);
  if (!dataUrl.startsWith('data:image/')) return errorJson('invalid_data_url', 400);

  // 헤더 MIME 추출 후 allowlist 검증 (HEIC/SVG/TIFF 등 사전 차단).
  const mimeMatch = dataUrl.slice(5).match(/^([^;,]+)/);
  const mime = (mimeMatch ? mimeMatch[1] : '').toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    return errorJson('unsupported_type', 415, { detected: mime || 'unknown' });
  }

  if (dataUrl.length > UPLOAD_MAX_BYTES) {
    return errorJson('too_large', 413, {
      received_bytes: dataUrl.length,
      limit_bytes: UPLOAD_MAX_BYTES,
    });
  }

  if (!hasPostImageBucket(env)) {
    return errorJson('bucket_unavailable', 503);
  }

  try {
    const origin = new URL(request.url).origin;
    const stored = await storeDataImage(env, dataUrl, origin, 'memorabilia');
    if (!stored.url) return errorJson('store_failed', 500);
    return new Response(JSON.stringify({ url: stored.url, key: stored.key }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('memorabilia upload-image error:', err);
    // storeDataImage 가 decodeDataImage 내부에서 `Unsupported image type` 을 throw 할 수 있음.
    const message = String(err && err.message || '');
    if (message.startsWith('Unsupported image type')) {
      return errorJson('unsupported_type', 415);
    }
    return errorJson('upload_failed', 500, { detail: message });
  }
}

function errorJson(code, status, extra) {
  const payload = { error: code, reason: REASONS[code] || code };
  if (extra && typeof extra === 'object') Object.assign(payload, extra);
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
