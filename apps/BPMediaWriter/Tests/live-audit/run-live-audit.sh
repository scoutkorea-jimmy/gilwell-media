#!/bin/bash
# 운영 기사(bpmedia.net)를 실제로 받아 맥 작성기 디코더를 검증한다.
#   bash apps/BPMediaWriter/Tests/live-audit/run-live-audit.sh [건수]
#
# ⚠️ 운영 API 를 **읽기만** 한다(GET). 아무것도 쓰지 않는다.
# 받은 JSON 은 임시 디렉토리에 두고 끝나면 지운다.
set -euo pipefail
LIMIT="${1:-100}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HERE="$ROOT/apps/BPMediaWriter/Tests/live-audit"
WORK="$(mktemp -d)"; POSTS="$WORK/posts"; mkdir -p "$POSTS"
trap 'rm -rf "$WORK"' EXIT

echo "▸ 기사 목록 수집 (최대 ${LIMIT}건)"
: > "$WORK/ids.txt"
for page in $(seq 1 25); do
  curl -sf -m 25 "https://bpmedia.net/api/posts?page=$page&limit=20" -o "$WORK/pg.json" || break
  python3 -c "
import json,sys
d=json.load(open('$WORK/pg.json')); ps=d.get('posts',[])
print('\n'.join(str(p['id']) for p in ps))
sys.exit(0 if len(ps)==20 else 3)
" >> "$WORK/ids.txt" || break
  [ "$(wc -l < "$WORK/ids.txt")" -ge "$LIMIT" ] && break
  sleep 0.15
done
head -n "$LIMIT" "$WORK/ids.txt" | sort -u > "$WORK/ids_u.txt"

echo "▸ 본문 수집"
fails=0
while read -r id; do
  curl -sf -m 25 "https://bpmedia.net/api/posts/$id" -o "$POSTS/$id.json" || { echo "  ⚠️ id=$id 조회 실패(개별조회 오류일 수 있음)"; fails=$((fails+1)); }
  sleep 0.08
done < "$WORK/ids_u.txt"
[ "$fails" -gt 0 ] && echo "  → 조회 실패 ${fails}건 (사이트 쪽 문제일 수 있다 — 앱 결함과 구분할 것)"

echo "▸ 정답 추출 (Swift 와 다른 구현으로)"
python3 "$HERE/extract.py" "$POSTS"

echo "▸ 디코더 대조"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
# Swift 는 최상위 코드를 main.swift 에서만 허용한다 → 그 이름으로 복사해 컴파일한다.
cp "$HERE/LiveAudit.swift" "$WORK/main.swift"
swiftc -swift-version 5 -sdk "$SDK" -target arm64-apple-macos14.0 \
  -o "$WORK/audit" "$ROOT/apps/BPMediaWriter/Sources/Models/EditorJSCodec.swift" "$WORK/main.swift"
"$WORK/audit" "$POSTS"
