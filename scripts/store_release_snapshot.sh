#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENVIRONMENT="${1:-production}"
DEPLOYMENT_URL="${2:-}"
VERSION="$(cat VERSION)"
SHORT_SHA="$(git rev-parse --short HEAD)"
COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_MESSAGE="$(git log -1 --pretty=%s)"
CURRENT_BRANCH="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
SNAPSHOT_ID="$(date -u +%Y%m%dT%H%M%SZ)-${SHORT_SHA}"
ARCHIVE_NAME="${SNAPSHOT_ID}.tar.gz"

TMP_DIR="$(mktemp -d)"
PREV_DIR="$TMP_DIR/prev"
HISTORY_DIR="$TMP_DIR/history"

cleanup() {
  git worktree remove "$HISTORY_DIR" --force >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$PREV_DIR"
git archive --format=tar.gz -o "$TMP_DIR/$ARCHIVE_NAME" HEAD

if git fetch origin release-history >/dev/null 2>&1; then
  if git rev-parse --verify --quiet origin/release-history >/dev/null 2>&1; then
    git archive origin/release-history | tar -xf - -C "$PREV_DIR"
  fi
fi

git worktree add --detach "$HISTORY_DIR" >/dev/null 2>&1
cd "$HISTORY_DIR"
git checkout --orphan release-history >/dev/null 2>&1 || git checkout -B release-history >/dev/null 2>&1
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

mkdir -p data snapshots

export SNAPSHOT_ID ARCHIVE_NAME VERSION COMMIT_SHA COMMIT_MESSAGE ENVIRONMENT DEPLOYMENT_URL CURRENT_BRANCH PREV_DIR TMP_DIR
python3 <<'PY'
import json
import os
import shutil
from pathlib import Path

prev_dir = Path(os.environ['PREV_DIR'])
tmp_dir = Path(os.environ['TMP_DIR'])
history_dir = Path.cwd()
manifest_path = prev_dir / 'data' / 'release-snapshots.json'

previous = []
previous_deployments = []
if manifest_path.exists():
    try:
        manifest = json.loads(manifest_path.read_text())
        previous = manifest.get('items', [])
        previous_deployments = manifest.get('deployments', [])
    except Exception:
        previous = []
        previous_deployments = []

items = []
for item in previous[:19]:
    archive_path = prev_dir / item.get('archive_path', '')
    if archive_path.exists():
        target_path = history_dir / item['archive_path']
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(archive_path, target_path)
        items.append(item)

new_archive_target = history_dir / 'snapshots' / os.environ['ARCHIVE_NAME']
new_archive_target.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(tmp_dir / os.environ['ARCHIVE_NAME'], new_archive_target)

new_item = {
    'id': os.environ['SNAPSHOT_ID'],
    'version': os.environ['VERSION'],
    'environment': os.environ['ENVIRONMENT'],
    'commit_sha': os.environ['COMMIT_SHA'],
    'commit_short': os.environ['COMMIT_SHA'][:7],
    'commit_message': os.environ['COMMIT_MESSAGE'],
    'deployment_url': os.environ['DEPLOYMENT_URL'],
    'archived_at': os.popen("date -u +%Y-%m-%dT%H:%M:%SZ").read().strip(),
    'archive_path': 'snapshots/' + os.environ['ARCHIVE_NAME'],
    'rollback_workflow': 'rollback-snapshot.yml',
}

manifest_items = [new_item] + items
manifest_deployments = [{
    'id': os.environ['SNAPSHOT_ID'],
    'version': os.environ['VERSION'],
    'environment': os.environ['ENVIRONMENT'],
    'branch': os.environ['CURRENT_BRANCH'],
    'source': os.environ['COMMIT_SHA'],
    'url': os.environ['DEPLOYMENT_URL'],
    'created_on': new_item['archived_at'],
    'latest_stage': 'success',
    'is_current_production': os.environ['ENVIRONMENT'] == 'production',
    'commit_message': os.environ['COMMIT_MESSAGE'],
}] + [
    item for item in previous_deployments[:19]
    if isinstance(item, dict) and item.get('id')
]
(history_dir / 'data').mkdir(parents=True, exist_ok=True)
(history_dir / 'data' / 'release-snapshots.json').write_text(
    json.dumps({
        'items': manifest_items,
        'deployments': manifest_deployments,
    }, ensure_ascii=False, indent=2) + '\n'
)
PY

git add data/release-snapshots.json "snapshots/$ARCHIVE_NAME"
if [ -n "$(git status --short)" ]; then
  git config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
  git config user.email "${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
  git commit -m "Store release snapshot ${SNAPSHOT_ID}" >/dev/null 2>&1
  git push origin HEAD:release-history --force >/dev/null 2>&1
fi

printf '%s\n' "$SNAPSHOT_ID"
