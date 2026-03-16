import {
  fetchPagesDeployments,
  fetchReleaseDeployments,
  fetchReleaseSnapshots,
  json,
  previewOnly,
} from '../../_shared/preview-ops.js';

export async function onRequestGet(context) {
  const blocked = previewOnly(context.request, context.env);
  if (blocked) return blocked;

  try {
    const [liveDeployments, manifestDeployments, snapshots] = await Promise.all([
      fetchPagesDeployments(context.env).catch(function () { return []; }),
      fetchReleaseDeployments(),
      fetchReleaseSnapshots(),
    ]);
    const deployments = liveDeployments.length ? liveDeployments : manifestDeployments;

    return json({
      deployments: deployments.map(normalizeDeployment).filter(Boolean),
      snapshots: snapshots,
    });
  } catch (err) {
    console.error('GET /api/preview/history error:', err);
    return json({ error: '히스토리를 불러오지 못했습니다.' }, 500);
  }
}

function normalizeDeployment(item) {
  if (!item || typeof item !== 'object') return null;
  if (!item.deployment_trigger) {
    return {
      id: item.id || '',
      environment: item.environment || '',
      branch: item.branch || '',
      source: item.source || '',
      url: item.url || '',
      created_on: item.created_on || '',
      latest_stage: item.latest_stage || '',
      is_current_production: !!item.is_current_production,
    };
  }
  return {
    id: item.id,
    environment: item.environment || '',
    branch: item.deployment_trigger && item.deployment_trigger.metadata
      ? item.deployment_trigger.metadata.branch
      : '',
    source: item.deployment_trigger && item.deployment_trigger.metadata
      ? item.deployment_trigger.metadata.commit_hash
      : '',
    url: item.url || '',
    created_on: item.created_on || '',
    latest_stage: item.latest_stage && item.latest_stage.name ? item.latest_stage.name : '',
    is_current_production: !!item.is_current_production,
  };
}
