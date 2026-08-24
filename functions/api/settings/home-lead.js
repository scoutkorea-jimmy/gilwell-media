import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { serializePostImage } from '../../_shared/images.js';
import { purgeContentCache } from '../../_shared/cache-purge.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';
import { readHomeLeadMode, refreshAutoHomeLead, selectAutoHomeLeadId } from '../../_shared/home-lead-auto.js';

const DEFAULT_HOME_LEAD_MEDIA = {
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

export async function onRequestGet({ env, request }) {
  try {
    const origin = new URL(request.url).origin;
    const [postRow, mediaRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_post'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_media'`).first(),
    ]);
    const postId = postRow ? parseInt(postRow.value, 10) : 0;
    const media = normalizeHomeLeadMedia(parseJsonValue(mediaRow && mediaRow.value));

    // 모드와 함께, 자동 규칙이라면 어떤 글이 뽑히는지도 미리 보여준다.
    // 운영자가 '자동으로 전환' 을 누르기 전에 결과를 가늠할 수 있어야 한다.
    const mode = await readHomeLeadMode(env);
    let autoPreview = null;
    try {
      const picked = await selectAutoHomeLeadId(env);
      if (picked.id) {
        const row = await env.DB.prepare(
          `SELECT id, title FROM posts WHERE id = ? AND published = 1`
        ).bind(picked.id).first();
        if (row) autoPreview = { id: row.id, title: row.title, reason: picked.reason, candidates: picked.candidates };
      }
    } catch (err) {
      // 미리보기 실패가 패널 전체를 막으면 안 된다.
      console.error('home-lead auto preview error:', err);
    }

    if (!postId) {
      return json({ post: null, media, mode, auto_preview: autoPreview }, 200);
    }
    const post = await env.DB.prepare(
      `SELECT id, category, title, subtitle, content, image_url, image_caption, created_at, tag, views, author, youtube_url
         FROM posts
        WHERE id = ? AND published = 1`
    ).bind(postId).first();
    return json({ post: post ? serializePostImage(post, origin) : null, media, mode, auto_preview: autoPreview }, 200);
  } catch (err) {
    console.error('GET /api/settings/home-lead error:', err);
    return json({ post: null, media: DEFAULT_HOME_LEAD_MEDIA, mode: 'auto', auto_preview: null }, 500);
  }
}

export async function onRequestPut({ env, request }) {
  const origin = new URL(request.url).origin;
  const __gate = await gateMenuAccess(request, env, 'home-lead', 'view'); if (__gate) return __gate

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // 모드 전환 요청. 'auto' 로 바꾸면 다음 자정을 기다리지 않고 즉시 규칙대로 다시 고른다
  // — 운영자가 버튼을 눌렀는데 홈이 그대로면 동작하지 않은 것처럼 보이기 때문이다.
  const requestedMode = body && typeof body.mode === 'string' ? body.mode.trim() : '';
  if (requestedMode === 'auto') {
    try {
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('home_lead_mode', 'auto')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run();
      const refreshed = await refreshAutoHomeLead(env);
      await purgeContentCache(env, origin, { postId: refreshed.post_id }).catch((err) => {
        console.error('PUT /api/settings/home-lead (auto) cache purge error:', err);
      });
      await recordSettingChange(env, {
        key: 'home_lead',
        path: '/api/settings/home-lead',
        message: '메인 스토리 자동 선정으로 전환',
        details: { mode: 'auto', post_id: refreshed.post_id, reason: refreshed.reason },
      });
      return json({ success: true, mode: 'auto', post_id: refreshed.post_id, reason: refreshed.reason, media: DEFAULT_HOME_LEAD_MEDIA });
    } catch (err) {
      console.error('PUT /api/settings/home-lead auto error:', err);
      return json({ error: '자동 선정으로 전환하지 못했습니다.' }, 500);
    }
  }

  const hasPostId = !!(body && Object.prototype.hasOwnProperty.call(body, 'post_id'));
  const rawPostId = hasPostId ? parseInt(body.post_id, 10) : 0;
  const postId = Number.isFinite(rawPostId) ? rawPostId : 0;
  const hasMedia = !!(body && typeof body.media === 'object' && body.media);
  const media = hasMedia ? normalizeHomeLeadMedia(body.media) : null;

  try {
    const [currentRow, currentMediaRow] = await Promise.all([
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_post'`).first(),
      env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_media'`).first(),
    ]);
    const currentPostId = currentRow ? parseInt(currentRow.value, 10) : 0;
    const previousMedia = normalizeHomeLeadMedia(parseJsonValue(currentMediaRow && currentMediaRow.value));
    const previousSnapshot = JSON.stringify({
      post_id: currentPostId || null,
      media: previousMedia,
    });

    if (hasPostId && !postId) {
      await env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_post'`).run();
      await env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_media'`).run();
      // 명시적으로 비운 것이므로 자동이 다시 채우지 않도록 수동으로 고정한다.
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('home_lead_mode', 'manual')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run();
      await recordSettingChange(env, {
        key: 'home_lead',
        previousValue: previousSnapshot,
        path: '/api/settings/home-lead',
        message: '메인 스토리 설정 초기화',
        details: { post_id: null },
      });
      await purgeContentCache(env, origin).catch((err) => {
        console.error('PUT /api/settings/home-lead cache purge error:', err);
      });
      return json({ success: true, post_id: null, media: DEFAULT_HOME_LEAD_MEDIA });
    }

    var leadCategory = '';
    if (hasPostId) {
      // 메인 스토리 ↔ 에디터 추천 동시 지정 허용(2026-04-19). featured=1 배타 체크 제거.
      const post = await env.DB.prepare(`SELECT id, featured FROM posts WHERE id = ? AND published = 1`).bind(postId).first();
      if (!post) return json({ error: '공개된 게시글만 메인 스토리로 지정할 수 있습니다.' }, 400);
      leadCategory = String(post.category || '').trim();
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('home_lead_post', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(String(postId)).run();
      // 운영자가 직접 고른 글은 자정 작업이 덮어쓰면 안 된다.
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('home_lead_mode', 'manual')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run();
      if (!hasMedia && currentPostId !== postId) {
        await env.DB.prepare(
          `INSERT INTO settings (key, value) VALUES ('home_lead_media', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).bind(JSON.stringify(DEFAULT_HOME_LEAD_MEDIA)).run();
      }
    }

    if (hasMedia) {
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('home_lead_media', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).bind(JSON.stringify(media)).run();
    }

    await purgeContentCache(env, origin, {
      postId: hasPostId ? postId : currentPostId,
      categories: leadCategory ? [leadCategory] : [],
    }).catch((err) => {
      console.error('PUT /api/settings/home-lead cache purge error:', err);
    });

    const nextPayload = {
      success: true,
      post_id: hasPostId ? postId : currentPostId,
      media: media || (currentPostId !== postId && hasPostId ? DEFAULT_HOME_LEAD_MEDIA : normalizeHomeLeadMedia(parseJsonValue((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_lead_media'`).first())?.value))),
    };
    await recordSettingChange(env, {
      key: 'home_lead',
      previousValue: previousSnapshot,
      path: '/api/settings/home-lead',
      message: '메인 스토리 설정 변경',
      details: { post_id: nextPayload.post_id },
    });
    return json(nextPayload);
  } catch (err) {
    console.error('PUT /api/settings/home-lead error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extraHeaders),
  });
}

