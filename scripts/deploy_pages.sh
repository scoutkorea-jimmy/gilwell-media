#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "deploy_pages.sh is now an alias for production deployment."
exec "$ROOT_DIR/scripts/deploy_production.sh" "$@"
