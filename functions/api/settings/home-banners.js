/**
 * 홈 팝업 배너 관리 API
 *
 *   GET  /api/settings/home-banners   관리자 — 기간·활성 무관 전체 목록
 *   PUT  /api/settings/home-banners   관리자 — 전체 목록 교체 (최대 2개)
 *
 * 공개 노출은 `/api/home` 의 banners 섹션과 SSR 폴백이 담당한다
 * (조회 로직은 functions/_shared/home-banners.js 로 공유).
 *
 * PUT 은 부분 수정이 아니라 **전체 교체**다. 관리자 화면이 항상 전체 목록을
 * 보내므로 삭제/순서변경을 한 번에 처리할 수 있고, 개수 제한도 한 곳에서 강제된다.
 *
 * 이미지: 관리자가 data URL 로 보내면 여기서 R2 에 저장하고 `/api/images/<key>`
 * 형태의 경로로 바꿔 저장한다(다른 이미지 업로드와 동일한 규약).
 */

import { verifyTokenRole, extractToken } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { recordSettingChange } from '../../_shared/settings-audit.js';
import { purgeContentCache } from '../../_shared/cache-purge.js';
import { storeDataImage, deleteStoredImageByUrl } from '../../_shared/image-storage.js';
import { loadAllHomeBanners, MAX_HOME_BANNERS, serializeBanner } from '../../_shared/home-banners.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet({ env, request }) {
  const gate = await gateMenuAccess(request, env, 'home-banners', 'view');
  if (gate) return gate;
  try {
    const snapshot = await readHomeBannerState(env);
    return json({ ...snapshot, max: MAX_HOME_BANNERS });
  } catch (err) {
    console.error('GET /api/settings/home-banners error:', err);
    return json({ error: '배너 목록을 불러오지 못했습니다.' }, 500);
  }
}

