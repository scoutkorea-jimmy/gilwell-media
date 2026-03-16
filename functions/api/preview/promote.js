import { extractToken, safeCompare, verifyTokenRole } from '../../_shared/auth.js';
import {
  buildPreviewRelease,
  findLatestDeploymentSource,
  findLatestProductionVersion,
  getPreviewChecklistIds,
} from '../../_shared/preview-release-data.js';
import {
  dispatchGithubWorkflow,
  fetchProductionSiteVersion,
  fetchReleaseDeployments,
  json,
  previewOnly,
  verifyPromotionReadiness,
} from '../../_shared/preview-ops.js';

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
    return json({ error: '최종 반영 전에 full 관리자 비밀번호를 다시 확인해주세요.' }, 401);
  }

  const token = extractToken(context.request);
  if (token && !(await verifyTokenRole(token, context.env.ADMIN_SECRET, 'full'))) {
    return json({ error: '현재 관리자 세션에 본 페이지 반영 권한이 없습니다.' }, 401);
  }

  const changelog = await loadChangelog(context.request);
  const items = changelog && Array.isArray(changelog.items) ? changelog.items : [];
  const [deployments, productionVersion] = await Promise.all([
    fetchReleaseDeployments().catch(function () { return []; }),
    fetchProductionSiteVersion().catch(function () { return ''; }),
  ]);
  const release = buildPreviewRelease(items, {
    version: items[0] && items[0].version,
    live_version: findLatestProductionVersion(deployments) || productionVersion,
    commit_sha: context.env.CF_PAGES_COMMIT_SHA || findLatestDeploymentSource(deployments, 'preview', 'preview') || '',
    branch: context.env.CF_PAGES_BRANCH || 'preview',
  });

  const checkedIds = Array.isArray(body.checked_ids) ? body.checked_ids.map(String) : [];
  const requiredIds = getPreviewChecklistIds(release);
  const missingIds = requiredIds.filter(function (id) {
    return checkedIds.indexOf(id) === -1;
  });
  if (missingIds.length) {
    return json({
      error: '체크리스트를 모두 완료한 뒤 반영할 수 있습니다.',
      missing_ids: missingIds,
    }, 400);
  }

  const readiness = await verifyPromotionReadiness(context.env, release);
  if (!readiness.ok) {
    return json({
      error: 'preview 반영 준비 상태가 완전하지 않습니다.',
      reasons: readiness.reasons,
      branch_heads: readiness.branch_heads,
    }, 409);
  }

  try {
    await dispatchGithubWorkflow(context.env, 'promote-preview.yml', 'preview', {
      version: release.version,
      approved_at: new Date().toISOString(),
      checklist_ids: checkedIds.join(','),
      preview_sha: release.commit_sha,
    });
    return json({
      success: true,
      queued: true,
      message: '본 페이지 반영 워크플로우를 시작했습니다.',
      actions_url: release.actions_url,
    });
  } catch (err) {
    console.error('POST /api/preview/promote error:', err);
    return json({ error: err.message || '반영 워크플로우를 시작하지 못했습니다.' }, 500);
  }
}

export function onRequestGet(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;
  return json({ error: 'Method not allowed' }, 405);
}

async function loadChangelog(request) {
  try {
    const origin = new URL(request.url).origin;
    const response = await fetch(origin + '/data/changelog.json', {
      headers: { 'Cache-Control': 'no-store' },
      cf: { cacheTtl: 0 },
    });
    if (!response.ok) return null;
    return response.json();
  } catch (_) {
    return null;
  }
}
