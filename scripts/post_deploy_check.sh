#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(cat VERSION)"
BASE_URL="${1:-https://bpmedia.net}"

echo "Checking ${BASE_URL} for V${VERSION}"

MAIN_JS="$(curl -fsSL "${BASE_URL}/js/main.js?v=${VERSION}")"
BOARD_PAGE="$(curl -fsSL "${BASE_URL}/worm.html")"
PEOPLE_PAGE="$(curl -fsSL "${BASE_URL}/people.html")"
ADMIN_PAGE="$(curl -fsSL "${BASE_URL}/admin.html")"
ROBOTS_TXT="$(curl -fsSL "${BASE_URL}/robots.txt")"
SITEMAP_XML="$(curl -fsSL "${BASE_URL}/sitemap.xml")"

echo "$MAIN_JS" | grep -F "GW.APP_VERSION = '${VERSION}'" >/dev/null
echo "$MAIN_JS" | grep -F "GW.EDITOR_LETTERS = ['A', 'B', 'C']" >/dev/null
echo "$BOARD_PAGE" | grep -F "WOSM" >/dev/null
echo "$PEOPLE_PAGE" | grep -F "스카우트 인물" >/dev/null
echo "$ADMIN_PAGE" | grep -F "site-meta-manager" >/dev/null
echo "$ADMIN_PAGE" | grep -F "analytics-cohort" >/dev/null
echo "$ROBOTS_TXT" | grep -F "Sitemap: ${BASE_URL}/sitemap.xml" >/dev/null
echo "$SITEMAP_XML" | grep -F "<loc>${BASE_URL}/</loc>" >/dev/null
curl -fsSL "${BASE_URL}/img/favicon.svg" >/dev/null

echo "Post-deploy checks passed."
