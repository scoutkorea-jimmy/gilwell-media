import { PUBLIC_DATE_EXPR } from './post-public-date.js';
import { queryRust } from './rust-server.js';

export async function findRelatedPosts(env, basePost, limit = 5, manualPromise) {
  if (!env?.DB || !basePost?.id) return [];
  const manualPosts = await (manualPromise || findManualRelatedPosts(env, basePost, limit));
  const manualIds = manualPosts.map((item) => item.id);
  const autoLimit = Math.max(0, limit - manualPosts.length);
  if (!autoLimit) return manualPosts.slice(0, limit);
  return findAutoRelatedPosts(env, basePost, autoLimit, manualIds, manualPosts, limit);
}

export async function findManualRelatedPosts(env, basePost, limit = 5) {
  if (!env?.DB || !basePost?.id) return [];
  const raw = basePost.related_posts_manual;
  if (typeof limit === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  const numericLimit = Number(limit);
  const limitKind = Number.isNaN(numericLimit) ? 'nan' : numericLimit === Infinity ? 'inf' : numericLimit === -Infinity ? '-inf' : 'finite';
  const options = {rawJson: JSON.stringify(raw ?? null), postId: Number(basePost.id), limit: Number.isFinite(numericLimit) ? numericLimit : null, limitKind};
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'related-manual', options);
  if (!rust.ok) throw new Error('Rust manual related posts query failed');
  const result = await rust.json();
  return result.items || [];
}

async function findAutoRelatedPosts(env, basePost, limit, excludedIds, manualPosts, totalLimit) {
  const excluded = Array.isArray(excludedIds) ? excludedIds.filter(Boolean) : [];
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'related-auto', {
    postId: Number(basePost.id), category: basePost.category || '', excluded,
    tag:String(basePost.tag || ''), metaTags:String(basePost.meta_tags || ''), title:String(basePost.title || ''),
    limit:Number.isFinite(limit) ? limit : null, unbounded:limit === Infinity,
    manualItems:manualPosts, totalLimit:Number.isFinite(Number(totalLimit)) ? Number(totalLimit) : null,
    baseCategory: basePost.category === undefined ? { undefined: true } : basePost.category,
    publicDateExpr: PUBLIC_DATE_EXPR,
  });
  if (!rust.ok) throw new Error('Rust automatic related posts query failed');
  const { items } = await rust.json();
  return items;
}

export function parseManualRelatedIds(raw) {
  if (!raw) return [];
  var parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = String(raw).split(',');
    }
  }
  if (!Array.isArray(parsed)) return [];
  var seen = new Set();
  return parsed.map(function (item) {
    return typeof item === 'object' && item ? item.id : item;
  }).map(function (value) {
    return parseInt(value, 10);
  }).filter(function (value) {
    if (!Number.isFinite(value) || value < 1 || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function extractRelatedTerms() {
  const out = new Set();
  Array.from(arguments).forEach((value) => {
    String(value || '')
      .split(/[\s,]+/)
      .map((item) => item.trim().toLowerCase().replace(/^#+/, ''))
      // D1/SQLite rejects unusually complex LIKE patterns. Meta-tag fields can
      // contain a whole space-separated hashtag sentence, so keep each search
      // token bounded and remove LIKE wildcard characters before binding it.
      .map((item) => item.replace(/[%_\\]/g, ''))
      .filter((item) => item.length >= 2 && item.length <= 64)
      .forEach((item) => out.add(item));
  });
  return out;
}
