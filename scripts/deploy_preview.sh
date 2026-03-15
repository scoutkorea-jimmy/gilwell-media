#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(cat VERSION)"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
COMMIT_MESSAGE="$(git log -1 --pretty=%s 2>/dev/null || echo "Preview deploy")"

echo "Deploying preview for gilwell-media"
echo "Version: V${VERSION}"
echo "Source branch: ${CURRENT_BRANCH:-detached}"
echo "Attached commit: ${COMMIT_SHA}"

wrangler pages deploy . \
  --project-name gilwell-media \
  --branch preview \
  --commit-hash "${COMMIT_SHA}" \
  --commit-message "[preview] ${COMMIT_MESSAGE}" \
  --commit-dirty true
