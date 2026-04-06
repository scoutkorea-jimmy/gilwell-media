#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

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
  korea.html
  apr.html
  wosm.html
  wosm-members.html
  people.html
  glossary.html
  contributors.html
  search.html
  calendar.html
  functions/post/'[id]'.js
  functions/feature/'[category]'/'[slug]'.js
  functions/glossary-raw.js
)

for file in "${SITE_FILES[@]}"; do
  perl -0pi -e "s/\\/css\\/style\\.css\\?v=[0-9A-Za-z.-]+/\\/css\\/style.css?v=${ASSET_VERSION}/g; s/\\/js\\/main\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/main.js?v=${ASSET_VERSION}/g; s/\\/js\\/post-page\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/post-page.js?v=${ASSET_VERSION}/g; s/\\/js\\/wosm-members\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/wosm-members.js?v=${ASSET_VERSION}/g" "$file"
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
  perl -0pi -e "s/\\/js\\/board\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/board.js?v=${ASSET_VERSION}/g; s/\\/js\\/glossary\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/glossary.js?v=${ASSET_VERSION}/g; s/\\/js\\/search\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/search.js?v=${ASSET_VERSION}/g; s/\\/js\\/calendar\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/calendar.js?v=${ASSET_VERSION}/g" "$file"
done

perl -0pi -e "s/\\/js\\/dreampath\\.js\\?v=[0-9A-Za-z.-]+/\\/js\\/dreampath.js?v=${ASSET_VERSION}/g" dreampath.html

perl -0pi -e "s/GW\\.APP_VERSION = '[0-9.]+'/GW.APP_VERSION = '${SITE_VERSION}'/g; s/GW\\.ADMIN_VERSION = '[0-9.]+'/GW.ADMIN_VERSION = '${ADMIN_VERSION}'/g; s/GW\\.ASSET_VERSION = '[^']+'/GW.ASSET_VERSION = '${ASSET_VERSION}'/g" js/main.js
perl -0pi -e "s/Version: [0-9.]+/Version: ${ADMIN_VERSION}/g" js/admin-v3.js

perl -0pi -e "s#/css/admin-v3\\.css\\?v=[0-9A-Za-z.-]+#/css/admin-v3.css?v=${ASSET_VERSION}#g; s#>Admin <span class=\"v3-ver-str v3-ver-admin\">[0-9.]+<#>Admin <span class=\"v3-ver-str v3-ver-admin\">${ADMIN_VERSION}<#g; s#v3-logo-version v3-ver-str v3-ver-admin\">[0-9.]+<#v3-logo-version v3-ver-str v3-ver-admin\">${ADMIN_VERSION}<#g; s#/js/main\\.js\\?v=[0-9A-Za-z.-]+#/js/main.js?v=${ASSET_VERSION}#g; s#/js/shared-country-name-ko\\.js\\?v=[0-9A-Za-z.-]+#/js/shared-country-name-ko.js?v=${ASSET_VERSION}#g; s#/js/admin-v3\\.js\\?v=[0-9A-Za-z.-]+#/js/admin-v3.js?v=${ASSET_VERSION}#g" admin.html
perl -0pi -e "s#/css/style\\.css\\?v=[0-9A-Za-z.-]+#/css/style.css?v=${ASSET_VERSION}#g; s#/css/admin\\.css\\?v=[0-9A-Za-z.-]+#/css/admin.css?v=${ASSET_VERSION}#g; s#/js/main\\.js\\?v=[0-9A-Za-z.-]+#/js/main.js?v=${ASSET_VERSION}#g; s#/js/kms\\.js\\?v=[0-9A-Za-z.-]+#/js/kms.js?v=${ASSET_VERSION}#g; s/Admin v[0-9.]+/Admin v${ADMIN_VERSION}/g" kms.html

echo "Synced site ${SITE_VERSION} / admin ${ADMIN_VERSION} / assets ${ASSET_VERSION}."
