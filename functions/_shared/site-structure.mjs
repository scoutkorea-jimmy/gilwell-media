import { SITE_BRAND_NAME } from './site-copy.mjs';

export const SITE_CATEGORY_KEYS = Object.freeze(['korea', 'apr', 'wosm', 'people']);
export const VALID_POST_CATEGORIES = SITE_CATEGORY_KEYS.slice();

export const DEFAULT_NAV_LABELS = Object.freeze({
  'nav.contributors': { ko: '도움을 주신 분들', en: 'Contributors' },
  'nav.home': { ko: '홈', en: 'Home' },
  'nav.latest': { ko: '1개월 소식', en: 'Last 30 Days' },
  'nav.korea': { ko: 'Korea', en: 'Korea' },
  'nav.apr': { ko: 'APR', en: 'APR' },
  'nav.wosm': { ko: 'WOSM', en: 'WOSM' },
  'nav.wosm_members': { ko: '세계연맹 회원국 현황', en: 'WOSM Members Status' },
  'nav.people': { ko: '스카우트 인물', en: 'Scout People' },
  'nav.calendar': { ko: '캘린더', en: 'Calendar' },
  'nav.glossary': { ko: '용어집', en: 'Glossary' },
});

export const NAV_ITEMS = Object.freeze([
  { href: '/contributors', key: 'nav.contributors' },
  { href: '/', key: 'nav.home' },
  { href: '/latest', key: 'nav.latest' },
  { href: '/korea', key: 'nav.korea' },
  { href: '/apr', key: 'nav.apr' },
  { href: '/wosm', key: 'nav.wosm' },
  { href: '/wosm-members', key: 'nav.wosm_members' },
  { href: '/people', key: 'nav.people' },
  { href: '/calendar', key: 'nav.calendar' },
  { href: '/glossary', key: 'nav.glossary' },
]);

export const SITE_PAGE_KEY_BY_PATH = Object.freeze({
  '/index.html': 'home',
  '/latest': 'latest',
  '/korea': 'korea',
  '/apr': 'apr',
  '/wosm': 'wosm',
  '/wosm-members': 'wosm_members',
  '/people': 'people',
  '/glossary': 'glossary',
  '/contributors': 'contributors',
  '/search': 'search',
});

export const SITE_PATH_TITLE_FALLBACKS = Object.freeze({
  '/': '홈',
  '/index.html': '홈',
  '/latest': DEFAULT_NAV_LABELS['nav.latest'].ko,
  '/latest.html': DEFAULT_NAV_LABELS['nav.latest'].ko,
  '/korea': DEFAULT_NAV_LABELS['nav.korea'].ko,
  '/korea.html': DEFAULT_NAV_LABELS['nav.korea'].ko,
  '/apr': DEFAULT_NAV_LABELS['nav.apr'].ko,
  '/apr.html': DEFAULT_NAV_LABELS['nav.apr'].ko,
  '/wosm': DEFAULT_NAV_LABELS['nav.wosm'].ko,
  '/wosm.html': DEFAULT_NAV_LABELS['nav.wosm'].ko,
  '/wosm-members': DEFAULT_NAV_LABELS['nav.wosm_members'].ko,
  '/wosm-members.html': DEFAULT_NAV_LABELS['nav.wosm_members'].ko,
  '/people': DEFAULT_NAV_LABELS['nav.people'].en,
  '/people.html': DEFAULT_NAV_LABELS['nav.people'].en,
  '/calendar': DEFAULT_NAV_LABELS['nav.calendar'].ko,
  '/calendar.html': DEFAULT_NAV_LABELS['nav.calendar'].ko,
  '/glossary': DEFAULT_NAV_LABELS['nav.glossary'].ko,
  '/glossary.html': DEFAULT_NAV_LABELS['nav.glossary'].ko,
  '/contributors': DEFAULT_NAV_LABELS['nav.contributors'].ko,
  '/contributors.html': DEFAULT_NAV_LABELS['nav.contributors'].ko,
  '/dreampath': 'Dreampath',
  '/dreampath.html': 'Dreampath',
  '/search': '검색',
  '/search.html': '검색',
  '/admin': SITE_BRAND_NAME + ' 관리자',
  '/admin.html': SITE_BRAND_NAME + ' 관리자',
});
