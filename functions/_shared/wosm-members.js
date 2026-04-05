export const DEFAULT_WOSM_MEMBERS = {
  items: [],
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
  const membershipTotal = normalizeMembershipTotal(source.membership_total);
  return {
    country_ko: sanitizeText(source.country_ko, 120),
    country_en: sanitizeText(source.country_en, 160),
    country_fr: sanitizeText(source.country_fr, 160),
    membership_category: sanitizeText(source.membership_category, 160),
    membership_total: membershipTotal,
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

export function normalizeWosmMembersResponse(items, revision) {
  return {
    items: sanitizeWosmMembersItems(items),
    revision: Number.isFinite(Number(revision)) ? Number(revision) : 0,
  };
}

function sanitizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function normalizeMembershipTotal(value) {
  const numeric = parseInt(String(value == null ? '' : value).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}
