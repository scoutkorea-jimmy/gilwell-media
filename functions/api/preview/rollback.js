import { extractToken, safeCompare, verifyTokenRole } from '../../_shared/auth.js';
import { dispatchGithubWorkflow, json, previewOnly, rollbackPagesDeployment } from '../../_shared/preview-ops.js';

export async function onRequestPost(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: '올바른 요청 형식이 아닙니다.' }, 400);
  }

  const confirmPassword = String(body && body.confirm_password || '').trim();
  if (!confirmPassword || !safeCompare(confirmPassword, context.env.ADMIN_PASSWORD || '')) {
    return json({ error: '복구 전에도 full 관리자 비밀번호를 다시 확인해주세요.' }, 401);
  }

  const token = extractToken(context.request);
  if (token && !(await verifyTokenRole(token, context.env.ADMIN_SECRET, 'full'))) {
    return json({ error: '현재 관리자 세션에 복구 권한이 없습니다.' }, 401);
  }

  const deploymentId = body && body.deployment_id ? String(body.deployment_id) : '';
  const snapshotId = body && body.snapshot_id ? String(body.snapshot_id) : '';

  try {
    if (deploymentId) {
      await rollbackPagesDeployment(context.env, deploymentId);
      return json({
        success: true,
        queued: true,
        mode: 'deployment',
        message: 'Cloudflare 배포 롤백을 시작했습니다.',
      });
    }

    if (snapshotId) {
      await dispatchGithubWorkflow(context.env, 'rollback-snapshot.yml', 'preview', {
        snapshot_id: snapshotId,
        requested_at: new Date().toISOString(),
      });
      return json({
        success: true,
        queued: true,
        mode: 'snapshot',
        message: '코드 스냅샷 복구 워크플로우를 시작했습니다.',
      });
    }

    return json({ error: 'deployment_id 또는 snapshot_id가 필요합니다.' }, 400);
  } catch (err) {
    console.error('POST /api/preview/rollback error:', err);
    return json({ error: err.message || '복구를 시작하지 못했습니다.' }, 500);
  }
}

export function onRequestGet(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;
  return json({ error: 'Method not allowed' }, 405);
}
