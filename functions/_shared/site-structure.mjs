import { SITE_BRAND_NAME } from './site-copy.mjs';

export const SITE_CATEGORY_KEYS = Object.freeze(['korea', 'apr', 'wosm', 'people']);
export const VALID_POST_CATEGORIES = SITE_CATEGORY_KEYS.slice();

export const DEFAULT_NAV_LABELS = Object.freeze({
  'nav.contributors': { ko: '도움을 주신 분들', en: 'Contributors' },
  'nav.home': { ko: '홈', en: 'Home' },
  'nav.latest': { ko: '최신 소식', en: 'Latest' },
  'nav.jamboree16': { ko: '제16회 한국잼버리', en: '16th Korea Jamboree' },
  'nav.news_group': { ko: '스카우트 소식', en: 'Scout News' },
  'nav.korea': { ko: '한국스카우트 소식', en: 'Korea Scout News' },
  'nav.apr': { ko: '아시아-태평양 스카우트 소식', en: 'Asia-Pacific Scout News' },
  'nav.wosm': { ko: '세계의 스카우트 소식', en: 'World Scout News' },
  'nav.people': { ko: '스카우트 인물', en: 'Scout People' },
  'nav.resources_group': { ko: '스카우트 자료실', en: 'Scout Resources' },
  'nav.wosm_members': { ko: '세계연맹 회원국 현황', en: 'WOSM Members Status' },
  'nav.glossary': { ko: '용어집', en: 'Glossary' },
  'nav.calendar': { ko: '캘린더', en: 'Calendar' },
  'nav.memorabilia': { ko: '스카우트 기념품 도감', en: 'Scout Memorabilia' },
});

// 1차/2차 메뉴 구조 — 사이트 nav 의 단일 원본. site-chrome.js / fallback sync 가
// 이 정의를 따른다. type: 'link' (단독) | 'group' (드롭다운, children 필수).
// 1차 group 은 click 으로 navigation 하지 않음 — 드롭다운 트리거 전용.
export const NAV_STRUCTURE = Object.freeze([
  { type: 'link',  href: '/',             key: 'nav.home' },
  { type: 'link',  href: '/latest',       key: 'nav.latest' },
  { type: 'link',  href: '/jamboree16',   key: 'nav.jamboree16' },
  { type: 'group',                        key: 'nav.news_group', children: [
    { href: '/korea',                     key: 'nav.korea' },
    { href: '/apr',                       key: 'nav.apr' },
    { href: '/wosm',                      key: 'nav.wosm' },
    { href: '/people',                    key: 'nav.people' },
  ] },
  { type: 'group',                        key: 'nav.resources_group', children: [
    { href: '/wosm-members',              key: 'nav.wosm_members' },
    { href: '/glossary',                  key: 'nav.glossary' },
    { href: '/calendar',                  key: 'nav.calendar' },
  ] },
  { type: 'link',  href: '/memorabilia',  key: 'nav.memorabilia' },
  { type: 'link',  href: '/contributors', key: 'nav.contributors' },
]);

// Flat 호환 export — 기존 NAV_ITEMS 사용처(SSR meta 등) 가 의존하므로 그대로 유지.
export const NAV_ITEMS = Object.freeze([
  { href: '/contributors', key: 'nav.contributors' },
  { href: '/', key: 'nav.home' },
  { href: '/latest', key: 'nav.latest' },
  { href: '/jamboree16', key: 'nav.jamboree16' },
  { href: '/korea', key: 'nav.korea' },
  { href: '/apr', key: 'nav.apr' },
  { href: '/wosm', key: 'nav.wosm' },
  { href: '/wosm-members', key: 'nav.wosm_members' },
  { href: '/people', key: 'nav.people' },
  { href: '/calendar', key: 'nav.calendar' },
  { href: '/glossary', key: 'nav.glossary' },
  { href: '/memorabilia', key: 'nav.memorabilia' },
]);

export const SITE_PAGE_KEY_BY_PATH = Object.freeze({
  '/index.html': 'home',
  '/latest': 'latest',
  '/jamboree16': 'jamboree16',
  '/korea': 'korea',
  '/apr': 'apr',
  '/wosm': 'wosm',
  '/wosm-members': 'wosm_members',
  '/people': 'people',
  '/glossary': 'glossary',
  '/contributors': 'contributors',
  '/calendar': 'calendar',
  '/memorabilia': 'memorabilia',
  '/search': 'search',
  '/editorial-policy': 'editorial_policy',
  '/about': 'about',
});

export const SITE_PATH_TITLE_FALLBACKS = Object.freeze({
  '/': '홈',
  '/index.html': '홈',
  '/latest': DEFAULT_NAV_LABELS['nav.latest'].ko,
  '/latest.html': DEFAULT_NAV_LABELS['nav.latest'].ko,
  '/jamboree16': DEFAULT_NAV_LABELS['nav.jamboree16'].ko,
  '/jamboree16.html': DEFAULT_NAV_LABELS['nav.jamboree16'].ko,
  '/korea': DEFAULT_NAV_LABELS['nav.korea'].ko,
  '/korea.html': DEFAULT_NAV_LABELS['nav.korea'].ko,
  '/apr': DEFAULT_NAV_LABELS['nav.apr'].ko,
  '/apr.html': DEFAULT_NAV_LABELS['nav.apr'].ko,
  '/wosm': DEFAULT_NAV_LABELS['nav.wosm'].ko,
  '/wosm.html': DEFAULT_NAV_LABELS['nav.wosm'].ko,
  '/wosm-members': DEFAULT_NAV_LABELS['nav.wosm_members'].ko,
  '/wosm-members.html': DEFAULT_NAV_LABELS['nav.wosm_members'].ko,
  '/people': DEFAULT_NAV_LABELS['nav.people'].ko,
  '/people.html': DEFAULT_NAV_LABELS['nav.people'].ko,
  '/calendar': DEFAULT_NAV_LABELS['nav.calendar'].ko,
  '/calendar.html': DEFAULT_NAV_LABELS['nav.calendar'].ko,
  '/glossary': DEFAULT_NAV_LABELS['nav.glossary'].ko,
  '/glossary.html': DEFAULT_NAV_LABELS['nav.glossary'].ko,
  '/memorabilia': DEFAULT_NAV_LABELS['nav.memorabilia'].ko,
  '/memorabilia.html': DEFAULT_NAV_LABELS['nav.memorabilia'].ko,
  '/contributors': DEFAULT_NAV_LABELS['nav.contributors'].ko,
  '/contributors.html': DEFAULT_NAV_LABELS['nav.contributors'].ko,
  '/about': '운영 주체',
  '/about.html': '운영 주체',
  '/dreampath': 'Dreampath',
  '/dreampath.html': 'Dreampath',
  '/search': '검색',
  '/search.html': '검색',
  '/admin': SITE_BRAND_NAME + ' 관리자',
  '/admin.html': SITE_BRAND_NAME + ' 관리자',
});
