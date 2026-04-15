import { getNavLabel } from './nav-labels.js';

export const CATEGORY_META = Object.freeze({
  latest: { navKey: 'nav.latest', label: 'Latest', color: '#111111', tagClass: 'tag-latest' },
  korea: { navKey: 'nav.korea', label: 'Korea', color: '#0094B4', tagClass: 'tag-korea' },
  apr: { navKey: 'nav.apr', label: 'APR', color: '#FF5655', tagClass: 'tag-apr' },
  wosm: { navKey: 'nav.wosm', label: 'WOSM', color: '#248737', tagClass: 'tag-wosm' },
  people: { navKey: 'nav.people', label: 'Scout People', color: '#8A5A2B', tagClass: 'tag-people' },
  glossary: { navKey: 'nav.glossary', label: 'Glossary', color: '#5D6F2B', tagClass: 'tag-glossary' },
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
