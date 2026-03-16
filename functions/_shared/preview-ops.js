const GITHUB_OWNER = 'scoutkorea-jimmy';
const GITHUB_REPO = 'gilwell-media';
const GITHUB_API = 'https://api.github.com';
const CF_API = 'https://api.cloudflare.com/client/v4';
const RELEASE_HISTORY_RAW_URL =
  'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/release-history/data/release-snapshots.json';

export { GITHUB_OWNER, GITHUB_REPO, RELEASE_HISTORY_RAW_URL };

export function isPreviewRuntime(request, env) {
  var branch = String(env && env.CF_PAGES_BRANCH || '').trim().toLowerCase();
  if (branch === 'preview') return true;
  try {
    var host = new URL(request.url).hostname.toLowerCase();
    return host === 'preview.gilwell-media.pages.dev';
  } catch (_) {
    return false;
  }
}

export function previewOnly(request, env) {
  if (!isPreviewRuntime(request, env)) {
    return json({ error: 'Preview 환경에서만 사용할 수 있습니다.' }, 404);
  }
  return null;
}

export async function dispatchGithubWorkflow(env, workflowFile, ref, inputs) {
  if (!env.GITHUB_WORKFLOW_TOKEN) {
    throw new Error('GITHUB_WORKFLOW_TOKEN secret is missing');
  }
  const response = await fetch(
    GITHUB_API + '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/actions/workflows/' + workflowFile + '/dispatches',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.GITHUB_WORKFLOW_TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'gilwell-media-preview-control',
      },
      body: JSON.stringify({
        ref: ref,
        inputs: inputs || {},
      }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error('GitHub workflow dispatch failed: ' + text);
  }
  return true;
}

export async function fetchGithubBranchHead(env, branch) {
  if (!env.GITHUB_WORKFLOW_TOKEN) {
    throw new Error('GITHUB_WORKFLOW_TOKEN secret is missing');
  }
  const response = await fetch(
    GITHUB_API + '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/git/ref/heads/' + encodeURIComponent(branch),
    {
      headers: {
        'Authorization': 'Bearer ' + env.GITHUB_WORKFLOW_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'gilwell-media-preview-control',
      },
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error('GitHub branch head fetch failed: ' + text);
  }
  const data = await response.json();
  return String(data && data.object && data.object.sha || '').trim();
}

export async function verifyPromotionReadiness(env, release) {
  const reasons = [];
  if (!env.GITHUB_WORKFLOW_TOKEN) reasons.push('GitHub workflow token이 없습니다.');
  if (!env.CLOUDFLARE_API_TOKEN) reasons.push('Cloudflare API token이 없습니다.');
  if (!env.CLOUDFLARE_ACCOUNT_ID) reasons.push('Cloudflare account id가 없습니다.');
  if (!release || !release.has_pending_changes) reasons.push('production에 반영할 새 변경이 없습니다.');
  if (!release || !release.commit_sha) reasons.push('preview 커밋 SHA를 확인하지 못했습니다.');

  let branchHeads = null;
  if (!reasons.length) {
    try {
      const [mainSha, previewSha] = await Promise.all([
        fetchGithubBranchHead(env, 'main'),
        fetchGithubBranchHead(env, 'preview'),
      ]);
      branchHeads = { main: mainSha, preview: previewSha };
      if (!previewSha) {
        reasons.push('GitHub preview 브랜치 SHA를 확인하지 못했습니다.');
      } else if (release.commit_sha && previewSha !== release.commit_sha) {
        reasons.push('preview 배포 SHA와 GitHub preview 브랜치 SHA가 다릅니다.');
      }
    } catch (error) {
      reasons.push(error.message || 'GitHub 브랜치 상태를 확인하지 못했습니다.');
    }

    try {
      await fetchPagesDeployments(env);
    } catch (error) {
      reasons.push(error.message || 'Cloudflare Pages 프로젝트 상태를 확인하지 못했습니다.');
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    branch_heads: branchHeads,
  };
}

export async function fetchPagesDeployments(env) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return [];
  const response = await fetch(
    CF_API + '/accounts/' + env.CLOUDFLARE_ACCOUNT_ID + '/pages/projects/gilwell-media/deployments',
    {
      headers: {
        'Authorization': 'Bearer ' + env.CLOUDFLARE_API_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error('Cloudflare deployment list failed: ' + text);
  }
  const data = await response.json();
  return Array.isArray(data.result) ? data.result.slice(0, 20) : [];
}

export async function rollbackPagesDeployment(env, deploymentId) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID secret is missing');
  }
  const response = await fetch(
    CF_API + '/accounts/' + env.CLOUDFLARE_ACCOUNT_ID + '/pages/projects/gilwell-media/deployments/' + deploymentId + '/rollback',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.CLOUDFLARE_API_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error('Cloudflare rollback failed: ' + text);
  }
  return response.json();
}

export async function fetchReleaseSnapshots() {
  try {
    const response = await fetch(RELEASE_HISTORY_RAW_URL, { cf: { cacheTtl: 60 } });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.items) ? data.items.slice(0, 20) : [];
  } catch (_) {
    return [];
  }
}

export async function fetchReleaseDeployments() {
  try {
    const response = await fetch(RELEASE_HISTORY_RAW_URL, { cf: { cacheTtl: 60 } });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.deployments) ? data.deployments.slice(0, 20) : [];
  } catch (_) {
    return [];
  }
}

export async function fetchProductionSiteVersion() {
  try {
    const response = await fetch('https://bpmedia.net/js/main.js', {
      headers: { 'Cache-Control': 'no-store' },
      cf: { cacheTtl: 0 },
    });
    if (!response.ok) return '';
    const text = await response.text();
    const match = text.match(/APP_VERSION = '([0-9.]+)'/);
    return match && match[1] ? String(match[1]).trim() : '';
  } catch (_) {
    return '';
  }
}

export function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
