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

# 공개 노출 경계 게이트 — `wrangler pages deploy .` 가 저장소 루트를 통째로 올리므로
# 새 내부 디렉토리(문서·스크립트·덤프)를 추가하면 기본적으로 공개된다. 차단 목록
# (functions/_middleware.js `isBlockedInternalPath()`) 과 실제 저장소 구성이
# 어긋나면 배포를 막는다. 반대로 런타임이 fetch 하는 자산을 차단 목록에 넣은
# 경우(card-news-app / dreampath 시한폭탄 유형)도 여기서 잡는다.
if [[ -f "$ROOT_DIR/scripts/audit_public_exposure.mjs" ]]; then
  node "$ROOT_DIR/scripts/audit_public_exposure.mjs"
fi

# KMS 스냅샷 드리프트 게이트 — D1(운영 원본) ↔ docs/feature-definition.md / default.js 정합성.
# md 를 직접 편집·커밋한 뒤 sync 를 누락(13.1.7 유형)하거나, 반대로 D1 만 바뀌고 스냅샷이
# 뒤처진 채 배포되는 것을 차단한다. 해소법: `node scripts/sync_kms_snapshot.mjs` 실행 후 커밋.
# D1/네트워크/wrangler 미가용 시엔 차단하지 않고 경고만 한다 (오프라인 preflight 잠금 방지 —
# 실제 배포는 wrangler 가 필요하므로 보통 D1 에 도달 가능).
if [[ -f "$ROOT_DIR/scripts/sync_kms_snapshot.mjs" ]] && command -v wrangler >/dev/null 2>&1; then
  if KMS_CHECK_OUT="$(node "$ROOT_DIR/scripts/sync_kms_snapshot.mjs" --check 2>&1)"; then
    echo "KMS 스냅샷 동기화 상태 OK."
  elif printf '%s' "$KMS_CHECK_OUT" | grep -q "드리프트 감지"; then
    echo "Production preflight failed: KMS 스냅샷 드리프트 (sync 누락)."
    echo "$KMS_CHECK_OUT"
    exit 1
  else
    echo "Release preflight note: KMS 드리프트 점검 생략 (D1/네트워크 미가용)."
    echo "$KMS_CHECK_OUT"
  fi
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