function parseJsonValue(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeHomeLeadMedia(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const fallbackDesktop = {
    position_x: clampNumber(raw.position_x, 0, 100, DEFAULT_HOME_LEAD_MEDIA.desktop.position_x),
    position_y: clampNumber(raw.position_y, 0, 100, DEFAULT_HOME_LEAD_MEDIA.desktop.position_y),
    zoom: clampNumber(raw.zoom, 60, 150, DEFAULT_HOME_LEAD_MEDIA.desktop.zoom),
  };
  const fallbackMobile = {
    position_x: fallbackDesktop.position_x,
    position_y: fallbackDesktop.position_y,
    zoom: fallbackDesktop.zoom,
  };
  const desktop = raw.desktop && typeof raw.desktop === 'object' ? raw.desktop : raw;
  const mobile = raw.mobile && typeof raw.mobile === 'object' ? raw.mobile : raw;
  return {
    fit: raw.fit === 'contain' ? 'contain' : 'cover',
    desktop: {
      position_x: clampNumber(desktop.position_x, 0, 100, fallbackDesktop.position_x),
      position_y: clampNumber(desktop.position_y, 0, 100, fallbackDesktop.position_y),
      zoom: clampNumber(desktop.zoom, 60, 150, fallbackDesktop.zoom),
    },
    mobile: {
      position_x: clampNumber(mobile.position_x, 0, 100, fallbackMobile.position_x),
      position_y: clampNumber(mobile.position_y, 0, 100, fallbackMobile.position_y),
      zoom: clampNumber(mobile.zoom, 60, 150, fallbackMobile.zoom),
    },
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
