import { createToken } from '../../../_shared/auth.js';
import {
  clearPreviewLoginCode,
  json,
  requirePreviewRuntime,
  verifyPreviewLoginCode,
} from '../../../_shared/preview-login.js';

export async function onRequestPost(context) {
  const blocked = requirePreviewRuntime(context.request, context.env);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await context.request.json();
  } catch (_) {}

  const code = String(body && body.code || '').trim();
  if (!code) {
    return json({ error: '인증코드를 입력해주세요.' }, 400);
  }

  try {
    const result = await verifyPreviewLoginCode(context.env, code);
    if (!result.ok) {
      return json({ error: result.reason || '인증코드를 확인해주세요.' }, 401);
    }
    await clearPreviewLoginCode(context.env);
    const token = await createToken(context.env.ADMIN_SECRET, 'full');
    return json({ token, role: 'full' });
  } catch (error) {
    console.error('POST /api/admin/preview-code/verify error:', error);
    return json({ error: error.message || '인증 확인에 실패했습니다.' }, 500);
  }
}

export function onRequestGet(context) {
  return json({ error: 'Method not allowed' }, 405);
}
