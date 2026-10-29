import { queryRust, settingSnapshot, saveRevisionedSetting } from '../../_shared/rust-server.js';
/**
 * BP미디어 · Hero Posts Setting
 *
 * GET /api/settings/hero  ← public, returns { posts: [...], interval_ms }
 * PUT /api/settings/hero  ← admin only, body: { manual_post_ids: [N, N], manual_position, interval_ms }
 */
import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { serializePostImage } from '../../_shared/images.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';

const MAX_MANUAL_HERO_POSTS = 2;
const AUTO_HERO_POST_COUNT = 3;
const MAX_TOTAL_HERO_POSTS = MAX_MANUAL_HERO_POSTS + AUTO_HERO_POST_COUNT;

const DEFAULT_HERO_MEDIA = {
  fit: 'cover',
  desktop: {
    position_x: 50,
    position_y: 50,
    zoom: 100,
  },
  mobile: {
    position_x: 50,
    position_y: 50,
    zoom: 100,
  },
};

// ── GET /api/settings/hero ────────────────────────────────────
export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    const { results, hero: heroSettings, media: normalizedMedia, interval } = await settingSnapshot(env, 'hero');
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const revision = rows.hero_rev ? parseInt(rows.hero_rev.value, 10) || 0 : 0;

    const mediaMap = Object.fromEntries(heroSettings.manual_post_ids.map(String).filter(id => Object.hasOwn(normalizedMedia, id)).map(id => [id, normalizedMedia[id]]));
    const posts = await buildHeroPosts(env, origin, heroSettings.manual_post_ids, heroSettings.manual_position, mediaMap);

    return json({
      posts,
      interval_ms: interval,
      revision,
      media_map: mediaMap,
      post_ids: heroSettings.manual_post_ids,
      manual_post_ids: heroSettings.manual_post_ids,
      manual_position: heroSettings.manual_position,
      auto_fill_count: AUTO_HERO_POST_COUNT,
      total_count: MAX_TOTAL_HERO_POSTS,
    }, 200);
  } catch (err) {
    console.error('GET /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

// ── PUT /api/settings/hero ────────────────────────────────────
export async function onRequestPut({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'hero', 'write'); if (__gate) return __gate

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const manualPostIdsInput = Array.isArray(body && body.manual_post_ids)
    ? body.manual_post_ids
    : body && body.post_ids;
  const { interval_ms, if_revision } = body;
  if (!Array.isArray(manualPostIdsInput)) {
    return json({ error: 'manual_post_ids 배열을 입력해주세요' }, 400);
  }

  try {
    const { results } = await settingSnapshot(env, 'hero');
    const rows = Object.fromEntries((results || []).map((row) => [row.key, row]));
    const prevHero = rows.hero, prevInterval = rows.hero_interval, prevHeroMedia = rows.hero_media;
    const currentRev = rows.hero_rev ? parseInt(rows.hero_rev.value, 10) || 0 : 0;
    if (Number.isFinite(if_revision) && parseInt(if_revision, 10) !== currentRev) {
      return json({ error: '다른 변경이 감지되었습니다', revision: currentRev }, 409);
    }
    const nextRev = currentRev + 1;
    const normalized = await queryRust({env, request}, 'hero-write-normalize', {
      ids: manualPostIdsInput, position: body.manual_position, interval: interval_ms,
      media: body.media_map, existing: prevHeroMedia?.value,
    });
    if (!normalized.ok) throw new Error('Rust hero settings normalization failed');
    const { ids: safeIds, position: manualPosition, interval: safeInterval, media } = await normalized.json();
    const nextMediaMap = Object.fromEntries(Object.entries(media).map(([key, value]) => [key, { fit: value.fit, desktop: value.desktop, mobile: value.mobile }]));

    const values = [JSON.stringify({manual_post_ids:safeIds, manual_position:manualPosition}), String(safeInterval), JSON.stringify(nextMediaMap)];
    const changes = await saveRevisionedSetting(env, 'hero', currentRev, nextRev, values);
    if (changes !== 1) return json({ error: '동시 변경이 감지되었습니다. 입력을 보존하고 최신 설정을 확인해주세요.' }, 409);
    await Promise.all([
      recordSettingChange(env, {
        key: 'hero',
        previousValue: prevHero && prevHero.value,
        path: '/api/settings/hero',
        message: 'hero 설정 변경',
        details: { revision: nextRev, manual_post_ids: safeIds, manual_position: manualPosition },
      }),
      recordSettingChange(env, {
        key: 'hero_interval',
        previousValue: prevInterval && prevInterval.value,
        path: '/api/settings/hero',
        message: 'hero 전환 주기 설정 변경',
        details: { revision: nextRev, interval_ms: safeInterval },
      }),
      recordSettingChange(env, {
        key: 'hero_media',
        previousValue: prevHeroMedia && prevHeroMedia.value,
        path: '/api/settings/hero',
        message: 'hero 미디어 설정 변경',
        details: { revision: nextRev, post_ids: safeIds },
      }),
    ]);
    return json({
      success: true,
      post_ids: safeIds,
      manual_post_ids: safeIds,
      manual_position: manualPosition,
      interval_ms: safeInterval,
      revision: nextRev,
      media_map: nextMediaMap,
      auto_fill_count: AUTO_HERO_POST_COUNT,
      total_count: MAX_TOTAL_HERO_POSTS,
    });
  } catch (err) {
    console.error('PUT /api/settings/hero error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

async function buildHeroPosts(env, origin, manualPostIds, manualPosition, mediaMap) {
  const manualPosts = await loadManualHeroPosts(env, origin, manualPostIds, mediaMap);
  const autoPosts = await loadAutomaticHeroPosts(env, origin, manualPosts.map((post) => post.id));
  const ordered = manualPosition === 'before_auto'
    ? manualPosts.concat(autoPosts)
    : autoPosts.concat(manualPosts);
  return ordered.slice(0, MAX_TOTAL_HERO_POSTS);
}

async function loadManualHeroPosts(env, origin, postIds, mediaMap) {
  if (!Array.isArray(postIds) || !postIds.length) return [];

  const response = await queryRust({env, request:{url:origin}}, 'home-hero-manual', {ids:postIds});
  if (!response.ok) throw new Error('Rust manual hero query failed');
  const {posts: rows} = await response.json();
  const posts = rows.map(post => {
    const serialized = serializePostImage(post, origin);
    serialized.media = mediaMap[String(post.id)] || DEFAULT_HERO_MEDIA;
    return serialized;
  });
  return posts;
}

async function loadAutomaticHeroPosts(env, origin, excludedIds) {
  const exclusions = Array.isArray(excludedIds)
    ? excludedIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const response = await queryRust({env, request:{url:origin}}, 'home-hero-auto', {
    excluded:exclusions, limit:AUTO_HERO_POST_COUNT, publicDateExpr:'COALESCE(publish_at, created_at)',
  });
  if (!response.ok) throw new Error('Rust automatic hero query failed');
  const {posts:results} = await response.json();

  return (results || []).map((post) => {
    const serialized = serializePostImage(post, origin);
    serialized.media = DEFAULT_HERO_MEDIA;
    return serialized;
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
  });
}
