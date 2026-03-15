#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Preview-first workflow enabled."
echo "deploy_pages.sh now deploys a preview build."
echo "Use ./scripts/deploy_production.sh only after preview approval."
exec "$ROOT_DIR/scripts/deploy_preview.sh" "$@"
