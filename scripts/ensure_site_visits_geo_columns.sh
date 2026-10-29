#!/usr/bin/env sh
set -eu

DB_NAME="${1:-gilwell-posts}"
MODE="${2:-}"
REMOTE_FLAG=""

if [ "$DB_NAME" = "--remote" ]; then
  DB_NAME="gilwell-posts"
  MODE="--remote"
fi

if [ "$MODE" = "--remote" ]; then
  REMOTE_FLAG="--remote"
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

run_wrangler_d1() {
  ATTEMPT=1
  while [ "$ATTEMPT" -le 3 ]; do
    if wrangler d1 execute "${DB_NAME}" ${REMOTE_FLAG} --command "$1"; then
      return 0
    fi
    if [ "$ATTEMPT" -ge 3 ]; then
      return 1
    fi
    echo "wrangler d1 execute failed (attempt ${ATTEMPT}/3). Retrying..."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
  done
  return 1
}

echo "Checking site_visits geo columns for ${DB_NAME} ${REMOTE_FLAG}"
run_wrangler_d1 "PRAGMA table_info(site_visits);" >"$TMP_FILE"

ensure_column() {
  COLUMN_NAME="$1"
  COLUMN_SQL="$2"
  if grep -q "\"name\": \"${COLUMN_NAME}\"" "$TMP_FILE"; then
    echo " - ${COLUMN_NAME}: already exists"
    return 0
  fi
  echo " - ${COLUMN_NAME}: adding"
  run_wrangler_d1 "ALTER TABLE site_visits ADD COLUMN ${COLUMN_SQL};" >/dev/null
}

ensure_column "country_code" "country_code TEXT"
ensure_column "country_name" "country_name TEXT"
ensure_column "city_name" "city_name TEXT"
ensure_column "region_code" "region_code TEXT"
ensure_column "continent_code" "continent_code TEXT"
ensure_column "latitude" "latitude REAL"
ensure_column "longitude" "longitude REAL"

echo "Ensuring geo indexes"
run_wrangler_d1 "CREATE INDEX IF NOT EXISTS idx_site_visits_country_code ON site_visits(country_code);" >/dev/null
run_wrangler_d1 "CREATE INDEX IF NOT EXISTS idx_site_visits_city_name ON site_visits(city_name);" >/dev/null

echo "site_visits geo columns are ready."
