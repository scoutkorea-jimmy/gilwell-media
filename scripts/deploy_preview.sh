#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(cat VERSION)"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
COMMIT_MESSAGE="$(git log -1 --pretty=%s 2>/dev/null || echo "Preview deploy")"

if [[ -n "$(git status --short)" ]]; then
  echo "Worktree is dirty. Commit changes before preview deploy."
  exit 1
fi

echo "Deploying preview for gilwell-media"
echo "Version: V${VERSION}"
echo "Source branch: ${CURRENT_BRANCH:-detached}"
echo "Attached commit: ${COMMIT_SHA}"

echo "Syncing current HEAD to origin/preview"
git fetch origin preview >/dev/null 2>&1 || true
git push origin HEAD:preview --force-with-lease

wrangler pages deploy . \
  --project-name gilwell-media \
  --branch preview \
  --commit-hash "${COMMIT_SHA}" \
  --commit-message "[preview] ${COMMIT_MESSAGE}" \
  --commit-dirty true

if [[ -x "$ROOT_DIR/scripts/store_release_snapshot.sh" || -f "$ROOT_DIR/scripts/store_release_snapshot.sh" ]]; then
  chmod +x "$ROOT_DIR/scripts/store_release_snapshot.sh"
  GITHUB_REF_NAME=preview "$ROOT_DIR/scripts/store_release_snapshot.sh" preview "https://preview.gilwell-media.pages.dev"
fi
