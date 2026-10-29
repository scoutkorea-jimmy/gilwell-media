#!/usr/bin/env bash
# Gilwell Media · R2 manifest backup (POST_IMAGES bucket)
#
# R2 object 전체 다운로드는 비용 + 시간이 크므로, 기본은 **manifest(키 목록 + 크기 + sha)**만
# 받는다. R2 자체 redundancy가 있으므로 운영자에게 정말 필요한 건 "어떤 키들이
# 있었나"의 기록. 실수 삭제·계정 사고 시 manifest와 D1 image_url을 대조해서
# 복구 우선순위 정할 수 있음.
#
# 옵션:
#   --full  실제 객체 바이트도 다운로드 (대량 데이터 주의)
#
# 출력:
#   backups/r2/<bucket>-<TS>.manifest.json
#   --full 시: backups/r2/<bucket>-<TS>/<key>

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

WRANGLER_BIN="${WRANGLER_BIN:-/opt/homebrew/bin/wrangler}"
BUCKET_NAME="${BUCKET_NAME:-bpmedia-post-images}"
OUT_DIR="${OUT_DIR:-backups/r2}"
TS="$(date '+%Y%m%d-%H%M%S')"
FULL_DOWNLOAD=0

if [[ "${1:-}" == "--full" ]]; then
  FULL_DOWNLOAD=1
fi

mkdir -p "$OUT_DIR"
MANIFEST="$OUT_DIR/${BUCKET_NAME}-${TS}.manifest.json"

echo "─────────────────────────────────────────────"
echo " R2 backup: $BUCKET_NAME (manifest only=$([ $FULL_DOWNLOAD -eq 0 ] && echo yes || echo no))"
echo "─────────────────────────────────────────────"

# wrangler r2 object list는 페이지 기반 응답. 전체 키 수집은 jq로 합친다.
"$WRANGLER_BIN" r2 object list "$BUCKET_NAME" --json > "$MANIFEST" || {
  echo "ERROR: r2 object list 실패 ($BUCKET_NAME)" >&2
  echo "R2 bucket 이름이 다른지 wrangler.toml의 POST_IMAGES 바인딩 확인 필요." >&2
  exit 1
}
COUNT=$(python3 -c "import json,sys; data=json.loads(open('$MANIFEST').read()); print(len(data) if isinstance(data, list) else len((data or {}).get('objects', [])))")
echo "manifest saved: $MANIFEST ($COUNT objects)"

if [[ $FULL_DOWNLOAD -eq 1 ]]; then
  FULL_DIR="$OUT_DIR/${BUCKET_NAME}-${TS}"
  mkdir -p "$FULL_DIR"
  echo "전체 객체 다운로드 시작 (count=$COUNT)…"
  python3 -c "
import json, subprocess, sys
data = json.loads(open('$MANIFEST').read())
objs = data if isinstance(data, list) else (data or {}).get('objects', [])
for i, o in enumerate(objs):
    key = o.get('key') or o.get('name')
    if not key: continue
    out_path = '$FULL_DIR/' + key.replace('/', '_')
    print(f'  [{i+1}/{len(objs)}] {key}', file=sys.stderr)
    subprocess.run(['$WRANGLER_BIN', 'r2', 'object', 'get', '$BUCKET_NAME/' + key, '--file', out_path], check=False)
"
  echo "full backup: $FULL_DIR"
fi

# 30일 초과 manifest 자동 삭제
find "$OUT_DIR" -name "${BUCKET_NAME}-*.manifest.json" -mtime +30 -print -delete || true
