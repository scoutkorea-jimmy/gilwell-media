import { DEFAULT_NAV_LABELS } from './site-structure.mjs';

export { DEFAULT_NAV_LABELS };

export async function loadNavLabels(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM settings WHERE key = 'nav_labels'`
    ).first();
    return normalizeNavLabels(row ? JSON.parse(row.value || '{}') : {});
  } catch {
    return normalizeNavLabels({});
  }
}

export function normalizeNavLabels(input) {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = {};
  Object.keys(DEFAULT_NAV_LABELS).forEach((key) => {
    const fallback = DEFAULT_NAV_LABELS[key];
    const value = source[key] && typeof source[key] === 'object' ? source[key] : {};
    normalized[key] = {
      ko: sanitizeLabel(value.ko, fallback.ko),
      en: sanitizeLabel(value.en, fallback.en),
    };
  });
  return normalized;
}

export function getNavLabel(navLabels, key, lang) {
  const normalized = navLabels && navLabels[key] && typeof navLabels[key] === 'object'
    ? navLabels[key]
    : DEFAULT_NAV_LABELS[key];
  const fallback = DEFAULT_NAV_LABELS[key] || { ko: key, en: key };
  const safeLang = lang === 'en' ? 'en' : 'ko';
  return normalized && normalized[safeLang]
    ? normalized[safeLang]
    : (fallback[safeLang] || fallback.ko || key);
}

function sanitizeLabel(value, fallback) {
  const trimmed = String(value == null ? '' : value).trim().slice(0, 80);
  return trimmed || fallback;
}
