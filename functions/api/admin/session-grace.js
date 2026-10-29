/**
 * Gilwell Media · Admin Session Grace
 * GET /api/admin/session-grace
 *
 * Phase 5 강제 재로그인 정책의 좁은 예외 — 새로고침 편의 핫픽스.
 *
 * 조건 (둘 다 만족):
 *   1) 로그인 시점의 IP 와 현재 요청 IP 가 동일 (CF-Connecting-IP 헤더)
 *   2) 토큰 발급(iat) 이후 10분 이내
 *
 * 둘 다 만족하면 /api/admin/session 와 동일한 200 + { authenticated, role, user }
 * 응답을 돌려준다. 클라이언트는 이 200 을 받으면 _purgeAdminClientState() 를
 * 건너뛰고 바로 _showApp() 으로 진입할 수 있다.
 *
 * 보안 모델:
 *   - 토큰 자체는 verifyToken() 으로 정규 검증 (서명 + 만료 + per-user epoch).
 *     이 grace 는 그 위에서 *추가* 제약을 거는 것 — 통과 폭이 더 좁다.
 *   - 10분 윈도우는 일반적인 모바일·고정 IP 환경에서 한 세션 사이클 안에 IP 가
 *     바뀌지 않을 정도의 짧은 시간.
 *   - 토큰의 ip 필드가 없으면 (구버전 토큰) grace 실패. 다음 로그인부터 적용됨.
 */

import { extractToken, readToken, verifyToken } from '../../_shared/auth.js';
import { loadAdminUserById, serializeAdminUser } from '../../_shared/admin-users.js';

const GRACE_WINDOW_MS = 10 * 60 * 1000; // 10분

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token) return deny('no_token');

  const valid = await verifyToken(token, env);
  if (!valid) return deny('invalid_token');

  const payload = await readToken(token, env.ADMIN_SECRET);
  if (!payload) return deny('unreadable_payload');

  // (1) IP 일치 검증
  const currentIp = (request.headers.get('CF-Connecting-IP') || '').trim();
  const tokenIp = payload.ip ? String(payload.ip).trim() : '';
  if (!tokenIp) return deny('legacy_token_no_ip');
  if (!currentIp) return deny('no_current_ip');
  if (tokenIp !== currentIp) return deny('ip_mismatch');

  // (2) 10분 윈도우
  const iat = Number(payload.iat) || 0;
  const ageMs = Date.now() - iat;
  if (!iat || ageMs < 0 || ageMs > GRACE_WINDOW_MS) return deny('grace_expired');

  // 통과 — /api/admin/session 응답 구조와 동일.
  const role = payload.role || 'full';
  const uid = payload.uid ? Number(payload.uid) : null;
  let user = null;
  if (uid) {
    const row = await loadAdminUserById(env, uid);
    if (row) user = serializeAdminUser(row);
  }

  return json({
    authenticated: true,
    role,
    user,
    legacy_session: !uid,
    grace: {
      remaining_ms: Math.max(0, GRACE_WINDOW_MS - ageMs),
      window_ms: GRACE_WINDOW_MS,
    },
  });
}

function deny(reason) {
  return json({ authenticated: false, reason }, 401);
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
