const GITHUB_OWNER = 'scoutkorea-jimmy';
const GITHUB_REPO = 'gilwell-media';
const RELEASE_HISTORY_RAW_URL =
  'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/release-history/data/release-snapshots.json';

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
