import { buildPreviewRelease, getPreviewChecklistIds } from '../../_shared/preview-release-data.js';
import { json, previewOnly } from '../../_shared/preview-ops.js';

export async function onRequestGet(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;

  const changelog = await loadChangelog(context.request);
  const entry = changelog && Array.isArray(changelog.items) ? changelog.items[0] : null;
  const release = buildPreviewRelease(entry, {
    version: entry && entry.version,
    commit_sha: context.env.CF_PAGES_COMMIT_SHA || '',
    branch: context.env.CF_PAGES_BRANCH || 'preview',
  });

  return json({
    preview: true,
    release: release,
    required_ids: getPreviewChecklistIds(release),
    has_history: true,
    has_rollback: true,
    can_promote: !!context.env.GITHUB_WORKFLOW_TOKEN,
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
