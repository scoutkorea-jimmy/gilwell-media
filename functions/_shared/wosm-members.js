export const DEFAULT_WOSM_MEMBERS = {
  items: [],
  import_mapping: {
    country_ko: '',
    country_en: 'Country Name option 1 E',
    country_fr: 'Country Name option 1 F',
    membership_category: 'WOSM membership category',
    status_description: 'Status description',
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
  return {
    country_ko: sanitizeText(source.country_ko, 120),
    country_en: sanitizeText(source.country_en, 160),
    country_fr: sanitizeText(source.country_fr, 160),
    membership_category: sanitizeText(source.membership_category, 160),
    status_description: sanitizeText(source.status_description, 260),
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
    membership_category: sanitizeText(source.membership_category, 160) || DEFAULT_WOSM_MEMBERS.import_mapping.membership_category,
    status_description: sanitizeText(source.status_description, 160) || DEFAULT_WOSM_MEMBERS.import_mapping.status_description,
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

export function normalizeWosmMembersResponse(items, importMapping, revision) {
  return {
    items: sanitizeWosmMembersItems(items),
    import_mapping: normalizeWosmImportMapping(importMapping),
    revision: Number.isFinite(Number(revision)) ? Number(revision) : 0,
  };
}

function sanitizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}
