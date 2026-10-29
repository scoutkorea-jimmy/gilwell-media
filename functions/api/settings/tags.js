import { singleSetting, queryRust } from '../../_shared/rust-server.js';
/**
 * Gilwell Media · Tag (글머리) Settings
 *
 * GET /api/settings/tags  ← public, returns available tags
 * PUT /api/settings/tags  ← admin only, update tags
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const DEFAULT_TAGS = {
  common: ['소식', '공지', '행사', '보고', '특집', '단독', '속보'],
  categories: {
    korea: [],
    apr: [],
    wosm: [],
    people: [],
  },
};

// GET /api/settings/tags
//   No query          → public list of tag names used by the homepage filter bars.
//   ?category=<slug>  → public list scoped to one category.
//   ?usage=<tag>      → ADMIN-ONLY: reveals how many posts use this tag and links.
//
// The admin branch is explicitly gated by the `usage` param, so no other
// parameter combination can leak the usage data. Any unknown admin-adjacent
// parameter should also require a valid token — add it to the gated set below.
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const usageTag = String(url.searchParams.get('usage') || '').trim();
  if (usageTag) {
    const __gate = await gateMenuAccess(request, env, 'tags', 'view'); if (__gate) return __gate
    const usage = await getTagUsage(env, usageTag);
    return json(usage);
  }

  try {
    const row = await singleSetting(env, 'tags');
    const parsed = row ? JSON.parse(row.value) : DEFAULT_TAGS;
    const tags = await normalizeTagSettingsRust(parsed, env);
    const category = url.searchParams.get('category');
    const {items} = await tagSettingsPlanRust(tags, tags, category, env);
    return json({
      items,
      common: tags.common,
      categories: tags.categories,
    });
  } catch (err) {
    if (request && new URL(request.url).searchParams.get('scope') === 'admin') return json({ error: '설정을 불러오지 못했습니다. 다시 시도해주세요.' }, 500);
    console.error('GET /api/settings/tags error:', err);
    return json({
      items: getTagsForCategory(DEFAULT_TAGS, null),
      common: DEFAULT_TAGS.common,
      categories: DEFAULT_TAGS.categories,
    });
  }
}

export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'tags', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  let safe;
  if (Array.isArray(body.items)) {
    safe = await normalizeTagSettingsRust(body.items, env);
  } else if (body && typeof body === 'object') {
    safe = await normalizeTagSettingsRust({
      common: body.common,
      categories: body.categories,
    }, env);
  } else {
    return json({ error: '태그 구조를 입력해주세요' }, 400);
  }

  try {
    const previousRow = await singleSetting(env, 'tags');
    const current = await normalizeTagSettingsRust(previousRow ? JSON.parse(previousRow.value) : DEFAULT_TAGS, env);
    if (body.if_current && JSON.stringify(await normalizeTagSettingsRust(body.if_current, env)) !== JSON.stringify(current)) return json({ error: '태그 설정이 다른 화면에서 변경되었습니다. 입력을 보존하고 최신 값을 확인해주세요.' }, 409);
    const {items,removed:removedTags} = await tagSettingsPlanRust(current, safe, null, env);
    const used = await findUsedRemovedTag(env, removedTags);
    if (used) return used;
    const commit = await queryRust({env, request}, 'tag-commit', {
      value: JSON.stringify(safe), expected: previousRow ? previousRow.value : null, removed: removedTags,
    });
    if (!commit.ok) throw new Error('Rust tag commit failed');
    const {changes} = await commit.json();
    if (changes !== 1) {
      const raced = await findUsedRemovedTag(env, removedTags);
      if (raced) return raced;
      return json({ error: '동시 태그 변경이 감지되었습니다.' }, 409);
    }
    await recordSettingChange(env, {
      key: 'tags',
      previousValue: current ? JSON.stringify(current) : null,
      path: '/api/settings/tags',
      message: '글머리 태그 설정 변경',
      details: { common_count: safe.common.length },
    });
    return json({
      items,
      common: safe.common,
      categories: safe.categories,
    });
  } catch (err) {
    console.error('PUT /api/settings/tags error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function loadTagSettings(env) {
  try {
    const row = await singleSetting(env, 'tags');
    return normalizeTagSettings(row ? JSON.parse(row.value) : DEFAULT_TAGS);
  } catch (_) {
    return normalizeTagSettings(DEFAULT_TAGS);
  }
}

export function normalizeTagSettings(raw) {
  const normalized = {
    common: [],
    categories: {
      korea: [],
      apr: [],
      wosm: [],
      people: [],
    },
  };

  if (Array.isArray(raw)) {
    normalized.common = sanitize(raw);
    return normalized;
  }

  if (raw && typeof raw === 'object') {
    normalized.common = sanitize(raw.common);
    ['korea', 'apr', 'wosm', 'people'].forEach((category) => {
      normalized.categories[category] = sanitize(raw.categories?.[category] || (category === 'wosm' ? raw.categories?.worm : null));
    });
  }

  return normalized;
}

export async function normalizeTagSettingsRust(raw, env = {}, run = queryRust) {
  const fallback = () => normalizeTagSettings(raw);
  try {
    const source = Array.isArray(raw) ? {common:raw} : (raw && typeof raw === 'object' ? raw : {});
    const categories = source.categories;
    const groups = [source.common, categories?.korea, categories?.apr, categories?.wosm || categories?.worm, categories?.people]
      .map(values => (Array.isArray(values) ? values : []).map(value => String(value || '')));
    if (groups.some(group => group.some(value => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)))) return fallback();
    const response = await run({env, request:{url:'https://internal.invalid/'}}, 'tag-settings-normalize', {groups});
    if (!response.ok) return fallback();
    const {groups: result} = await response.json();
    if (!Array.isArray(result) || result.length !== 5 || !result.every(group =>
      Array.isArray(group) && group.length <= 100 && new Set(group).size === group.length &&
      group.every(value => typeof value === 'string' && value.length > 0 && value === value.trim())
    )) return fallback();
    return {common:result[0], categories:{korea:result[1], apr:result[2], wosm:result[3], people:result[4]}};
  } catch { return fallback(); }
}

function sanitize(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 100);
}

function getTagsForCategory(tags, category) {
  const chosen = ['korea', 'apr', 'wosm', 'people'].includes(category === 'worm' ? 'wosm' : category) ? (category === 'worm' ? 'wosm' : category) : 'korea';
  const seen = new Set();
  return tags.common.concat(tags.categories[chosen] || []).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export async function tagSettingsPlanRust(current, next, category, env = {}) {
  const original={items:getTagsForCategory(next,category),removed:collectRemovedTags(current,next)};
  try {
    const groups=tags=>[tags.common,tags.categories.korea,tags.categories.apr,tags.categories.wosm,tags.categories.people];
    const response=await queryRust({env,request:{url:'https://internal.invalid/'}},'tag-settings-plan',{current:groups(current),next:groups(next),category:category || null});
    if (!response.ok) return original;
    const result=await response.json();
    if (!Array.isArray(result.items)||!Array.isArray(result.removed)) return original;
    return JSON.stringify(result.items)===JSON.stringify(original.items) && JSON.stringify(result.removed)===JSON.stringify(original.removed)?result:original;
  } catch {return original;}
}

function collectRemovedTags(current, next) {
  const currentTags = flattenTags(current);
  const nextTags = new Set(flattenTags(next));
  return currentTags.filter((tag) => !nextTags.has(tag));
}

function flattenTags(tags) {
  const collected = [];
  const pushUnique = (item) => {
    const value = String(item || '').trim();
    if (!value || collected.includes(value)) return;
    collected.push(value);
  };
  sanitize(tags && tags.common).forEach(pushUnique);
  ['korea', 'apr', 'wosm', 'people'].forEach((category) => {
    sanitize(tags && tags.categories && tags.categories[category]).forEach(pushUnique);
  });
  return collected;
}

async function findUsedRemovedTag(env, removedTags) {
  if (!removedTags.length) return null;
  const response=await queryRust({env,request:{url:'https://internal.invalid/'}},'removed-tag-usage',{removed:removedTags});
  if(!response.ok) throw new Error('Rust removed tag usage query failed');
  const result=await response.json();
  if (!result || !Object.hasOwn(result,'usage')) throw new Error('Invalid removed tag usage response');
  const usage=result.usage;
  if (usage === null) return null;
  if (!usage || !removedTags.includes(usage.tag) || usage.in_use !== true || !Number.isInteger(usage.count) || usage.count<1 || !Array.isArray(usage.posts) || usage.posts.length<1 || usage.posts.length>5) throw new Error('Invalid removed tag usage response');
  return json({
    error: `"${usage.tag}" 태그가 적용된 글이 있어 삭제할 수 없습니다. 먼저 해당 글의 태그에서 제외해주세요.`,
    tag_in_use: usage.tag, count: usage.count, posts: usage.posts,
  }, 409);
}

async function getTagUsage(env, tag) {
  const safeTag = String(tag || '').trim();
  if (!safeTag) {
    return { tag: safeTag, in_use: false, count: 0, posts: [] };
  }
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'tag-usage', {tag:safeTag});
  if (!response.ok) throw new Error('Rust tag usage query failed');
  const usage = await response.json();
  if (usage.tag !== safeTag || typeof usage.in_use !== 'boolean' || !Number.isInteger(usage.count) || usage.count < 0 || usage.in_use !== (usage.count > 0) || !Array.isArray(usage.posts)) throw new Error('Invalid Rust tag usage response');
  return usage;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
