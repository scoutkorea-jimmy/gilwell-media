/**
 * OTP 세션 마커 — 민감 메뉴 2FA 통과 표식(단명 서명 쿠키) + 게이트 헬퍼.
 *
 * 관리자 로그인 세션(admin_token, 24h)과 별개로, 사용자가 TOTP 6자리(또는 백업코드)를
 * 통과하면 10분짜리 서명 쿠키(admin_otp)를 발급한다. 4개 민감 메뉴 API 는 이 쿠키가
 * 유효해야 통과 — totp 미등록 사용자에겐 게이트가 적용되지 않아(락아웃 위험 0) 점진 도입.
 *
 *   서명: HMAC-SHA256(env.ADMIN_SECRET) — admin_token 과 동일 시크릿/알고리즘.
 *   페이로드: { uid, exp(ms) }. uid 바인딩으로 타 계정 쿠키 재사용 차단.
 */
import { readCookie } from './auth.js';
import { loadAdminSession } from './admin-permissions.js';

export const OTP_COOKIE = 'admin_otp';
export const OTP_TTL_SEC = 600; // 10분

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlJsonDecode(s) {
  try { return JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function timingEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let r = a.length ^ b.length;
  for (let i = 0; i < len; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

/** uid 에 바인딩된 단명 OTP 마커 토큰 생성. */
export async function issueOtpToken(secret, uid, ttlSec = OTP_TTL_SEC) {
  const body = b64url(JSON.stringify({ uid: Number(uid), exp: Date.now() + ttlSec * 1000 }));
  const sig = await hmac(secret, body);
  return body + '.' + sig;
}
/** 토큰 검증 — 서명·만료·uid 일치. 유효하면 페이로드, 아니면 null. */
export async function readOtpToken(token, secret, expectUid) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const expSig = await hmac(secret, body);
  if (!timingEqual(sig, expSig)) return null;
  const p = b64urlJsonDecode(body);
  if (!p || !p.exp || p.exp < Date.now()) return null;
  if (expectUid != null && Number(p.uid) !== Number(expectUid)) return null;
  return p;
}

// admin_token(로그인 쿠키)과 동일한 속성으로 맞춘다(SameSite=Lax + encode).
// SameSite=Strict 는 일부 same-origin fetch 맥락에서 전송 누락이 보고됨 → 검증된
// 로그인 쿠키와 동일하게 Lax 사용(여전히 같은 사이트 한정).
export function buildOtpCookie(token, maxAgeSec = OTP_TTL_SEC) {
  return `${OTP_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export function clearOtpCookie() {
  return `${OTP_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * 민감 메뉴 게이트 — 호출 endpoint 의 기존 인증 게이트 통과 직후에 호출.
 * 반환: null = 통과(미등록이거나 OTP 쿠키 유효) / Response(401 otp_required) = 차단.
 * 클라이언트 _apiFetch 는 body.error==='otp_required' 를 보고 재로그인 대신 OTP 모달을 띄운다.
 */
export async function requireOtp(request, env) {
  let session = null;
  try { session = await loadAdminSession(request, env); } catch { session = null; }
  // 세션 없음/레거시 오너(uid 없음) → 퍼-유저 TOTP 적용 불가(여기선 게이트 통과; 인증 자체는 endpoint 게이트가 담당)
  if (!session || !session.uid) return null;
  let row = null;
  try {
    row = await env.DB.prepare(`SELECT totp_enabled FROM admin_users WHERE id = ?`).bind(session.uid).first();
  } catch { return null; }
  if (!row || !Number(row.totp_enabled)) return null; // 미등록 → 게이트 미적용(점진 도입)
  // 토큰 전송: 헤더(X-Admin-Otp) 우선 + 쿠키(admin_otp) 백업. 둘 중 하나라도 유효하면 통과.
  // 헤더 경로는 프론트가 sessionStorage 토큰을 직접 실어 보내므로 쿠키 저장/전송 이슈를 우회한다.
  const headerTok = request.headers.get('X-Admin-Otp') || '';
  if (headerTok && await readOtpToken(headerTok, env.ADMIN_SECRET, session.uid)) return null;
  const cookieTok = readCookie(request, OTP_COOKIE) || '';
  if (cookieTok && await readOtpToken(cookieTok, env.ADMIN_SECRET, session.uid)) return null;
  return new Response(
    JSON.stringify({ error: 'otp_required', reason: '2단계 인증(OTP)이 필요합니다.' }),
    { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}
