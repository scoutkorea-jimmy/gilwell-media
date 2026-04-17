import { getCountryNameAliases, isCountryNameFallbackValue, translateCountryNameToKorean } from './country-name-ko.js';

const BASE_ITEM_KEYS = new Set([
  'country_ko',
  'country_en',
  'country_fr',
  'membership_category',
  'status_description',
  'sort_order',
  'extra_fields',
]);

const DEFAULT_COLUMNS = [
  { key: 'country_names', label: '국가명', type: 'country_names', system: true, default_header: '' },
  { key: 'membership_category', label: '회원 자격', type: 'field', system: true, default_header: 'WOSM membership category' },
  { key: 'status_description', label: '상태 설명', type: 'field', system: true, default_header: 'Status description' },
];
const REQUIRED_COLUMN_KEYS = new Set(['country_names']);

export const DEFAULT_WOSM_MEMBERS = {
  items: [],
  columns: DEFAULT_COLUMNS,
  import_mapping: {
    country_ko: '',
    country_en: 'Country Name option 1 E',
    country_fr: 'Country Name option 1 F',
  },
  registered_count: 176,
  public_copy: {
    overview_template: '{countryCount}개국 · {memberCount}개 회원연맹을 {viewLabel} 기준으로 정리했습니다. {collapsibleCount}개국은 {childLabel}을 접어둘 수 있습니다.',
    search_template: '검색 결과 {countryCount}개국 · {memberCount}개 회원연맹이 {viewLabel} 기준으로 표시됩니다.',
    section_meta_template: '{countryCount}개국 · {memberCount}개 회원연맹',
    helper_text: '대표 연맹을 먼저 보고, 같은 국가의 소속 회원연맹은 필요할 때 펼쳐볼 수 있습니다. 검색 결과에 하위 연맹이 포함되면 해당 그룹은 자동으로 펼쳐집니다.',
    child_label: '소속 회원연맹',
    section_region_label: '지역연맹',
    section_language_label: '공식 언어',
  },
  revision: 0,
};

export function sanitizeWosmMembersItems(raw) {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .map((item, index) => sanitizeWosmMemberItem(item, index))
    .filter((item) => item.country_en || item.country_fr || item.country_ko);
}

export function sanitizeWosmMemberItem(item, index) {
  const source = item && typeof item === 'object' ? item : {};
  const extraSource = source.extra_fields && typeof source.extra_fields === 'object' ? source.extra_fields : {};
  const unknownTopLevel = {};
  Object.keys(source).forEach((key) => {
    if (!BASE_ITEM_KEYS.has(key)) unknownTopLevel[key] = source[key];
  });
  const countryEn = sanitizeText(source.country_en, 160);
  const translatedKo = translateCountryNameToKorean(countryEn);
  const rawCountryKo = sanitizeText(source.country_ko, 120);
  const countryKo = isCountryNameFallbackValue(rawCountryKo, countryEn)
    ? (translatedKo || countryEn)
    : rawCountryKo;
  return {
    country_ko: countryKo,
    country_en: countryEn,
    country_fr: sanitizeText(source.country_fr, 160),
    membership_category: sanitizeText(source.membership_category, 160),
    status_description: sanitizeText(source.status_description, 260),
    extra_fields: sanitizeExtraFields(Object.assign({}, unknownTopLevel, extraSource)),
    sort_order: Number.isFinite(Number(source.sort_order)) ? Number(source.sort_order) : index,
  };
}

export function parseWosmMembersPayload(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return sanitizeWosmMembersItems(parsed);
  } catch {
    return [];
  }
}

export function normalizeWosmImportMapping(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    country_ko: sanitizeText(source.country_ko, 160),
    country_en: sanitizeText(source.country_en, 160) || DEFAULT_WOSM_MEMBERS.import_mapping.country_en,
    country_fr: sanitizeText(source.country_fr, 160) || DEFAULT_WOSM_MEMBERS.import_mapping.country_fr,
  };
}

export function parseWosmImportMapping(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    return normalizeWosmImportMapping(parsed);
  } catch {
    return normalizeWosmImportMapping({});
  }
}

export function normalizeWosmMembersColumns(raw) {
  const source = Array.isArray(raw) ? raw : [];
  if (!source.length) return DEFAULT_COLUMNS.map((column) => ({ ...column }));
  const seen = new Set();
  const result = [];
  source.forEach((column, index) => {
    const normalized = sanitizeWosmMembersColumn(column, index);
    if (!normalized || seen.has(normalized.key)) return;
    seen.add(normalized.key);
    result.push(normalized);
  });

  DEFAULT_COLUMNS.forEach((column) => {
    const existingIndex = result.findIndex((item) => item.key === column.key);
    if (existingIndex >= 0) {
      result[existingIndex] = {
        ...result[existingIndex],
        label: sanitizeText(result[existingIndex].label, 40) || column.label,
        type: column.type,
        system: true,
        default_header: column.key === 'country_names'
          ? ''
          : sanitizeText(result[existingIndex].default_header, 160) || column.default_header,
      };
      return;
    }
    if (REQUIRED_COLUMN_KEYS.has(column.key)) {
      seen.add(column.key);
      result.push({ ...column });
    }
  });

  return prioritizeWosmColumns(result);
}

