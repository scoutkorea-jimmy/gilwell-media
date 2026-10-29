import { getNavLabel } from './nav-labels.js';

// 카테고리 배지 색상 단일 원본 (SSR).
// ⚠ 빌드 단계가 없어 ES module import로 공유 불가 — 아래 값은 클라이언트
// `js/main.js` 의 `GW.CATEGORIES` 색상 및 CSS `:root --tag-*` 토큰과 반드시 일치해야 한다.
// (브랜드 팔레트: scouting #622599 / midnight #4D006E / ocean #0094B4 / fire #FF5655 / forest #248737)
// 배지 글자는 흰색 고정이므로 White APCA Lc 45+ 인 어두운 브랜드색만 사용한다.
// 과거 people/glossary 에 kicker 텍스트색(#8A5A2B / #5D6F2B)을, latest 에 #111111 을 잘못 넣어
// SSR 과 클라 배지 색이 갈렸던 버그를 교정 (00.166.04).
export const CATEGORY_META = Object.freeze({
  latest: { navKey: 'nav.latest', label: 'Latest', color: '#4D006E', tagClass: 'tag-latest' },
  korea: { navKey: 'nav.korea', label: 'Korea', color: '#0094B4', tagClass: 'tag-korea' },
  apr: { navKey: 'nav.apr', label: 'APR', color: '#FF5655', tagClass: 'tag-apr' },
  wosm: { navKey: 'nav.wosm', label: 'WOSM', color: '#248737', tagClass: 'tag-wosm' },
  people: { navKey: 'nav.people', label: 'Scout People', color: '#622599', tagClass: 'tag-people' },
  glossary: { navKey: 'nav.glossary', label: 'Glossary', color: '#4D006E', tagClass: 'tag-glossary' },
});

export const EDITABLE_POST_CATEGORY_KEYS = Object.freeze(['korea', 'apr', 'wosm', 'people']);

export function getCategoryMeta(navLabels, category, lang = 'ko') {
  const key = CATEGORY_META[category] ? category : 'korea';
  const base = CATEGORY_META[key];
  return {
    key,
    navKey: base.navKey,
    color: base.color,
    tagClass: base.tagClass,
    fallbackLabel: base.label,
    label: base.navKey ? getNavLabel(navLabels, base.navKey, lang) : base.label,
  };
}

export function listEditablePostCategories(navLabels, lang = 'ko') {
  return EDITABLE_POST_CATEGORY_KEYS.map((category) => getCategoryMeta(navLabels, category, lang));
}
