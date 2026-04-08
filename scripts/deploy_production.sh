#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/verify_release_metadata.sh"
"$ROOT_DIR/scripts/verify_release_metadata.sh"

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "Production deploys must run from the main branch."
  echo "Current branch: ${CURRENT_BRANCH:-detached}"
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  echo "Worktree is dirty. Commit or stash changes before production deploy."
  exit 1
fi

VERSION="$(cat VERSION)"
ASSET_VERSION="$(cat ASSET_VERSION)"
COMMIT_SHA="$(git rev-parse --short HEAD)"
COMMIT_MESSAGE="$(git log -1 --pretty=%s)"

echo "Deploying production for gilwell-media"
echo "Version: V${VERSION}"
echo "Assets: ${ASSET_VERSION}"
echo "Commit: ${COMMIT_SHA}"

wrangler pages deploy . \
  --project-name gilwell-media \
  --branch main \
  --commit-hash "${COMMIT_SHA}" \
  --commit-message "${COMMIT_MESSAGE}"

if [[ -f "$ROOT_DIR/wrangler.publish-due.toml" ]]; then
  wrangler deploy --config "$ROOT_DIR/wrangler.publish-due.toml"
fi

if [[ -x "$ROOT_DIR/scripts/post_deploy_check.sh" || -f "$ROOT_DIR/scripts/post_deploy_check.sh" ]]; then
  chmod +x "$ROOT_DIR/scripts/post_deploy_check.sh"
  "$ROOT_DIR/scripts/post_deploy_check.sh" "https://bpmedia.net"
fi

if [[ -x "$ROOT_DIR/scripts/audit_public_posts.sh" || -f "$ROOT_DIR/scripts/audit_public_posts.sh" ]]; then
  chmod +x "$ROOT_DIR/scripts/audit_public_posts.sh"
  "$ROOT_DIR/scripts/audit_public_posts.sh" "https://bpmedia.net"
fi

if [[ -x "$ROOT_DIR/scripts/store_release_snapshot.sh" || -f "$ROOT_DIR/scripts/store_release_snapshot.sh" ]]; then
  chmod +x "$ROOT_DIR/scripts/store_release_snapshot.sh"
  GITHUB_REF_NAME=main "$ROOT_DIR/scripts/store_release_snapshot.sh" production "https://bpmedia.net"
fi
