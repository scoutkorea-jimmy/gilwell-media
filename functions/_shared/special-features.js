import { PUBLIC_DATE_EXPR } from './post-public-date.js';

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
  const feature = sanitizeSpecialFeature(basePost && basePost.special_feature);
  const category = String(basePost && basePost.category || '').trim();
  const postId = Number(basePost && basePost.id || 0);
  if (!feature || !category) return [];

  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, tag, image_url, image_caption, created_at, publish_at, special_feature
       FROM posts
      WHERE published = 1
        AND category = ?
        AND COALESCE(special_feature, '') = ?
        AND id != ?
      ORDER BY ${PUBLIC_DATE_EXPR} DESC, id DESC
      LIMIT ?`
  ).bind(category, feature, postId, Math.max(1, limit)).all();

  return (results || []).map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title || '',
    subtitle: row.subtitle || '',
    tag: row.tag || '',
    image_url: row.image_url || '',
    image_caption: row.image_caption || '',
    created_at: row.created_at || '',
    publish_at: row.publish_at || '',
    special_feature: row.special_feature || '',
  }));
}

export async function getSpecialFeatureCollection(env, category, slug, opts = {}) {
  const safeCategory = String(category || '').trim();
  const safeSlug = String(slug || '').trim();
  if (!safeCategory || !safeSlug) return null;

  const { results } = await env.DB.prepare(
    `SELECT id, category, title, subtitle, tag, image_url, image_caption, created_at, publish_at, special_feature, content, author
       FROM posts
      WHERE published = 1
        AND category = ?
        AND special_feature IS NOT NULL
        AND special_feature != ''
      ORDER BY ${PUBLIC_DATE_EXPR} DESC, id DESC`
  ).bind(safeCategory).all();

  const items = (results || []).filter((row) => slugifySpecialFeature(row.special_feature) === safeSlug);
  if (!items.length) return null;

  const collection = {
    category: safeCategory,
    special_feature: items[0].special_feature || '',
    slug: safeSlug,
    items: items.slice(0, opts.limit ? Math.max(1, opts.limit) : items.length),
  };
  return collection;
}
