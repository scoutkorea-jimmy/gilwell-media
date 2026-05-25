#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x "$ROOT_DIR/scripts/verify_release_metadata.sh"
"$ROOT_DIR/scripts/verify_release_metadata.sh"

# Frontend reference audit (안정성 3차) — strict 모드로 자산 캐시 토큰 드리프트만
# 차단. CSS 클래스 정의·DOM id 참조는 warn 으로만 출력 (false positive 다수).
# sync_versions.sh 가 갱신하지 않는 ?v= 토큰이 HTML 에 살아 있으면 배포 후
# stale 캐시로 회귀가 묻히므로 critical.
if [[ -f "$ROOT_DIR/scripts/audit_frontend_refs.mjs" ]]; then
  node "$ROOT_DIR/scripts/audit_frontend_refs.mjs" --strict
fi

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
