#!/usr/bin/env bash
# Gilwell Media · Orphan row + R2 object audit
#
# 글 삭제 시 cascade가 잘 안 됐을 때 고아 데이터를 찾아낸다. 운영자가 글
# 한 건 삭제할 때 post_history / post_views / post_likes / post_engagement /
# drafts 등의 자식 row + R2 이미지가 같이 정리돼야 하지만, 코드 분기가
# 부분적이라 누적 가능성이 있음.
#
# 결과는 콘솔 출력 + 옵션으로 JSON 파일로 저장.
#
# 사용:
#   ./scripts/audit_orphans.sh                          # 조회만 (write 없음)
#   ./scripts/audit_orphans.sh --json /tmp/audit.json   # JSON 결과 파일 저장
#
# 안전:
#   - 모든 쿼리는 SELECT/COUNT만. UPDATE/DELETE 절대 발사 안 함.
#   - prod D1 변경이 필요하면 사용자가 결과 검토 후 별도 명시 허가 필요.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

JSON_OUT=""
if [[ "${1:-}" == "--json" && -n "${2:-}" ]]; then
  JSON_OUT="$2"
fi

WRANGLER_BIN="${WRANGLER_BIN:-/opt/homebrew/bin/wrangler}"
DB_NAME="${DB_NAME:-gilwell-posts}"

run_d1() {
  local sql="$1"
  "$WRANGLER_BIN" d1 execute "$DB_NAME" --remote --command "$sql" --json 2>/dev/null
}

extract_count() {
  # results[0].count
  python3 -c "import json,sys; data=json.loads(sys.stdin.read()); print(int((data[0].get('results') or [{}])[0].get('count') or 0))"
}

echo "─────────────────────────────────────────────"
echo " Gilwell Media · Orphan Audit"
echo "─────────────────────────────────────────────"

ORPHAN_HISTORY=$(run_d1 \
  "SELECT COUNT(*) AS count FROM post_history WHERE post_id NOT IN (SELECT id FROM posts)" \
  | extract_count)
echo "post_history rows with no parent post : $ORPHAN_HISTORY"

ORPHAN_VIEWS=$(run_d1 \
  "SELECT COUNT(*) AS count FROM post_views WHERE post_id NOT IN (SELECT id FROM posts)" \
  | extract_count)
echo "post_views rows with no parent post   : $ORPHAN_VIEWS"

ORPHAN_LIKES=$(run_d1 \
  "SELECT COUNT(*) AS count FROM post_likes WHERE post_id NOT IN (SELECT id FROM posts)" \
  | extract_count)
echo "post_likes rows with no parent post   : $ORPHAN_LIKES"

ORPHAN_ENGAGEMENT=$(run_d1 \
  "SELECT COUNT(*) AS count FROM post_engagement WHERE post_id NOT IN (SELECT id FROM posts)" \
  | extract_count)
echo "post_engagement rows with no parent   : $ORPHAN_ENGAGEMENT"

ORPHAN_DRAFTS=$(run_d1 \
  "SELECT COUNT(*) AS count FROM drafts WHERE editing_post_id IS NOT NULL AND editing_post_id NOT IN (SELECT id FROM posts)" \
  | extract_count)
echo "drafts editing dead post              : $ORPHAN_DRAFTS"

# 14일 초과 drafts — TTL cron이 잘 도는지 검증
EXPIRED_DRAFTS=$(run_d1 \
  "SELECT COUNT(*) AS count FROM drafts WHERE datetime(updated_at) < datetime('now', '-14 days')" \
  | extract_count)
echo "drafts older than 14 days (TTL miss)  : $EXPIRED_DRAFTS"

# api_rate_limit window이 만료된 row (이론상 무해하지만 누적 추적)
EXPIRED_RL=$(run_d1 \
  "SELECT COUNT(*) AS count FROM api_rate_limit WHERE window_start_at < (CAST(strftime('%s','now') AS INTEGER) - 3600)" \
  | extract_count)
echo "api_rate_limit expired rows (1h+)     : $EXPIRED_RL"

# homepage_issues resolved 90일 초과
RESOLVED_ISSUES=$(run_d1 \
  "SELECT COUNT(*) AS count FROM homepage_issues WHERE status = 'resolved' AND datetime(resolved_at) < datetime('now', '-90 days')" \
  | extract_count)
echo "homepage_issues resolved 90d+         : $RESOLVED_ISSUES"

TOTAL_POSTS=$(run_d1 "SELECT COUNT(*) AS count FROM posts" | extract_count)
TOTAL_HISTORY=$(run_d1 "SELECT COUNT(*) AS count FROM post_history" | extract_count)
TOTAL_VIEWS=$(run_d1 "SELECT COUNT(*) AS count FROM post_views" | extract_count)
TOTAL_DRAFTS=$(run_d1 "SELECT COUNT(*) AS count FROM drafts" | extract_count)

echo ""
echo "─── Reference totals ───"
echo "posts                                 : $TOTAL_POSTS"
echo "post_history                          : $TOTAL_HISTORY"
echo "post_views                            : $TOTAL_VIEWS"
echo "drafts                                : $TOTAL_DRAFTS"

if [[ -n "$JSON_OUT" ]]; then
  cat > "$JSON_OUT" <<EOF
{
  "audited_at": "$(TZ='Asia/Seoul' date '+%Y-%m-%d %H:%M:%S KST')",
  "orphans": {
    "post_history": $ORPHAN_HISTORY,
    "post_views": $ORPHAN_VIEWS,
    "post_likes": $ORPHAN_LIKES,
    "post_engagement": $ORPHAN_ENGAGEMENT,
    "drafts_editing_dead_post": $ORPHAN_DRAFTS
  },
  "ttl_overdue": {
    "drafts_over_14d": $EXPIRED_DRAFTS,
    "api_rate_limit_over_1h": $EXPIRED_RL,
    "homepage_issues_resolved_over_90d": $RESOLVED_ISSUES
  },
  "totals": {
    "posts": $TOTAL_POSTS,
    "post_history": $TOTAL_HISTORY,
    "post_views": $TOTAL_VIEWS,
    "drafts": $TOTAL_DRAFTS
  }
}
EOF
  echo ""
  echo "JSON saved: $JSON_OUT"
fi

echo ""
echo "다음 단계: 위 고아 row가 있으면 별도 명시 허가 후 DELETE 명령 실행."
echo "예) DELETE FROM post_history WHERE post_id NOT IN (SELECT id FROM posts);"
