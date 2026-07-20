#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

node "$ROOT_DIR/scripts/sync_public_fallbacks.mjs"

SITE_VERSION="$(tr -d '\n' < VERSION)"
ADMIN_VERSION="$(tr -d '\n' < ADMIN_VERSION)"
BUILD_STAMP="${ASSET_BUST_STAMP:-$(date -u +%Y%m%d%H%M%S)}"
ASSET_VERSION="${BUILD_STAMP}"

printf '%s\n' "$ASSET_VERSION" > ASSET_VERSION

if [[ -z "$SITE_VERSION" || -z "$ADMIN_VERSION" ]]; then
  echo "VERSION or ADMIN_VERSION is missing."
  exit 1
fi

SITE_FILES=(
  index.html
  latest.html
  jamboree16.html
  korea.html
  apr.html
  wosm.html
  wosm-members.html
  people.html
  glossary.html
  contributors.html
  about.html
  search.html
  calendar.html
  memorabilia.html
  functions/post/'[id]'.js
  functions/feature/'[category]'/'[slug]'.js
  functions/glossary-raw.js
)

for file in "${SITE_FILES[@]}"; do
  perl -0pi -e "s/\\/css\\/style\\.css\\?v=[0-9A-Za-z.-]+/\\/css\\/style.css?v=${ASSET_VERSION}/g; s/\\/css\\/chatbot\\.css\\?v=[0-9A-Za-z.-]+/\\/css\\/chatbot.css?v=${ASSET_VERSION}/g; s/\\/js\\/chatbot\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/chatbot.js?v=${ASSET_VERSION}/g; s/\\/js\\/main\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/main.js?v=${ASSET_VERSION}/g; s/\\/js\\/site-chrome\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/site-chrome.js?v=${ASSET_VERSION}/g; s/\\/js\\/home-helpers\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/home-helpers.js?v=${ASSET_VERSION}/g; s/\\/js\\/home-render\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/home-render.js?v=${ASSET_VERSION}/g; s/\\/js\\/home-hero\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/home-hero.js?v=${ASSET_VERSION}/g; s/\\/js\\/home-runtime\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/home-runtime.js?v=${ASSET_VERSION}/g; s/\\/js\\/home\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/home.js?v=${ASSET_VERSION}/g; s/\\/js\\/post-page\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/post-page.js?v=${ASSET_VERSION}/g; s/\\/js\\/wosm-members\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/wosm-members.js?v=${ASSET_VERSION}/g; s#(<span class=\"site-build-version\">)[^<]*(</span>)#\${1}V${SITE_VERSION}\${2}#g; s#(<span class=\"admin-build-version\">)[^<]*(</span>)#\${1}V${ADMIN_VERSION}\${2}#g" "$file"
done

# jamboree16.html — 제16회 한국잼버리 특별관 전용 런타임
perl -0pi -e "s#/js/jamboree16\\.js\\?v=[0-9A-Za-z.-]+#/js/jamboree16.js?v=${ASSET_VERSION}#g" jamboree16.html

# 페이지 전용 CSS (scripts/split_css.mjs 로 style.css 에서 분리한 것들).
# 해당 시트를 링크하는 모든 표면에서 ?v= 를 함께 갱신한다.
PAGE_CSS_FILES=(
  latest.html korea.html apr.html wosm.html people.html
  calendar.html wosm-members.html glossary.html jamboree16.html
  functions/post/'[id]'.js functions/feature/'[category]'/'[slug]'.js functions/glossary-raw.js
)
for file in "${PAGE_CSS_FILES[@]}"; do
  perl -0pi -e "s#/css/board\\.css\\?v=[0-9A-Za-z.-]+#/css/board.css?v=${ASSET_VERSION}#g; s#/css/calendar\\.css\\?v=[0-9A-Za-z.-]+#/css/calendar.css?v=${ASSET_VERSION}#g; s#/css/post\\.css\\?v=[0-9A-Za-z.-]+#/css/post.css?v=${ASSET_VERSION}#g; s#/css/wosm-members\\.css\\?v=[0-9A-Za-z.-]+#/css/wosm-members.css?v=${ASSET_VERSION}#g; s#/css/glossary\\.css\\?v=[0-9A-Za-z.-]+#/css/glossary.css?v=${ASSET_VERSION}#g; s#/css/jamboree16\\.css\\?v=[0-9A-Za-z.-]+#/css/jamboree16.css?v=${ASSET_VERSION}#g" "$file"
