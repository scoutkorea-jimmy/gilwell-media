/**
 * 프리셋 관리(개별 프리셋) API 에 2단계 인증(OTP) 게이트 적용.
 * 목록/생성(/api/admin/presets)은 presets.js 핸들러에서 직접 requireOtp 호출.
 */
import { requireOtp } from '../../../_shared/otp-session.js';

export async function onRequest(context) {
  const otp = await requireOtp(context.request, context.env);
  if (otp) return otp;
  return context.next();
}
