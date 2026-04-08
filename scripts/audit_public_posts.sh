#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-https://bpmedia.net}"

echo "Auditing published post pages at ${BASE_URL}"

BASE_URL="$BASE_URL" node - <<'NODE'
const { execSync } = require('child_process');

const baseUrl = process.env.BASE_URL || 'https://bpmedia.net';
const raw = execSync(
  'wrangler d1 execute gilwell-posts --remote --command "SELECT id FROM posts WHERE published = 1 ORDER BY id DESC;" --json',
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
);
const payload = JSON.parse(raw);
const ids = (payload[0]?.results || []).map((row) => row.id);

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, text };
}

(async () => {
  const issues = [];
  for (const id of ids) {
    const canonicalUrl = `${baseUrl}/post/${id}`;
    const shareUrl = `${canonicalUrl}?share_ref=audit-${Date.now()}-${id}`;
    const canonical = await fetchHtml(canonicalUrl);
    if (canonical.status !== 200 || /<title>\s*오류 안내/.test(canonical.text)) {
      issues.push({ id, kind: 'canonical', status: canonical.status });
      continue;
    }
    const shared = await fetchHtml(shareUrl);
    if (
      shared.status !== 200 ||
      /<title>\s*오류 안내/.test(shared.text) ||
      !shared.text.includes(`property="og:url"         content="${shareUrl}"`)
    ) {
      issues.push({ id, kind: 'share', status: shared.status });
    }
  }
  console.log(JSON.stringify({
    published_count: ids.length,
    issue_count: issues.length,
    issues
  }, null, 2));
  if (issues.length) process.exit(1);
})();
NODE