done

PUBLIC_HTML_FILES=(
  latest.html
  korea.html
  apr.html
  wosm.html
  people.html
  glossary.html
  search.html
  calendar.html
)

for file in "${PUBLIC_HTML_FILES[@]}"; do
  perl -0pi -e "s/\\/js\\/board\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/board.js?v=${ASSET_VERSION}/g; s/\\/js\\/board-write\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/board-write.js?v=${ASSET_VERSION}/g; s/\\/js\\/glossary\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/glossary.js?v=${ASSET_VERSION}/g; s/\\/js\\/search\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/search.js?v=${ASSET_VERSION}/g; s/\\/js\\/calendar\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/calendar.js?v=${ASSET_VERSION}/g" "$file"
done

# memorabilia.html — its own js/css + shared module (memorabilia-shared.js)
perl -0pi -e "s#/css/memorabilia\\.css\\?v=[0-9A-Za-z.-]+#/css/memorabilia.css?v=${ASSET_VERSION}#g; s#/js/memorabilia\\.js\\?v=[0-9A-Za-z.-]+#/js/memorabilia.js?v=${ASSET_VERSION}#g; s#/js/memorabilia-shared\\.js\\?v=[0-9A-Za-z.-]+#/js/memorabilia-shared.js?v=${ASSET_VERSION}#g" memorabilia.html

# admin.html — admin-memorabilia.js + memorabilia 공유 자산 (admin.html 도 같은 css/shared module 사용)
perl -0pi -e "s#/js/admin-memorabilia\\.js\\?v=[0-9A-Za-z.-]+#/js/admin-memorabilia.js?v=${ASSET_VERSION}#g; s#/js/admin-memorabilia-comments\\.js\\?v=[0-9A-Za-z.-]+#/js/admin-memorabilia-comments.js?v=${ASSET_VERSION}#g; s#/js/memorabilia-shared\\.js\\?v=[0-9A-Za-z.-]+#/js/memorabilia-shared.js?v=${ASSET_VERSION}#g; s#/css/memorabilia\\.css\\?v=[0-9A-Za-z.-]+#/css/memorabilia.css?v=${ASSET_VERSION}#g" admin.html

perl -0pi -e "s/\\/js\\/dreampath\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/dreampath.js?v=${ASSET_VERSION}/g" dreampath.html
perl -0pi -e "s#templates\\.css\\?v=[0-9A-Za-z.-]+#templates.css?v=${ASSET_VERSION}#g; s#dp-assets\\.js\\?v=[0-9A-Za-z.-]+#dp-assets.js?v=${ASSET_VERSION}#g; s#templates-export\\.js\\?v=[0-9A-Za-z.-]+#templates-export.js?v=${ASSET_VERSION}#g; s#templates-app\\.js\\?v=[0-9A-Za-z.-]+#templates-app.js?v=${ASSET_VERSION}#g" "dist-homepage/DreamPath - Document Templates.html"

perl -0pi -e "s/GW\\.APP_VERSION = '[0-9.]+'/GW.APP_VERSION = '${SITE_VERSION}'/g; s/GW\\.ADMIN_VERSION = '[0-9.]+'/GW.ADMIN_VERSION = '${ADMIN_VERSION}'/g; s/GW\\.ASSET_VERSION = '[^']+'/GW.ASSET_VERSION = '${ASSET_VERSION}'/g" js/main.js
perl -0pi -e "s/Version: [0-9.]+/Version: ${ADMIN_VERSION}/g" js/admin-v3.js

