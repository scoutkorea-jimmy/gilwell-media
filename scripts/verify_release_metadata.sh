#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SITE_VERSION="$(cat VERSION)"
ADMIN_VERSION_FILE="$(cat ADMIN_VERSION)"
ASSET_VERSION_FILE="$(cat ASSET_VERSION)"
MAIN_SITE_VERSION="$(sed -n "s/.*GW.APP_VERSION = '\\([^']*\\)'.*/\\1/p" js/main.js | head -n 1)"
ADMIN_VERSION="$(sed -n "s/.*GW.ADMIN_VERSION = '\\([^']*\\)'.*/\\1/p" js/main.js | head -n 1)"
MAIN_ASSET_VERSION="$(sed -n "s/.*GW.ASSET_VERSION = '\\([^']*\\)'.*/\\1/p" js/main.js | head -n 1)"
ADMIN_HTML_VERSION="$(sed -n "s/.*v3-ver-admin\">\\([^<]*\\)<.*/\\1/p" admin.html | head -n 1)"
KMS_ADMIN_VERSION="$(sed -n "s/.*Admin v\\([0-9.]*\\).*/\\1/p" kms.html | head -n 1)"
ADMIN_JS_VERSION="$(sed -n "s/.*Version: \\([0-9.]*\\).*/\\1/p" js/admin-v3.js | head -n 1)"

if [[ -z "$SITE_VERSION" || -z "$MAIN_SITE_VERSION" || -z "$ADMIN_VERSION" || -z "$ADMIN_VERSION_FILE" || -z "$ASSET_VERSION_FILE" || -z "$MAIN_ASSET_VERSION" ]]; then
  echo "Version metadata is missing."
  exit 1
fi

if [[ "$SITE_VERSION" != "$MAIN_SITE_VERSION" ]]; then
  echo "VERSION ($SITE_VERSION) and js/main.js APP_VERSION ($MAIN_SITE_VERSION) do not match."
  exit 1
fi

if [[ "$ADMIN_VERSION_FILE" != "$ADMIN_VERSION" ]]; then
  echo "ADMIN_VERSION ($ADMIN_VERSION_FILE) and js/main.js ADMIN_VERSION ($ADMIN_VERSION) do not match."
  exit 1
fi

if [[ "$ASSET_VERSION_FILE" != "$MAIN_ASSET_VERSION" ]]; then
  echo "ASSET_VERSION ($ASSET_VERSION_FILE) and js/main.js ASSET_VERSION ($MAIN_ASSET_VERSION) do not match."
  exit 1
fi

for value in "$ADMIN_HTML_VERSION" "$KMS_ADMIN_VERSION" "$ADMIN_JS_VERSION"; do
  if [[ "$value" != "$ADMIN_VERSION" ]]; then
    echo "Admin version mismatch detected. Expected $ADMIN_VERSION but found $value."
    exit 1
  fi
done

