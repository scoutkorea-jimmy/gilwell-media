/**
 * 용어집 버킷 분류 단일 원본 (SSR write/validation 경로).
 *
 * functions/api/glossary/index.js (POST) 와 functions/api/glossary/[id].js (PUT) 가
 * 동일한 버킷 상수 + 추론/검증 로직을 각자 복제하던 것을 통합. 두 쓰기 경로의 검증이
 * 갈리지 않도록 한 곳에서만 정의한다 (00.166.x 드리프트 방지).
 *
 * ⚠ 미러 주의 (빌드 단계 없음 → import 공유 불가):
 *  - 클라이언트 js/glossary.js 의 BUCKETS/CHOSEONG_BUCKETS/inferBucket 은 이 파일의 사본이다.
 *    이 파일을 바꾸면 js/glossary.js 도 함께 갱신할 것.
 *  - functions/api/glossary/bot.js 는 의도적으로 음절 버킷(14개)만 노출(MISC/UNMATCHED 제외)하므로
 *    BUCKETS 가 아니라 SYLLABLE_BUCKETS 를 참조한다.
 */

export const MISC_BUCKET = '기타';
export const UNMATCHED_BUCKET = '국문 미확정 용어';
export const SYLLABLE_BUCKETS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
export const BUCKETS = [...SYLLABLE_BUCKETS, MISC_BUCKET, UNMATCHED_BUCKET];
const CHOSEONG_BUCKETS = ['가', '가', '나', '다', '다', '라', '마', '바', '바', '사', '사', '아', '자', '자', '차', '카', '타', '파', '하'];

export function normalizeTermValue(value, limit) {
  const raw = String(value || '').trim();
  const normalized = (raw === '-' || raw === '—') ? '' : raw;
  return normalized.slice(0, limit);
}

export function isNumericStart(value) {
  const first = normalizeTermValue(value, 200).charAt(0);
  return first >= '0' && first <= '9';
}

export function isMiscTerm(termKo, termEn, termFr) {
  return isNumericStart(termKo) || isNumericStart(termEn) || isNumericStart(termFr);
}

export function isUnmatchedTerm(termKo, termEn, termFr) {
  return !normalizeTermValue(termKo, 200) && (!!normalizeTermValue(termEn, 200) || !!normalizeTermValue(termFr, 200));
}

export function inferBucket(termKo) {
  const normalized = normalizeTermValue(termKo, 200);
  if (!normalized) return '';
  const first = normalized.charAt(0);
  if (!first) return '';
  const code = first.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '';
  const choseongIndex = Math.floor((code - 0xac00) / 588);
  return CHOSEONG_BUCKETS[choseongIndex] || '';
}
