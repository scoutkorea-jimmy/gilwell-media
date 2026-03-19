import {
  clearPreviewLoginCode,
  generatePreviewLoginCode,
  json,
  requirePreviewRuntime,
  sendPreviewLoginEmail,
  storePreviewLoginCode,
} from '../../../_shared/preview-login.js';

export async function onRequestPost(context) {
  const blocked = requirePreviewRuntime(context.request, context.env);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await context.request.json();
  } catch (_) {}

  try {
    const code = generatePreviewLoginCode();
    await clearPreviewLoginCode(context.env);
    await storePreviewLoginCode(context.env, code);
    await sendPreviewLoginEmail(context.env, code);
    return json({
      ok: true,
      message: 'info@bpmedia.net 으로 인증코드를 보냈습니다.',
      email: 'info@bpmedia.net',
      expires_in_seconds: 300,
    });
  } catch (error) {
    console.error('POST /api/admin/preview-code/request error:', error);
    return json({ error: error.message || '인증코드를 보내지 못했습니다.' }, 500);
  }
}

export function onRequestGet(context) {
  return json({ error: 'Method not allowed' }, 405);
}
