#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SITE_VERSION="$(cat VERSION)"
MAIN_SITE_VERSION="$(sed -n "s/.*GW.APP_VERSION = '\\([^']*\\)'.*/\\1/p" js/main.js | head -n 1)"
ADMIN_VERSION="$(sed -n "s/.*GW.ADMIN_VERSION = '\\([^']*\\)'.*/\\1/p" js/main.js | head -n 1)"
ADMIN_HTML_VERSION="$(sed -n "s/.*v3-ver-admin\">\\([^<]*\\)<.*/\\1/p" admin.html | head -n 1)"
KMS_ADMIN_VERSION="$(sed -n "s/.*Admin v\\([0-9.]*\\).*/\\1/p" kms.html | head -n 1)"
ADMIN_JS_VERSION="$(sed -n "s/.*Version: \\([0-9.]*\\).*/\\1/p" js/admin-v3.js | head -n 1)"

if [[ -z "$SITE_VERSION" || -z "$MAIN_SITE_VERSION" || -z "$ADMIN_VERSION" ]]; then
  echo "Version metadata is missing."
  exit 1
fi

if [[ "$SITE_VERSION" != "$MAIN_SITE_VERSION" ]]; then
  echo "VERSION ($SITE_VERSION) and js/main.js APP_VERSION ($MAIN_SITE_VERSION) do not match."
  exit 1
fi

for value in "$ADMIN_HTML_VERSION" "$KMS_ADMIN_VERSION" "$ADMIN_JS_VERSION"; do
  if [[ "$value" != "$ADMIN_VERSION" ]]; then
    echo "Admin version mismatch detected. Expected $ADMIN_VERSION but found $value."
    exit 1
  fi
done

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
