import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { buildPreviewRelease, getPreviewChecklistIds } from '../../_shared/preview-release-data.js';
import { dispatchGithubWorkflow, json, previewOnly } from '../../_shared/preview-ops.js';

export async function onRequestPost(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;

  const token = extractToken(context.request);
  if (!token || !(await verifyTokenRole(token, context.env.ADMIN_SECRET, 'full'))) {
    return json({ error: '관리자 로그인 후 반영할 수 있습니다.' }, 401);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: '올바른 요청 형식이 아닙니다.' }, 400);
  }

  const changelog = await loadChangelog(context.request);
  const entry = changelog && Array.isArray(changelog.items) ? changelog.items[0] : null;
  const release = buildPreviewRelease(entry, {
    version: entry && entry.version,
    commit_sha: context.env.CF_PAGES_COMMIT_SHA || '',
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
