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
  return {
    country_ko: sanitizeText(source.country_ko, 120),
    country_en: sanitizeText(source.country_en, 160),
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

  return result.sort((a, b) => {
    if (a.key === 'country_names') return -1;
    if (b.key === 'country_names') return 1;
    return 0;
  });
}

export function parseWosmMembersColumns(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return normalizeWosmMembersColumns(parsed);
  } catch {
    return normalizeWosmMembersColumns([]);
  }
}

export function normalizeWosmMembersResponse(items, columns, importMapping, revision) {
  return {
    items: sanitizeWosmMembersItems(items),
    columns: normalizeWosmMembersColumns(columns),
    import_mapping: normalizeWosmImportMapping(importMapping),
    revision: Number.isFinite(Number(revision)) ? Number(revision) : 0,
  };
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

function sanitizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}