# build-version.js — read by functions/api/version.js to power the client-side
# "new build" banner with the latest deployed numbers.
perl -0pi -e "s/export const SITE_VERSION = '[^']+'/export const SITE_VERSION = '${SITE_VERSION}'/; s/export const ADMIN_VERSION = '[^']+'/export const ADMIN_VERSION = '${ADMIN_VERSION}'/; s/export const ASSET_VERSION = '[^']+'/export const ASSET_VERSION = '${ASSET_VERSION}'/" functions/_shared/build-version.js

perl -0pi -e "s#/css/admin-v3\\.css\\?v=[0-9A-Za-z.-]+#/css/admin-v3.css?v=${ASSET_VERSION}#g; s#(<span class=\"v3-ver-str v3-ver-admin admin-build-version\">)[^<]*(</span>)#\${1}V${ADMIN_VERSION}\${2}#g; s#(<span class=\"v3-logo-version v3-ver-str v3-ver-admin admin-build-version\">)[^<]*(</span>)#\${1}V${ADMIN_VERSION}\${2}#g; s#(<span class=\"v3-ver-str v3-ver-site site-build-version\">)[^<]*(</span>)#\${1}V${SITE_VERSION}\${2}#g; s#(<span class=\"v3-ver-site site-build-version\">)[^<]*(</span>)#\${1}V${SITE_VERSION}\${2}#g; s#/js/main\\.js\\?v=[0-9A-Za-z.-]+#/js/main.js?v=${ASSET_VERSION}#g; s#/js/shared-country-name-ko\\.js\\?v=[0-9A-Za-z.-]+#/js/shared-country-name-ko.js?v=${ASSET_VERSION}#g; s#/js/admin-v3\\.js\\?v=[0-9A-Za-z.-]+#/js/admin-v3.js?v=${ASSET_VERSION}#g; s#/js/admin-account\\.js\\?v=[0-9A-Za-z.-]+#/js/admin-account.js?v=${ASSET_VERSION}#g; s#/js/admin-cardnews\\.js\\?v=[0-9A-Za-z.-]+#/js/admin-cardnews.js?v=${ASSET_VERSION}#g" admin.html
perl -0pi -e "s#/css/style\\.css\\?v=[0-9A-Za-z.-]+#/css/style.css?v=${ASSET_VERSION}#g; s#/css/admin\\.css\\?v=[0-9A-Za-z.-]+#/css/admin.css?v=${ASSET_VERSION}#g; s#/css/chatbot\\.css\\?v=[0-9A-Za-z.-]+#/css/chatbot.css?v=${ASSET_VERSION}#g; s#/js/main\\.js\\?v=[0-9A-Za-z.-]+#/js/main.js?v=${ASSET_VERSION}#g; s#/js/kms\\.js\\?v=[0-9A-Za-z.-]+#/js/kms.js?v=${ASSET_VERSION}#g; s#/js/chatbot\\.js\\?v=[0-9A-Za-z.-]+#/js/chatbot.js?v=${ASSET_VERSION}#g; s/Admin v[0-9.]+/Admin v${ADMIN_VERSION}/g" kms.html

# Chatbot widget — pages outside SITE_FILES (404, editorial-policy, privacy)
CHATBOT_EXTRA=(404.html editorial-policy.html privacy.html)
for file in "${CHATBOT_EXTRA[@]}"; do
  perl -0pi -e "s#/css/chatbot\\.css\\?v=[0-9A-Za-z.-]+#/css/chatbot.css?v=${ASSET_VERSION}#g; s#/js/chatbot\\.js\\?v=[0-9A-Za-z.-]+#/js/chatbot.js?v=${ASSET_VERSION}#g" "$file"
done

echo "Synced site ${SITE_VERSION} / admin ${ADMIN_VERSION} / assets ${ASSET_VERSION}."
