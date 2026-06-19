/**
 * Per-post 대표 이미지 프레이밍 (초점 위치)
 *
 * posts.image_frame 컬럼에 JSON 으로 저장: { "x": 0-100, "y": 0-100 }
 *  - x / y 는 CSS object-position 퍼센트 (= Cloudflare image gravity 의 0~1 초점)
 *  - 목차/리스트 미리보기 썸네일과 OG 공유 이미지 크롭에 "같은 초점값"으로 적용된다.
 *  - 기본값(중앙 50/50)은 저장하지 않는다(NULL) — 현재 동작과 동일하고 OG 는 원본 fast-path 유지.
 *
 * Site/Admin 양쪽 백엔드에서 단일 원본으로 사용. 클라이언트 미러는 js/main.js GW.thumbFrameStyle.
 */

export const DEFAULT_IMAGE_FRAME = { x: 50, y: 50 };

function clampPct(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 임의 입력(객체 또는 JSON 문자열)을 정규화된 { x, y } 로 변환.
 * 유효하지 않으면 null (= 프레이밍 없음 = 중앙).
 */
export function normalizeImageFrame(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try { obj = JSON.parse(trimmed); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.x == null && obj.y == null) return null;
  return { x: clampPct(obj.x, 50), y: clampPct(obj.y, 50) };
}

/**
 * DB 저장용 직렬화. 중앙(50/50)이거나 무효값이면 null 을 반환해
 * no-op 행을 남기지 않고 OG 는 원본 이미지 fast-path 를 유지한다.
 */
export function serializeImageFrameForStore(raw) {
  const frame = normalizeImageFrame(raw);
  if (!frame) return null;
  if (frame.x === 50 && frame.y === 50) return null;
  return JSON.stringify(frame);
}
