#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SITE_VERSION="$(tr -d '\n' < VERSION)"
ADMIN_VERSION="$(tr -d '\n' < ADMIN_VERSION)"

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
  perl -0pi -e "s/\\/css\\/style\\.css\\?v=[0-9.]+/\\/css\\/style.css?v=${SITE_VERSION}/g; s/\\/js\\/main\\.js\\?v=[0-9.]+/\\/js\\/main.js?v=${SITE_VERSION}/g; s/\\/js\\/post-page\\.js\\?v=[0-9.]+/\\/js\\/post-page.js?v=${SITE_VERSION}/g" "$file"
done

perl -0pi -e "s/GW\\.APP_VERSION = '[0-9.]+'/GW.APP_VERSION = '${SITE_VERSION}'/g; s/GW\\.ADMIN_VERSION = '[0-9.]+'/GW.ADMIN_VERSION = '${ADMIN_VERSION}'/g" js/main.js
perl -0pi -e "s/Version: [0-9.]+/Version: ${ADMIN_VERSION}/g" js/admin-v3.js

perl -0pi -e "s#/css/admin-v3\\.css\\?v=[0-9.]+#/css/admin-v3.css?v=${ADMIN_VERSION}#g; s#>Admin <span class=\"v3-ver-str v3-ver-admin\">[0-9.]+<#>Admin <span class=\"v3-ver-str v3-ver-admin\">${ADMIN_VERSION}<#g; s#v3-logo-version v3-ver-str v3-ver-admin\">[0-9.]+<#v3-logo-version v3-ver-str v3-ver-admin\">${ADMIN_VERSION}<#g; s#/js/main\\.js\\?v=[0-9.]+#/js/main.js?v=${ADMIN_VERSION}#g; s#/js/admin-v3\\.js\\?v=[0-9.]+#/js/admin-v3.js?v=${ADMIN_VERSION}#g" admin.html
perl -0pi -e "s#/css/style\\.css\\?v=[0-9.]+#/css/style.css?v=${SITE_VERSION}#g; s#/css/admin\\.css\\?v=[0-9.]+#/css/admin.css?v=${ADMIN_VERSION}#g; s#/js/main\\.js\\?v=[0-9.]+#/js/main.js?v=${ADMIN_VERSION}#g; s#/js/kms\\.js\\?v=[0-9.]+#/js/kms.js?v=${ADMIN_VERSION}#g; s/Admin v[0-9.]+/Admin v${ADMIN_VERSION}/g" kms.html

echo "Synced site ${SITE_VERSION} / admin ${ADMIN_VERSION}."
