#!/bin/bash
# Editor.js 인코더/디코더 라운드트립 검증 — Xcode 없이 돌아간다.
#   bash apps/BPMediaWriter/Tests/run-roundtrip.sh
# 통과하면 종료코드 0, 하나라도 실패하면 1.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SRC="$ROOT/apps/BPMediaWriter/Sources/Models/EditorJSCodec.swift"
TEST="$ROOT/apps/BPMediaWriter/Tests/EditorJSCodecRoundtrip.swift"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
# Swift 는 최상위 코드를 main.swift 에서만 허용한다 → 그 이름으로 복사해 컴파일한다.
cp "$TEST" "$OUT/main.swift"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
swiftc -swift-version 5 -sdk "$SDK" -target arm64-apple-macos14.0 -o "$OUT/rt" "$SRC" "$OUT/main.swift"
"$OUT/rt"
