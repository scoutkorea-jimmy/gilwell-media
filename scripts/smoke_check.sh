#!/usr/bin/env sh
set -eu

DB_NAME="${1:-gilwell-posts}"

echo "Checking local D1 schema for ${DB_NAME}"
wrangler d1 execute "${DB_NAME}" --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('posts', 'settings', 'post_views') ORDER BY name;" >/tmp/gilwell_smoke_tables.txt

echo "Checking seeded settings for ${DB_NAME}"
wrangler d1 execute "${DB_NAME}" --command "SELECT key FROM settings WHERE key IN ('ticker', 'tags', 'hero', 'translations', 'author_name', 'ai_disclaimer') ORDER BY key;" >/tmp/gilwell_smoke_settings.txt

echo "Checking publish_at/update columns for ${DB_NAME}"
wrangler d1 execute "${DB_NAME}" --command "SELECT name FROM pragma_table_info('posts') WHERE name IN ('created_at', 'publish_at', 'updated_at') ORDER BY name;" >/tmp/gilwell_smoke_columns.txt

grep -q '"name": "post_views"' /tmp/gilwell_smoke_tables.txt
grep -q '"name": "posts"' /tmp/gilwell_smoke_tables.txt
grep -q '"name": "settings"' /tmp/gilwell_smoke_tables.txt
grep -q '"key": "ticker"' /tmp/gilwell_smoke_settings.txt
grep -q '"key": "tags"' /tmp/gilwell_smoke_settings.txt
grep -q '"key": "hero"' /tmp/gilwell_smoke_settings.txt
grep -q '"name": "created_at"' /tmp/gilwell_smoke_columns.txt
grep -q '"name": "publish_at"' /tmp/gilwell_smoke_columns.txt
grep -q '"name": "updated_at"' /tmp/gilwell_smoke_columns.txt

rm -f /tmp/gilwell_smoke_tables.txt /tmp/gilwell_smoke_settings.txt /tmp/gilwell_smoke_columns.txt
echo "Schema smoke check passed."
