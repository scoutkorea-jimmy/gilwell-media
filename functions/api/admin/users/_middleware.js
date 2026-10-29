/**
 * 사용자 관리 API 전체에 2단계 인증(OTP) 게이트 적용.
 * requireOtp 는 (1) 미등록 사용자/레거시 세션이면 통과시키고(점진 도입·락아웃 0)
 * (2) TOTP 등록 사용자가 유효한 admin_otp 쿠키 없이 접근하면 401 otp_required.
 * 인증/권한 자체는 각 핸들러의 requireOwner 가 담당(여기선 OTP 층만 추가).
 */
import { requireOtp } from '../../../_shared/otp-session.js';

export async function onRequest(context) {
  // 본인 프로필/자기 설정(/api/admin/users/me, /users/me/username 등)은 매 페이지
  // 로드에서 사이드바 권한·세션을 채우는 데 필요하므로 OTP 게이트에서 제외한다.
  // '사용자 관리'(전체 목록·타 계정 CRUD: /users, /users/:id ...)만 OTP 적용.
  let path = '';
  try { path = new URL(context.request.url).pathname; } catch (_) {}
  if (/\/users\/me(?:\/|$)/.test(path)) return context.next();
  const otp = await requireOtp(context.request, context.env);
  if (otp) return otp;
  return context.next();
}
