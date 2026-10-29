#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v worker-build >/dev/null 2>&1; then
  echo 'Install Rust/wasm32-unknown-unknown and cargo install worker-build --version 0.8.7 --locked first.' >&2
  exit 1
fi
if [[ "$(worker-build --version)" != "0.8.7" ]]; then
  echo 'This project requires worker-build 0.8.7.' >&2
  exit 1
fi
cd "$ROOT_DIR/server-rust"
node --input-type=module -e 'import { COUNTRY_CODE_LABELS_KO } from "../functions/_shared/country-code-labels.js"; import { readFileSync, writeFileSync } from "node:fs"; const path="src/country_labels.json", value=JSON.stringify(COUNTRY_CODE_LABELS_KO); let existing=""; try { existing=readFileSync(path,"utf8"); } catch {} if (existing!==value) writeFileSync(path,value);'
node --input-type=module -e 'import { COUNTRY_NAME_KO_MAP, COUNTRY_NAME_ALIAS_MAP } from "../functions/_shared/country-name-ko.js"; import { readFileSync, writeFileSync } from "node:fs"; const path="src/wosm_country_dictionary.json", value=JSON.stringify({translations:COUNTRY_NAME_KO_MAP,aliases:COUNTRY_NAME_ALIAS_MAP}); let existing=""; try { existing=readFileSync(path,"utf8"); } catch {} if (existing!==value) writeFileSync(path,value);'
worker-build --release --no-opt . --locked
