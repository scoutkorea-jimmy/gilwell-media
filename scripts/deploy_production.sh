#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "Production deploys must run from the main branch after preview approval."
  echo "Current branch: ${CURRENT_BRANCH:-detached}"
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  echo "Worktree is dirty. Commit or stash changes before production deploy."
  exit 1
fi

VERSION="$(cat VERSION)"
COMMIT_SHA="$(git rev-parse --short HEAD)"
COMMIT_MESSAGE="$(git log -1 --pretty=%s)"

echo "Deploying production for gilwell-media"
echo "Version: V${VERSION}"
echo "Commit: ${COMMIT_SHA}"

wrangler pages deploy . \
  --project-name gilwell-media \
  --branch main \
  --commit-hash "${COMMIT_SHA}" \
  --commit-message "${COMMIT_MESSAGE}"
