#!/usr/bin/env bash
# Gilwell Media · D1 backup (full SQL dump)
#
# Cloudflare D1은 자체 복제 + Point-in-time recovery를 제공하지만, 운영자가
# 손에 들고 있는 백업이 별도로 필요한 케이스(legal/compliance, 사고 시
# 빠른 검증, 마이그레이션 등) 대비 SQL dump를 주기적으로 받는다.
#
# 출력 파일: backups/d1/<DB>-YYYYMMDD-HHMMSS.sql.gz
#
# 권장 운영: crontab 또는 GitHub Actions로 주 1회 실행 → 결과 파일을
# 외부 저장소(Dropbox/Drive 등)에 업로드. R2 자체에 둘 수도 있지만 R2
# 사고 시 도움 안 되므로 외부 권장.
#
# 사용:
#   ./scripts/backup_d1.sh                  # gilwell-posts 백업
#   DB_NAME=dreampath-db ./scripts/backup_d1.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

WRANGLER_BIN="${WRANGLER_BIN:-/opt/homebrew/bin/wrangler}"
DB_NAME="${DB_NAME:-gilwell-posts}"
OUT_DIR="${OUT_DIR:-backups/d1}"
TS="$(date '+%Y%m%d-%H%M%S')"

mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${DB_NAME}-${TS}.sql"

echo "─────────────────────────────────────────────"
echo " D1 backup: $DB_NAME → $OUT_FILE.gz"
echo "─────────────────────────────────────────────"

"$WRANGLER_BIN" d1 export "$DB_NAME" --remote --output "$OUT_FILE"

if [[ ! -s "$OUT_FILE" ]]; then
  echo "ERROR: dump file is empty" >&2
  exit 1
fi

gzip -f "$OUT_FILE"
SIZE_KB=$(du -k "${OUT_FILE}.gz" | awk '{print $1}')
echo "OK · ${OUT_FILE}.gz · ${SIZE_KB}KB"

# 30일 초과 백업 자동 삭제 (디스크 누적 방지). 외부 저장소로 옮긴 뒤 안전.
find "$OUT_DIR" -name "${DB_NAME}-*.sql.gz" -mtime +30 -print -delete || true
