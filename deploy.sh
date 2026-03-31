#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy.sh  —  Dreampath 배포 + 버전 히스토리 자동 등록
#
# 사용법:
#   ./deploy.sh                          # git 커밋 메시지로 자동 감지
#   ./deploy.sh feature "설명"           # feature 버전 직접 지정
#   ./deploy.sh fix "설명"               # bugfix 버전 직접 지정
#   ./deploy.sh --skip-version           # 버전 기록 없이 배포만
# ──────────────────────────────────────────────────────────────────────────────
set -e

DB="gilwell-posts"
PROJECT="gilwell-media"

# ── 인수 파싱 ─────────────────────────────────────────────────────────────────
SKIP_VERSION=false
TYPE=""
DESCRIPTION=""

if [[ "$1" == "--skip-version" ]]; then
  SKIP_VERSION=true
elif [[ "$1" == "feature" || "$1" == "fix" ]]; then
  TYPE="$1"
  DESCRIPTION="$2"
fi

# ── git 커밋 메시지에서 자동 감지 ─────────────────────────────────────────────
if [[ "$SKIP_VERSION" == false && -z "$TYPE" ]]; then
  COMMIT_MSG=$(git log -1 --pretty=%B | head -1)
  DESCRIPTION="$COMMIT_MSG"

  # 메시지에 fix/hotfix가 포함되면 bugfix, 나머지는 feature
  if echo "$COMMIT_MSG" | grep -qiE "^fix|^hotfix|bug|수정$|고침"; then
    TYPE="bugfix"
  else
    TYPE="feature"
  fi
fi

# ── 배포 ──────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Deploying to Cloudflare Pages..."
wrangler pages deploy . --project-name "$PROJECT"

if [[ "$SKIP_VERSION" == true ]]; then
  echo "⏭  Version registration skipped."
  exit 0
fi

# ── 최신 버전 조회 ────────────────────────────────────────────────────────────
echo ""
echo "📦 Fetching latest version from D1..."
LATEST=$(wrangler d1 execute "$DB" --remote \
  --command "SELECT aa, bbb, cc FROM dp_versions ORDER BY aa DESC, bbb DESC, cc DESC, id DESC LIMIT 1" \
  --json 2>/dev/null | \
  python3 -c "
import sys, json
rows = json.load(sys.stdin)
r = rows[0]['results']
if r:
    print(r[0]['aa'], r[0]['bbb'], r[0]['cc'])
else:
    print('1 0 0')
" 2>/dev/null || echo "1 0 0")

read -r CUR_AA CUR_BBB CUR_CC <<< "$LATEST"

# ── 다음 버전 계산 ────────────────────────────────────────────────────────────
NEW_AA=$CUR_AA
if [[ "$TYPE" == "feature" ]]; then
  NEW_BBB=$((CUR_BBB + 1))
  NEW_CC=0
else
  NEW_BBB=$CUR_BBB
  NEW_CC=$((CUR_CC + 1))
fi

VERSION=$(printf "%02d.%03d.%02d" "$NEW_AA" "$NEW_BBB" "$NEW_CC")
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")

# ── D1에 버전 기록 삽입 (SQL 인젝션 방지: 작은따옴표 이스케이프) ────────────────
# SQLite에서 ' → '' 로 치환하는 방식으로 이스케이프
DESC_ESC="${DESCRIPTION//\'/\'\'}"
TYPE_ESC="${TYPE//\'/\'\'}"

echo "📝 Registering v${VERSION} ($TYPE)..."
wrangler d1 execute "$DB" --remote \
  --command "INSERT INTO dp_versions (version, aa, bbb, cc, type, description, released_at) VALUES ('${VERSION}', ${NEW_AA}, ${NEW_BBB}, ${NEW_CC}, '${TYPE_ESC}', '${DESC_ESC}', '${NOW}')" \
  > /dev/null 2>&1

echo ""
echo "✅ Done!  v${VERSION} · ${TYPE}"
echo "   ${DESCRIPTION}"
echo ""

# ── Push to remote ────────────────────────────────────────────────────────────
echo "📤 Pushing to remote..."
git push
