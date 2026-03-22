#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-https://bpmedia.net}"
EXPECTED_APP_VERSION="$(sed -n "s/.*GW.APP_VERSION = '\\([^']*\\)'.*/\\1/p" js/main.js | head -n 1)"

echo "Checking ${BASE_URL} for V${EXPECTED_APP_VERSION}"

MAIN_JS="$(curl -fsSL "${BASE_URL}/js/main.js?v=${EXPECTED_APP_VERSION}")"
HOME_PAGE="$(curl -fsSL "${BASE_URL}/")"
BOARD_PAGE="$(curl -fsSL "${BASE_URL}/wosm")"
PEOPLE_PAGE="$(curl -fsSL "${BASE_URL}/people")"
ADMIN_PAGE="$(curl -fsSL "${BASE_URL}/admin.html")"
ROBOTS_TXT="$(curl -fsSL "${BASE_URL}/robots.txt")"
SITEMAP_XML="$(curl -fsSL "${BASE_URL}/sitemap.xml")"
RSS_XML="$(curl -fsSL "${BASE_URL}/rss.xml")"
BOARD_LAYOUT="$(curl -fsSL "${BASE_URL}/api/settings/board-layout")"
POSTS_JSON="$(curl -fsSL "${BASE_URL}/api/posts?page=1&limit=3")"
ADMIN_SESSION_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/session")"

POST_ID="$(
  curl -fsSL "${BASE_URL}/api/posts?page=1" \
  | tr -d '\n' \
  | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p' \
  | head -n 1
)"
if [[ -n "${POST_ID}" ]]; then
  POST_PAGE="$(curl -fsSL "${BASE_URL}/post/${POST_ID}")"
else
  POST_PAGE=""
fi

echo "$MAIN_JS" | grep -F "GW.APP_VERSION = '${EXPECTED_APP_VERSION}'" >/dev/null
echo "$MAIN_JS" | grep -F "GW.EDITOR_LETTERS = ['A', 'B', 'C']" >/dev/null
echo "$HOME_PAGE" | grep -F 'google-adsense-account' >/dev/null
echo "$HOME_PAGE" | grep -F 'application/ld+json' >/dev/null
echo "$HOME_PAGE" | grep -F 'home-lead-story' >/dev/null
echo "$HOME_PAGE" | grep -F 'latest-list' >/dev/null
echo "$HOME_PAGE" | grep -F '/rss.xml' >/dev/null
echo "$BOARD_PAGE" | grep -F "WOSM" >/dev/null
echo "$PEOPLE_PAGE" | grep -F "스카우트 인물" >/dev/null
echo "$ADMIN_PAGE" | grep -F 'id="v3-login-btn"' >/dev/null
echo "$ADMIN_PAGE" | grep -F 'data-panel="analytics"' >/dev/null
echo "$BOARD_LAYOUT" | grep -F '"gap_px":' >/dev/null
echo "$POSTS_JSON" | grep -F '"publish_at":' >/dev/null
echo "$ROBOTS_TXT" | grep -F "Sitemap: ${BASE_URL}/sitemap.xml" >/dev/null
echo "$SITEMAP_XML" | grep -F "<loc>${BASE_URL}/</loc>" >/dev/null
echo "$RSS_XML" | grep -F '<bpmedia:created>' >/dev/null
echo "$RSS_XML" | grep -F '<category domain="tag">' >/dev/null
test "$ADMIN_SESSION_STATUS" = "401"
if [[ -n "${POST_PAGE}" ]]; then
  echo "$POST_PAGE" | grep -F 'application/ld+json' >/dev/null
  echo "$POST_PAGE" | grep -F 'article:published_time' >/dev/null
fi
curl -fsSL "${BASE_URL}/img/favicon.svg" >/dev/null

echo "Post-deploy checks passed."
