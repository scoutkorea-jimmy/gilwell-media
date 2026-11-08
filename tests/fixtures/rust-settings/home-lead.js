import { verifyTokenRole, extractToken } from '../../../functions/_shared/auth.js';
import { gateMenuAccess } from '../../../functions/_shared/admin-permissions.js';
import { serializePostImage } from '../../../functions/_shared/images.js';
import { purgeContentCache } from '../../../functions/_shared/cache-purge.js';
import { recordSettingChange } from '../../../functions/_shared/settings-audit.js';
import { readHomeLeadState, commitHomeLeadState, selectAutoHomeLeadId } from '../rust-home-lead-auto.js';

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
    const snapshot = await readHomeLeadState(env);
    const postId = snapshot.postId;
    const media = normalizeHomeLeadMedia(parseJsonValue(snapshot.mediaValue));

    // 모드와 함께, 자동 규칙이라면 어떤 글이 뽑히는지도 미리 보여준다.
    // 운영자가 '자동으로 전환' 을 누르기 전에 결과를 가늠할 수 있어야 한다.
    const mode = snapshot.mode;
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
      return json({ post: null, media, mode, auto_preview: autoPreview, revision: snapshot.revision }, 200);
    }
    const post = await env.DB.prepare(
      `SELECT id, category, title, subtitle, content, image_url, image_caption, created_at, tag, views, author, youtube_url
         FROM posts
        WHERE id = ? AND published = 1`
    ).bind(postId).first();
    return json({ post: post ? serializePostImage(post, origin) : null, media, mode, auto_preview: autoPreview, revision: snapshot.revision }, 200);
  } catch (err) {
    console.error('GET /api/settings/home-lead error:', err);
    return json({ post: null, media: DEFAULT_HOME_LEAD_MEDIA, mode: 'auto', auto_preview: null }, 500);
  }
}

export async function onRequestPut({ env, request }) {
  const origin = new URL(request.url).origin;
  const gate = await gateMenuAccess(request, env, 'home-lead', 'write');
  if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  try {
    const previous = await readHomeLeadState(env);
    if (Number.isInteger(body.if_revision) && body.if_revision !== previous.revision) return json({ error: '다른 화면에서 메인 스토리가 변경되었습니다. 입력을 보존하고 최신 설정을 확인해주세요.' }, 409);
    const next = { mode: previous.mode, postId: previous.postId, mediaValue: previous.mediaValue };
    const previousSnapshot = JSON.stringify({ mode: previous.mode, post_id: previous.postId || null, media: normalizeHomeLeadMedia(parseJsonValue(previous.mediaValue)) });
    const auto = body.mode === 'auto' || (Object.prototype.hasOwnProperty.call(body, 'post_id') && (body.post_id === null || body.post_id === 0));
    let picked = null;
    let category = '';
    if (auto) {
      // 수동 해제도 자동 선정으로 돌아간다. 선정과 모드 전환을 함께 저장한다.
      picked = await selectAutoHomeLeadId(env);
      next.mode = 'auto';
      if (picked.id) { next.postId = picked.id; if (picked.id !== previous.postId) next.mediaValue = null; }
    } else {
      const hasPost = Object.prototype.hasOwnProperty.call(body, 'post_id');
      const hasMedia = !!(body.media && typeof body.media === 'object');
      if (!hasPost && !hasMedia) return json({ error: '변경할 기사 또는 이미지 설정을 입력해주세요.' }, 400);
      if (hasPost) {
        const id = body.post_id == null ? 0 : Number(body.post_id);
        if (!Number.isInteger(id) || id < 0) return json({ error: '유효한 기사 ID를 입력해주세요.' }, 400);
        next.mode = 'manual'; next.postId = id;
        if (id) {
          const post = await env.DB.prepare(`SELECT id, category FROM posts WHERE id = ? AND published = 1`).bind(id).first();
          if (!post) return json({ error: '공개된 게시글만 메인 스토리로 지정할 수 있습니다.' }, 400);
          category = String(post.category || '');
        }
        if (!id || id !== previous.postId) next.mediaValue = null;
      }
      // Explicit clear also resets framing; media-only changes retain the mode.
      if (hasMedia && next.postId) next.mediaValue = JSON.stringify(normalizeHomeLeadMedia(body.media));
    }
    const result = await commitHomeLeadState(env, previous, next, auto && picked.id ? new Date().toISOString() : '');
    if (!result.committed) return json({ error: '동시 메인 스토리 변경이 감지되었습니다. 입력을 보존하고 최신 설정을 확인해주세요.' }, 409);
    await recordSettingChange(env, {
      key: 'home_lead', previousValue: previousSnapshot, path: '/api/settings/home-lead',
      message: auto ? '메인 스토리 자동 선정으로 전환' : next.postId ? '메인 스토리 설정 변경' : '메인 스토리 설정 초기화',
      details: { mode: next.mode, post_id: next.postId || null, revision: result.revision },
    });
    await purgeContentCache(env, origin, { postId: next.postId, categories: category ? [category] : [] }).catch((error) => console.error('home-lead cache purge error:', error));
    return json({ success: true, mode: next.mode, post_id: next.postId || null, media: normalizeHomeLeadMedia(parseJsonValue(next.mediaValue)), revision: result.revision, ...(picked ? { reason: picked.reason } : {}) });
  } catch (error) {
    console.error('PUT /api/settings/home-lead error:', error);
    return json({ error: '메인 스토리 설정을 저장하지 못했습니다.' }, 500);
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
