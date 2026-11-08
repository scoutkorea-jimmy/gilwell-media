import { PUBLIC_DATE_EXPR } from './post-public-date.js';
import { queryRust } from './rust-server.js';

export function sanitizeSpecialFeature(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 120) : null;
}

export function slugifySpecialFeature(value) {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return '';
  const normalized = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized || 'feature';
}

export async function findSpecialFeaturePosts(env, basePost, limit = 50) {
  const rawFeature = String(basePost && basePost.special_feature || '');
  const category = String(basePost && basePost.category || '');
  const postId = Number(basePost && basePost.id || 0);
  if (!rawFeature || !category) return [];
  const hasUnpaired = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(rawFeature);
  const featureUnits = hasUnpaired ? Array.from({length:rawFeature.length}, (_, i) => rawFeature.charCodeAt(i)) : null;
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'related-feature', {
    postId, category, feature:featureUnits ? null : rawFeature, featureUnits, limit: Math.max(1, limit), publicDateExpr: PUBLIC_DATE_EXPR,
  });
  if (!rust.ok) throw new Error('Rust special feature posts query failed');
  return (await rust.json()).items || [];
}

export async function getSpecialFeatureCollection(env, category, slug, opts = {}) {
  const safeCategory = String(category || '').trim();
  const safeSlug = String(slug || '').trim();
  if (!safeCategory || !safeSlug) return null;

  const requestedLimit = opts.limit ? Math.max(1, opts.limit) : null;
  const limit = Number.isNaN(requestedLimit) ? 0 : requestedLimit;
  const rust = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'feature-collection', {
    category:safeCategory, slug:safeSlug, limit, publicDateExpr:PUBLIC_DATE_EXPR,
  });
  if (!rust.ok) throw new Error('Rust feature collection query failed');
  return (await rust.json()).collection;
}
