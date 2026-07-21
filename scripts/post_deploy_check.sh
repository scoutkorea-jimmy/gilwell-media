#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-https://bpmedia.net}"
EXPECTED_APP_VERSION="$(sed -n "s/.*GW.APP_VERSION = '\\([^']*\\)'.*/\\1/p" public/js/main.js | head -n 1)"
EXPECTED_ASSET_VERSION="$(cat public/ASSET_VERSION)"

echo "Checking ${BASE_URL} for V${EXPECTED_APP_VERSION}"

# [2026-07-21] 전파 대기 — 이 지연이 없으면 아래 검증 요청 자체가 캐시를 오염시킨다.
#
# `_headers` 가 자산에 `public, max-age=31536000, immutable` 을 준다. 배포 직후
# 전파가 끝나기 전에 새 `?v=<ASSET_VERSION>` URL 을 조회하면, 그 엣지가 새 URL
# 아래 **이전 파일**을 캐시해 버리고 immutable 이라 1년간 만료되지 않는다.
# 그러면 방문자는 HTML 과 main.js 버전이 어긋나 "새 버전 있음" 배너를 보게 되고,
# 새로고침해도 같은 캐시를 받아 배너가 사라지지 않는다.
POST_DEPLOY_WAIT="${POST_DEPLOY_WAIT:-45}"
if [[ "${POST_DEPLOY_WAIT}" -gt 0 ]]; then
  echo "Waiting ${POST_DEPLOY_WAIT}s for edge propagation before verifying..."
  sleep "${POST_DEPLOY_WAIT}"
fi

# 캐시를 건드리지 않고 원본을 확인한다. 실제 사용자 URL(`?v=...`)을 그대로 조회하면
# 위 오염이 재발하므로, 검증 전용 논스를 덧붙이고 no-cache 를 요청한다.
NONCE="verify$(date +%s)$$"
CURL_NC=(curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache')

MAIN_JS="$("${CURL_NC[@]}" "${BASE_URL}/js/main.js?v=${EXPECTED_ASSET_VERSION}&_=${NONCE}")"
HOME_PAGE="$(curl -fsSL "${BASE_URL}/")"
SEARCH_PAGE="$(curl -fsSL "${BASE_URL}/search?q=test")"
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
echo "$MAIN_JS" | grep -F "GW.EDITOR_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']" >/dev/null
echo "$MAIN_JS" | grep -F "GW.EDITOR_REQUIRED_LETTERS = ['A', 'B', 'C']" >/dev/null
echo "$HOME_PAGE" | grep -F '<html lang="ko">' >/dev/null
echo "$HOME_PAGE" | grep -F 'google-adsense-account' >/dev/null
echo "$HOME_PAGE" | grep -F 'meta name="description"' >/dev/null
echo "$HOME_PAGE" | grep -F 'property="og:title"' >/dev/null
echo "$HOME_PAGE" | grep -F 'property="og:image"' >/dev/null
echo "$HOME_PAGE" | grep -F 'property="og:image:alt"' >/dev/null
echo "$HOME_PAGE" | grep -F 'name="twitter:card"' >/dev/null
echo "$HOME_PAGE" | grep -F 'name="twitter:image:alt"' >/dev/null
echo "$HOME_PAGE" | grep -F "<link rel=\"canonical\" href=\"${BASE_URL}/\"" >/dev/null
echo "$HOME_PAGE" | grep -F 'application/ld+json' >/dev/null
echo "$HOME_PAGE" | grep -F 'home-lead-story' >/dev/null
echo "$HOME_PAGE" | grep -F 'latest-list' >/dev/null
echo "$HOME_PAGE" | grep -F '/rss.xml' >/dev/null
echo "$SEARCH_PAGE" | grep -F '<html lang="ko">' >/dev/null
echo "$SEARCH_PAGE" | grep -F 'meta name="description"' >/dev/null
echo "$SEARCH_PAGE" | grep -F 'property="og:title"' >/dev/null
echo "$SEARCH_PAGE" | grep -F '<meta name="robots" content="noindex,follow"/>' >/dev/null
echo "$BOARD_PAGE" | grep -F "WOSM" >/dev/null
echo "$PEOPLE_PAGE" | grep -F "스카우트 인물" >/dev/null
echo "$ADMIN_PAGE" | grep -F 'id="v3-login-btn"' >/dev/null
echo "$ADMIN_PAGE" | grep -F 'data-panel="analytics-visits"' >/dev/null
echo "$ADMIN_PAGE" | grep -F 'data-panel="analytics-tags"' >/dev/null
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