SITE_STYLE_FILES=(
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

SITE_MAIN_JS_FILES=(
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
)

SITE_CHROME_JS_FILES=(
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
)

BOARD_JS_FILES=(
  latest.html
  korea.html
  apr.html
  wosm.html
  people.html
)

for file in "${SITE_STYLE_FILES[@]}"; do
  grep -F "/css/style.css?v=${ASSET_VERSION_FILE}" "$file" >/dev/null || {
    echo "Missing site stylesheet version in $file"
    exit 1
  }
done

grep -F "/js/wosm-members.js?v=${ASSET_VERSION_FILE}" wosm-members.html >/dev/null || {
  echo "Missing wosm-members.js version in wosm-members.html"
  exit 1
}

for file in "${BOARD_JS_FILES[@]}"; do
  grep -F "/js/board.js?v=${ASSET_VERSION_FILE}" "$file" >/dev/null || {
    echo "Missing board.js asset version in $file"
    exit 1
  }
done

grep -F "/js/glossary.js?v=${ASSET_VERSION_FILE}" glossary.html >/dev/null || {
  echo "Missing glossary.js asset version in glossary.html"
  exit 1
}
grep -F "/js/search.js?v=${ASSET_VERSION_FILE}" search.html >/dev/null || {
  echo "Missing search.js asset version in search.html"
  exit 1
}
grep -F "/js/calendar.js?v=${ASSET_VERSION_FILE}" calendar.html >/dev/null || {
  echo "Missing calendar.js asset version in calendar.html"
  exit 1
}
grep -F "/js/dreampath.js?v=${ASSET_VERSION_FILE}" dreampath.html >/dev/null || {
  echo "Missing dreampath.js asset version in dreampath.html"
  exit 1
}

node - <<'NODE'
const fs = require('fs');
const managedNavFiles = [
  'index.html',
  'latest.html',
  'korea.html',
  'apr.html',
  'wosm.html',
  'wosm-members.html',
  'people.html',
  'glossary.html',
  'contributors.html',
  'search.html',
  'calendar.html',
];
const siteChromeJs = fs.readFileSync('js/site-chrome.js', 'utf8');
const itemRe = /\{\s*href:\s*'([^']+)'/g;
const expected = [];
let match;
while ((match = itemRe.exec(siteChromeJs))) expected.push(match[1]);
if (!expected.length) {
  console.error('Could not parse GW.NAV_ITEMS from js/site-chrome.js');
  process.exit(1);
}
for (const file of managedNavFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const navMatch = html.match(/<nav class="nav" data-managed-nav>([\s\S]*?)<\/nav>/);
  if (!navMatch) {
    console.error(`Missing managed nav fallback in ${file}`);
    process.exit(1);
  }
  const hrefs = Array.from(navMatch[1].matchAll(/href="([^"]+)"/g)).map((entry) => entry[1]);
  if (hrefs.length !== expected.length || hrefs.some((href, idx) => href !== expected[idx])) {
    console.error(`Managed nav fallback mismatch in ${file}`);
    process.exit(1);
  }
}
NODE

for file in "${SITE_MAIN_JS_FILES[@]}"; do
  grep -F "/js/main.js?v=${ASSET_VERSION_FILE}" "$file" >/dev/null || {
    echo "Missing site main.js version in $file"
    exit 1
  }
done

for file in "${SITE_CHROME_JS_FILES[@]}"; do
  grep -F "/js/site-chrome.js?v=${ASSET_VERSION_FILE}" "$file" >/dev/null || {
    echo "Missing site-chrome.js asset version in $file"
    exit 1
  }
done

grep -F "/js/home.js?v=${ASSET_VERSION_FILE}" index.html >/dev/null || {
  echo "Missing home.js asset version in index.html"
  exit 1
}

grep -F "/css/admin-v3.css?v=${ASSET_VERSION_FILE}" admin.html >/dev/null || {
  echo "Missing admin stylesheet asset version in admin.html"
  exit 1
}
grep -F "/js/admin-v3.js?v=${ASSET_VERSION_FILE}" admin.html >/dev/null || {
  echo "Missing admin JS asset version in admin.html"
  exit 1
}
grep -F "/js/shared-country-name-ko.js?v=${ASSET_VERSION_FILE}" admin.html >/dev/null || {
  echo "Missing shared-country-name-ko asset version in admin.html"
  exit 1
}

node - <<'NODE'
const fs = require('fs');
const siteVersion = fs.readFileSync('VERSION', 'utf8').trim();
const mainJs = fs.readFileSync('js/main.js', 'utf8');
const adminVersion = (mainJs.match(/ADMIN_VERSION = '([0-9.]+)'/) || [])[1] || '';
const changelog = JSON.parse(fs.readFileSync('data/changelog.json', 'utf8'));
const items = Array.isArray(changelog.items) ? changelog.items : [];
const versions = new Set(items.map((item) => String(item.version || '').trim()).filter(Boolean));
if (!versions.has(siteVersion)) {
  console.error(`Missing changelog entry for site version ${siteVersion}.`);
  process.exit(1);
}
if (!versions.has(adminVersion)) {
  console.error(`Missing changelog entry for admin version ${adminVersion}.`);
  process.exit(1);
}
NODE

echo "Release metadata verified for site ${SITE_VERSION} / admin ${ADMIN_VERSION}."