export async function onRequestPut({ env, request }) {
  const gate = await gateMenuAccess(request, env, 'home-banners', 'write');
  if (gate) return gate;

  const token = extractToken(request);
  const role = await verifyTokenRole(token, env);
  if (!role) return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  const incoming = Array.isArray(payload && payload.banners) ? payload.banners : null;
  if (!incoming) return json({ error: 'banners 배열이 필요합니다.' }, 400);
  if (incoming.length > MAX_HOME_BANNERS) {
    return json({ error: `배너는 최대 ${MAX_HOME_BANNERS}개까지만 등록할 수 있습니다.` }, 400);
  }

  const origin = new URL(request.url).origin;
  let previous, currentRev;
  try { const snapshot = await readHomeBannerState(env); previous = snapshot.banners; currentRev = snapshot.revision; } catch { return json({ error: '기존 배너를 확인하지 못했습니다. 설정을 다시 불러와주세요.' }, 500); }
  if (Number.isInteger(payload.if_revision) && payload.if_revision !== currentRev) return json({ error: '홈 배너가 다른 화면에서 변경되었습니다. 최신 배너를 확인해주세요.' }, 409);
  if (payload.if_snapshot !== undefined && JSON.stringify(previous) !== JSON.stringify(payload.if_snapshot)) return json({ error: '다른 화면에서 홈 배너가 변경되었습니다. 입력을 보존하고 최신 배너를 확인해주세요.' }, 409);
  for (let i = 0; i < incoming.length; i++) {
    const item = incoming[i] || {};
    if (!String(item.image_url || '').trim() || !String(item.title || '').trim()) return json({ error: `${i + 1}번째 배너의 이미지와 설명을 입력해주세요.` }, 400);
    if (item.link_url && !/^(https?:\/\/|\/)/i.test(String(item.link_url).trim())) return json({ error: `${i + 1}번째 배너의 링크 형식을 확인해주세요.` }, 400);
    if (item.starts_at && item.ends_at && item.starts_at > item.ends_at) return json({ error: `${i + 1}번째 배너의 종료일이 시작일보다 빠릅니다.` }, 400);
  }
  const uploaded = [];
  async function cleanupOwnedImages() {
    try {
      const current = await loadAllHomeBanners(env);
      for (const image of uploaded) if (!current.some((row) => row.image_url === image.url)) await deleteStoredImageByUrl(env, image.url, origin);
    } catch (_) { /* An uncertain database outcome must retain potentially referenced images. */ }
  }

  // 정규화 + 이미지 저장
  const rows = [];
  for (let i = 0; i < incoming.length; i++) {
    const b = incoming[i] || {};
    let imageUrl = String(b.image_url || '').trim();
    if (!imageUrl) {
      return json({ error: `${i + 1}번째 배너에 이미지가 없습니다.` }, 400);
    }
    if (imageUrl.startsWith('data:')) {
      try {
        const image = await storeDataImage(env, imageUrl, origin, 'banner');
        imageUrl = image.url;
        if (image.key) uploaded.push(image);
      } catch (err) {
        console.error('banner image store error:', err);
        await cleanupOwnedImages();
        return json({ error: `${i + 1}번째 배너 이미지를 저장하지 못했습니다.` }, 500);
      }
    }
    const title = String(b.title || '').trim();
    if (!title) {
      // alt 텍스트가 비면 스크린리더 사용자에게 배너가 무의미해진다.
      return json({ error: `${i + 1}번째 배너의 설명(대체 텍스트)을 입력해주세요.` }, 400);
    }
    rows.push({
      image_url: imageUrl,
      link_url: String(b.link_url || '').trim(),
      title,
      sort_order: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : i,
      active: b.active ? 1 : 0,
      starts_at: String(b.starts_at || '').trim(),
      ends_at: String(b.ends_at || '').trim(),
    });
  }

  try {
    // 전체 교체 — 기존 행을 지우고 새로 넣는다.
    const nextRev = currentRev + 1;
    const claim = String(nextRev) + '|' + crypto.randomUUID();
    const stmts = [
      env.DB.prepare(`INSERT INTO settings(key, value) VALUES('home_banners_rev', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`).bind(claim, currentRev),
      env.DB.prepare(`DELETE FROM home_banners WHERE EXISTS(SELECT 1 FROM settings WHERE key = 'home_banners_rev' AND value = ?)`).bind(claim),
    ];
    rows.forEach((r) => {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO home_banners (image_url, link_url, title, sort_order, active, starts_at, ends_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now') WHERE EXISTS(SELECT 1 FROM settings WHERE key = 'home_banners_rev' AND value = ?)`
        ).bind(r.image_url, r.link_url || null, r.title, r.sort_order, r.active, r.starts_at || null, r.ends_at || null, claim)
      );
    });
    stmts.push(env.DB.prepare(`UPDATE settings SET value = ? WHERE key = 'home_banners_rev' AND value = ?`).bind(String(nextRev), claim));
    const writes = await env.DB.batch(stmts);
    if (!writes[0].meta || writes[0].meta.changes !== 1) { await cleanupOwnedImages(); return json({ error: '동시 홈 배너 변경이 감지되었습니다. 입력을 보존하고 최신 배너를 확인해주세요.' }, 409); }

    await recordSettingChange(env, {
      key: 'home_banners',
      previousValue: JSON.stringify(previous),
      path: '/api/settings/home-banners',
      message: rows.length ? `홈 배너 ${rows.length}개 설정` : '홈 배너 전체 해제',
      details: { count: rows.length },
    });

    await purgeContentCache(env, origin).catch((err) => {
      console.error('PUT /api/settings/home-banners cache purge error:', err);
    });

    return json({ ok: true, banners: await loadAllHomeBanners(env), max: MAX_HOME_BANNERS, revision: nextRev });
  } catch (err) {
    await cleanupOwnedImages();
    console.error('PUT /api/settings/home-banners error:', err);
    return json({ error: '배너를 저장하지 못했습니다.' }, 500);
  }
}

async function readHomeBannerState(env) {
  const reads = await env.DB.batch([
    env.DB.prepare(`SELECT id, image_url, link_url, title, sort_order, active, starts_at, ends_at, created_at, updated_at FROM home_banners ORDER BY sort_order ASC, id ASC`),
    env.DB.prepare(`SELECT value FROM settings WHERE key = 'home_banners_rev'`),
  ]);
  const banners = (reads[0].results || []).map((row) => ({ ...serializeBanner(row), created_at: row.created_at, updated_at: row.updated_at }));
  const revision = parseInt(reads[1].results && reads[1].results[0] && reads[1].results[0].value, 10) || 0;
  return { banners, revision };
}
