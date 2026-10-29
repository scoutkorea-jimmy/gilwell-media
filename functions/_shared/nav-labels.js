import { DEFAULT_NAV_LABELS } from './site-structure.mjs';
import { queryRust } from './rust-server.js';

export { DEFAULT_NAV_LABELS };

export async function loadNavLabels(env) {
  try {
    return await normalizeNavLabelsRust(env, null, true);
  } catch {
    return normalizeNavLabels({});
  }
}

export async function normalizeNavLabelsRust(env, raw, loadPublic = false) {
  const defaults = Object.entries(DEFAULT_NAV_LABELS).map(([key,value])=>({key,ko:value.ko,en:value.en}));
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, loadPublic ? 'public-nav-labels' : 'nav-labels-normalize', {raw:raw == null ? null : raw,defaults});
  if (!response.ok) throw new Error('Rust navigation labels normalization failed');
  const {entries} = await response.json();
  const labels = {};
  for (const entry of entries) labels[entry.key] = {ko:entry.ko,en:entry.en};
  return labels;
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
