#!/usr/bin/env sh
set -eu

DB_NAME="${1:-gilwell-posts}"

echo "Applying current schema snapshot to local D1 database: ${DB_NAME}"
wrangler d1 execute "${DB_NAME}" --file=./db/schema.sql

echo "Local database bootstrap complete."
