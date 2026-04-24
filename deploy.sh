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

# ── 최신 버전 조회 ────────────────────────────────────────────────────────────
echo ""
echo "📦 Fetching latest version from D1..."
D1_RAW=$(wrangler d1 execute "$DB" --remote \
  --command "SELECT aa, bbb, cc FROM dp_versions ORDER BY aa DESC, bbb DESC, cc DESC, id DESC LIMIT 1" \
  --json 2>&1) || {
  echo "❌ Failed to fetch latest version from D1. wrangler output:"
  echo "$D1_RAW"
  echo ""
  echo "Aborting to avoid resetting the version counter. Fix wrangler auth/connection and retry."
  exit 1
}

LATEST=$(echo "$D1_RAW" | python3 -c "
import sys, json
try:
    rows = json.load(sys.stdin)
    r = rows[0]['results']
except Exception as exc:
    sys.stderr.write('JSON parse failed: ' + str(exc) + '\n')
    sys.exit(2)
if r:
    print(r[0]['aa'], r[0]['bbb'], r[0]['cc'])
else:
    # Empty dp_versions table — this is the ONLY legitimate reset scenario
    print('EMPTY')
") || {
  echo "❌ Failed to parse D1 version response. Raw output:"
  echo "$D1_RAW"
  echo ""
  echo "Aborting to avoid resetting the version counter."
  exit 1
}

if [[ "$LATEST" == "EMPTY" ]]; then
  echo "⚠️  dp_versions table is empty — initializing at 01.000.00"
  CUR_AA=1
  CUR_BBB=0
  CUR_CC=0
else
  read -r CUR_AA CUR_BBB CUR_CC <<< "$LATEST"
fi

echo "   Latest: $(printf '%02d.%03d.%02d' "$CUR_AA" "$CUR_BBB" "$CUR_CC")"

# ── 다음 버전 계산 ────────────────────────────────────────────────────────────
if [[ "$SKIP_VERSION" == true ]]; then
  VERSION=$(printf "%02d.%03d.%02d" "$CUR_AA" "$CUR_BBB" "$CUR_CC")
else
  NEW_AA=$CUR_AA
  if [[ "$TYPE" == "feature" ]]; then
    NEW_BBB=$((CUR_BBB + 1))
    NEW_CC=0
  else
    NEW_BBB=$CUR_BBB
    NEW_CC=$((CUR_CC + 1))
  fi
  VERSION=$(printf "%02d.%03d.%02d" "$NEW_AA" "$NEW_BBB" "$NEW_CC")
fi

# ── 캐시 버스팅: HTML 파일의 ?v= 쿼리스트링을 새 버전으로 치환 ────────────────
# 이전 버전은 배포 후 `git checkout -- $f` 로 파일 전체를 원복했는데, 그 사이에
# 개발자가 커밋하지 않은 *기능* 변경이 있으면 전부 날아갔다 (2026-04-24 사고).
# 이제는 이전 `?v=` 토큰을 기억해뒀다가 배포 후 정확히 그 토큰만 복원한다.
echo "🔄 Cache-busting: updating ?v= to ${VERSION}..."
HTML_FILES=$(find . -maxdepth 1 -name '*.html' -type f)
declare -a PREV_TOKENS
for f in $HTML_FILES; do
  # 가장 먼저 등장하는 ?v= 토큰 하나를 저장 (같은 파일 내에서는 모두 동일 버전이라 가정)
  PREV=$(grep -oE '\?v=[0-9]+\.[0-9]+\.[0-9]+' "$f" 2>/dev/null | head -1 || true)
  PREV_TOKENS+=("${f}|${PREV}")
  sed -i '' "s/?v=[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/?v=${VERSION}/g" "$f"
done

# ── 배포 ──────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Deploying to Cloudflare Pages..."
wrangler pages deploy . --project-name "$PROJECT"

# ── HTML ?v= 토큰만 원래대로 되돌림 (커밋되지 않은 기능 변경은 건드리지 않음) ──
for entry in "${PREV_TOKENS[@]}"; do
  f="${entry%%|*}"
  prev="${entry#*|}"
  if [[ -n "$prev" ]]; then
    sed -i '' "s/?v=[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/${prev}/g" "$f" 2>/dev/null || true
  fi
done

if [[ "$SKIP_VERSION" == true ]]; then
  echo "⏭  Version registration skipped."
  exit 0
fi

# ── D1에 버전 기록 삽입 ───────────────────────────────────────────────────────
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")
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
