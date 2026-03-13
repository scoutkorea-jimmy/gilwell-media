#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(cat VERSION)"
BASE_URL="${1:-https://bpmedia.net}"

echo "Checking ${BASE_URL} for V${VERSION}"

MAIN_JS="$(curl -fsSL "${BASE_URL}/js/main.js?v=${VERSION}")"
POST_PAGE="$(curl -fsSL "${BASE_URL}/worm.html")"

echo "$MAIN_JS" | grep -F "GW.APP_VERSION = '${VERSION}'" >/dev/null
echo "$MAIN_JS" | grep -F "GW.EDITOR_LETTERS = ['A', 'B', 'C']" >/dev/null
echo "$POST_PAGE" | grep -F "WOSM" >/dev/null

echo "Post-deploy checks passed."
