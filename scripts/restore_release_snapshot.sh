#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SNAPSHOT_ID="${1:-}"
if [[ -z "$SNAPSHOT_ID" ]]; then
  echo "Usage: ./scripts/restore_release_snapshot.sh <snapshot-id>"
  exit 1
fi

git fetch origin release-history >/dev/null 2>&1
if ! git rev-parse --verify --quiet origin/release-history >/dev/null 2>&1; then
  echo "release-history branch not found."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

git show "origin/release-history:data/release-snapshots.json" > "$TMP_DIR/manifest.json"

ARCHIVE_PATH="$(python3 - "$SNAPSHOT_ID" "$TMP_DIR/manifest.json" <<'PY'
import json
import sys

snapshot_id = sys.argv[1]
manifest_path = sys.argv[2]
data = json.load(open(manifest_path, 'r', encoding='utf-8'))
for item in data.get('items', []):
    if item.get('id') == snapshot_id:
        print(item.get('archive_path', ''))
        break
PY
)"

if [[ -z "$ARCHIVE_PATH" ]]; then
  echo "Snapshot not found: $SNAPSHOT_ID"
  exit 1
fi

git show "origin/release-history:${ARCHIVE_PATH}" > "$TMP_DIR/archive.tar.gz"
mkdir -p "$TMP_DIR/extract"
tar -xzf "$TMP_DIR/archive.tar.gz" -C "$TMP_DIR/extract"

find "$ROOT_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$TMP_DIR/extract"/. "$ROOT_DIR"/
