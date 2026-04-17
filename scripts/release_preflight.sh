#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/verify_release_metadata.sh"
"$ROOT_DIR/scripts/verify_release_metadata.sh"

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "Production preflight failed: main branch required."
  echo "Current branch: ${CURRENT_BRANCH:-detached}"
  exit 1
fi

if [[ -n "$(git status --short --untracked-files=no)" ]]; then
  echo "Production preflight failed: tracked worktree is dirty."
  echo "Commit or stash tracked changes before production deploy."
  exit 1
fi

if [[ -n "$(git status --short --untracked-files=normal)" ]]; then
  echo "Release preflight note: untracked files exist locally and will be ignored."
fi

echo "Release preflight passed for main with a clean tracked worktree."
