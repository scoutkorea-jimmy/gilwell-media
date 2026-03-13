#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(cat VERSION)"
COMMIT_SHA="$(git rev-parse --short HEAD)"

echo "Deploying gilwell-media"
echo "Version: V${VERSION}"
echo "Commit: ${COMMIT_SHA}"

wrangler pages deploy . --project-name gilwell-media