export function parseWosmMembersColumns(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return normalizeWosmMembersColumns(parsed);
  } catch {
    return normalizeWosmMembersColumns([]);
  }
}

export function normalizeWosmRegisteredCount(value) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
    return DEFAULT_WOSM_MEMBERS.registered_count;
  }
  var num = Number(value);
  if (!Number.isFinite(num) || num < 0) return DEFAULT_WOSM_MEMBERS.registered_count;
  return Math.round(num);
}

export function normalizeWosmMembersResponse(items, columns, importMapping, registeredCount, revision, publicCopy) {
  const normalizedItems = sanitizeWosmMembersItems(items).map((item) => ({
    ...item,
    country_aliases: buildWosmCountryAliases(item),
  }));
  return {
    items: normalizedItems,
    columns: normalizeWosmMembersColumns(columns),
    import_mapping: normalizeWosmImportMapping(importMapping),
    registered_count: normalizeWosmRegisteredCount(registeredCount),
    public_copy: normalizeWosmPublicCopy(publicCopy),
    revision: Number.isFinite(Number(revision)) ? Number(revision) : 0,
  };
}

function buildWosmCountryAliases(item) {
  const aliases = new Set();
  const addAlias = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    aliases.add(text);
  };
  addAlias(item && item.country_ko);
  addAlias(item && item.country_en);
  addAlias(item && item.country_fr);
  const translatedKo = translateCountryNameToKorean(item && item.country_en);
  addAlias(translatedKo);
  getCountryNameAliases(item && item.country_en).forEach(addAlias);
  getCountryNameAliases(item && item.country_ko).forEach(addAlias);

  return Array.from(aliases);
}

export function normalizeWosmPublicCopy(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const defaults = DEFAULT_WOSM_MEMBERS.public_copy;
  return {
    overview_template: sanitizeText(source.overview_template, 320) || defaults.overview_template,
    search_template: sanitizeText(source.search_template, 240) || defaults.search_template,
    section_meta_template: sanitizeText(source.section_meta_template, 120) || defaults.section_meta_template,
    helper_text: sanitizeText(source.helper_text, 360) || defaults.helper_text,
    child_label: sanitizeText(source.child_label, 40) || defaults.child_label,
    section_region_label: sanitizeText(source.section_region_label, 30) || defaults.section_region_label,
    section_language_label: sanitizeText(source.section_language_label, 30) || defaults.section_language_label,
  };
}

export function parseWosmPublicCopy(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    return normalizeWosmPublicCopy(parsed);
  } catch {
    return normalizeWosmPublicCopy({});
  }
}

function sanitizeWosmMembersColumn(column, index) {
  const source = column && typeof column === 'object' ? column : {};
  const rawKey = String(source.key || '').trim();
  const fallbackKey = 'column_' + String(index + 1);
  const key = sanitizeColumnKey(rawKey || fallbackKey);
  if (!key) return null;
  const system = key === 'country_names' || key === 'membership_category' || key === 'status_description';
  return {
    key,
    label: sanitizeText(source.label, 40) || key,
    type: key === 'country_names' ? 'country_names' : 'field',
    system,
    default_header: key === 'country_names' ? '' : sanitizeText(source.default_header, 160),
  };
}

function sanitizeExtraFields(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  Object.keys(source).forEach((key) => {
    const sanitizedKey = sanitizeColumnKey(key);
    if (!sanitizedKey || BASE_ITEM_KEYS.has(sanitizedKey)) return;
    result[sanitizedKey] = sanitizeText(source[key], 260);
  });
  return result;
}

function sanitizeColumnKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function prioritizeWosmColumns(columns) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  const sortColumns = [];
  const others = [];
  list.forEach((column) => {
    if (isSortPriorityColumn(column)) sortColumns.push(column);
    else others.push(column);
  });
  return sortColumns.concat(others);
}

function isSortPriorityColumn(column) {
  const key = String(column && column.key || '').toLowerCase();
  const label = String(column && column.label || '').toLowerCase();
  const header = String(column && column.default_header || '').toLowerCase();
  return key.includes('sort')
    || label.includes('정렬')
    || label.includes('순번')
    || header.includes('strict order');
}

function sanitizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}
