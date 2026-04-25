import { PUBLIC_DATE_EXPR } from './post-public-date.js';

export async function findRelatedPosts(env, basePost, limit = 5) {
  if (!env?.DB || !basePost?.id) return [];
  const manualPosts = await findManualRelatedPosts(env, basePost, limit);
  const manualIds = manualPosts.map((item) => item.id);
  const autoLimit = Math.max(0, limit - manualPosts.length);
  if (!autoLimit) return manualPosts.slice(0, limit);
  const autoPosts = await findAutoRelatedPosts(env, basePost, autoLimit, manualIds);
  return manualPosts.concat(autoPosts).slice(0, limit);
}

export async function findManualRelatedPosts(env, basePost, limit = 5) {
  if (!env?.DB || !basePost?.id) return [];
  const manualIds = parseManualRelatedIds(basePost && basePost.related_posts_manual).filter((id) => id !== Number(basePost.id)).slice(0, limit);
  if (!manualIds.length) return [];
  const placeholders = manualIds.map(() => '?').join(', ');
  const sql = `
    SELECT id, title, category, created_at, publish_at
      FROM posts
     WHERE published = 1
       AND id IN (${placeholders})
  `;
  const { results } = await env.DB.prepare(sql).bind(...manualIds).all();
  const byId = new Map((results || []).map((item) => [Number(item.id), mapRelatedPost(item)]));
  return manualIds.map((id) => byId.get(id)).filter(Boolean);
}

async function findAutoRelatedPosts(env, basePost, limit, excludedIds) {
  const anchorTagTerms = Array.from(extractTerms(basePost.tag, basePost.meta_tags)).slice(0, 6);
  const anchorTitleTerms = Array.from(extractTitleTerms(basePost.title)).slice(0, 8);
  const anchorTerms = anchorTagTerms.concat(anchorTitleTerms).slice(0, 10);
  let sql = `
    SELECT id, title, category, created_at, publish_at, tag, meta_tags
      FROM posts
     WHERE published = 1
       AND id != ?
  `;
  const bindings = [basePost.id];
  const excluded = Array.isArray(excludedIds) ? excludedIds.filter(Boolean) : [];
  if (excluded.length) {
    sql += ` AND id NOT IN (${excluded.map(() => '?').join(', ')})`;
    bindings.push(...excluded);
  }

  if (anchorTerms.length) {
    const likeParts = [];
    anchorTerms.forEach((term) => {
      likeParts.push(
        'LOWER(COALESCE(tag, \'\')) LIKE ?',
        'LOWER(COALESCE(meta_tags, \'\')) LIKE ?',
        'LOWER(COALESCE(title, \'\')) LIKE ?'
      );
      bindings.push(`%${term}%`, `%${term}%`, `%${term}%`);
    });
    sql += ` AND (category = ? OR ${likeParts.join(' OR ')})`;
    bindings.splice(1 + excluded.length, 0, basePost.category || '');
  } else if (basePost.category) {
    sql += ' AND category = ?';
    bindings.push(basePost.category);
  }

  sql += ` ORDER BY ${PUBLIC_DATE_EXPR} DESC LIMIT ?`;
  bindings.push(anchorTerms.length ? 40 : 20);

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();

  const scored = (results || []).map((post) => {
    const candidateTagTerms = extractTerms(post.tag, post.meta_tags);
    const candidateTitleTerms = extractTitleTerms(post.title);
    const tagOverlap = countOverlap(new Set(anchorTagTerms), candidateTagTerms);
    const titleOverlap = countOverlap(new Set(anchorTitleTerms), candidateTitleTerms);
    const categoryBonus = post.category === basePost.category ? 20 : 0;
    const tagBonus = tagOverlap * 100;
    const titleBonus = titleOverlap * 20;
    const score = tagBonus + titleBonus + categoryBonus;
    return Object.assign(mapRelatedPost(post), {
      sort_date: post.publish_at || post.created_at || '',
      score,
    });
  }).filter((post) => post.title);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.sort_date).localeCompare(String(a.sort_date));
  });

  return scored.slice(0, limit).map(function (post) {
    return {
      id: post.id,
      title: post.title,
      category: post.category,
      publish_at: post.publish_at,
      created_at: post.created_at,
    };
  });
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

function mapRelatedPost(post) {
  return {
    id: post.id,
    title: post.title || '',
    category: post.category || '',
    publish_at: post.publish_at || '',
    created_at: post.created_at || '',
  };
}

function extractTerms() {
  const out = new Set();
  Array.from(arguments).forEach((value) => {
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .forEach((item) => out.add(item));
  });
  return out;
}

function countOverlap(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  a.forEach((item) => {
    if (b.has(item)) count += 1;
  });
  return count;
}

function extractTitleTerms(value) {
  var normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ');
  return new Set(normalized.split(/\s+/).map(function (item) {
    return item.trim();
  }).filter(function (item) {
    return item.length >= 2;
  }));
}
