import {
  buildPreviewRelease,
  findLatestDeploymentSource,
  findLatestProductionVersion,
  getPreviewChecklistIds,
} from '../../_shared/preview-release-data.js';
import {
  fetchProductionSiteVersion,
  fetchReleaseDeployments,
  json,
  previewOnly,
} from '../../_shared/preview-ops.js';

export async function onRequestGet(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;

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

  return json({
    preview: true,
    release: release,
    required_ids: getPreviewChecklistIds(release),
    has_history: true,
    has_rollback: true,
    can_promote: !!context.env.GITHUB_WORKFLOW_TOKEN && !!release.has_pending_changes,
  });
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
