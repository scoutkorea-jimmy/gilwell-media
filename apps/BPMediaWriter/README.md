# BP Media Writer (macOS) v1

Korean-first SwiftUI macOS app for writing/editing BP Media posts via existing `https://bpmedia.net` APIs. No new web CMS.

Bundle ID: `net.bpmedia.writer`  
Target: macOS 14+  
Signing: Free Apple ID / Personal Team (local run only — no App Store, no notarization)

## Brand

UI colors follow the **World Scouting** brand guide (RGB for digital):

- Primary: Scouting Purple `#622599` + Canvas White `#FFFFFF`
- Accents (sparingly): Midnight Purple, Ocean Blue, Forest Green (success), Ember Orange (warning), Fire Red (destructive)

See `Sources/Theme/BrandColors.swift`. Asset catalog `AccentColor` is set to Scouting Purple.

## Open & run (Personal Team)

1. Install **full Xcode** from the Mac App Store (Command Line Tools alone are not enough).
2. Open the project (저장소 루트에서):
   ```bash
   open apps/BPMediaWriter/BPMediaWriter.xcodeproj
   ```
3. In Xcode → **Signing & Capabilities**:
   - Team: select your **Personal Team** (free Apple ID)
   - Automatically manage signing: ON
   - Bundle Identifier stays `net.bpmedia.writer` (change only if Xcode complains about conflicts)
4. Select scheme **BPMediaWriter** → My Mac → **Run** (⌘R).
5. Log in with the same admin username/password used on `https://bpmedia.net/admin.html`.

### Optional: Turnstile site key

Live `main.js` currently has an empty `GW.TURNSTILE_SITE_KEY`, so CAPTCHA is off. If production later enables Turnstile, set:

```bash
defaults write net.bpmedia.writer bpmedia.turnstile.sitekey "YOUR_SITE_KEY"
```

The login screen will show an embedded WKWebView widget when needed.

## Features (v1)

- Login → Keychain token → `Authorization: Bearer`
- Admin post list (`scope=admin`) with search / category / published filters
- Create / edit / delete posts
- Editor.js JSON content encoding from plain TextEditor + optional body images
- Cover image via `NSOpenPanel` → compressed `image_data` data URL
- Publish modes: immediate / schedule (`publish_at`, unpublished until due) / hold
- Local draft autosave under Application Support `BPMediaWriter/local-draft.json` (text-first; large images omitted)
- Korean UI

## Stability notes

- Edit/save keeps existing http(s) Editor.js body images (preserves original JSON when body unchanged)
- 목록(`list`)·표(`table`) 블록의 내용은 편집창에 텍스트로 보여 준다 — 안 보이면 본문을 고칠 때
  **모르는 사이에 통째로 사라진다.** 서식은 문단으로 평탄화되지만 내용은 남는다(본문 미변경 시엔 원본 유지)
- Editor.js JSON 은 필드별로 느슨하게 디코딩한다 — 낯선 타입이 하나 섞여도 글 전체가 깨지지 않는다
- Image pick compresses/downscales before base64 (~max edge 2000px, JPEG ~0.82; ~4MB cap)
- Login 401 does not clear session (`onUnauthorized` only when `authorized: true`)
- Keychain write failures are surfaced; `try!` removed from Editor.js encode
- List refresh honors cancellation so stale responses do not overwrite newer results
- 저장에 성공하면 서버가 돌려준 `updated_at` 을 편집 화면이 곧바로 받아 둔다 —
  안 그러면 **바로 이어지는 두 번째 저장이 409("다른 사용자가 먼저 수정")로 막힌다**
- 409 는 코드로 가른다(`EDIT_CONFLICT` 만 동시편집 안내) — 다른 409 에 엉뚱한 안내를 하지 않도록

Out of scope: analytics, KMS, member permissions UI, Facebook/SNS share, App Store metadata.

## OTP / 2FA

If the API returns `otp_required`, v1 shows a Korean message that 2FA must be completed in the **web admin**. Mac writer does not implement TOTP UI yet.

## Regenerate project (optional)

If `xcodegen` is installed:

```bash
cd apps/BPMediaWriter && xcodegen generate
```

## Roundtrip test (Editor.js 인코더/디코더)

기존 글을 열어 고쳐 저장할 때 **이미지·목록·표가 살아남는지**를 실제로 돌려 확인한다.
Xcode 없이 돌아가고, 하나라도 실패하면 종료코드 1 이다.

```bash
bash apps/BPMediaWriter/Tests/run-roundtrip.sh
```

검사 항목 25건 — 이미지 보존, 미변경 시 원본 JSON 바이트 동일, 목록·표 노출,
중첩 목록(Editor.js 2.30 객체형), 낯선 스키마 견고성, 특수문자 라운드트립.
`Tests/` 는 `project.yml` 의 `sources: [Sources]` 밖이라 앱 빌드에 섞이지 않는다.

## Live audit (운영 기사로 디코더 검증)

실제 `bpmedia.net` 기사를 받아 디코더가 **내용을 하나도 안 잃는지** 대조한다.
정답은 Python 이 **다른 구현으로** 뽑아 Swift 결과와 맞춰 본다 — 같은 코드로 채점하면 의미가 없다.

```bash
bash apps/BPMediaWriter/Tests/live-audit/run-live-audit.sh 100
```

⚠️ 운영 API 를 **읽기만** 한다(GET). 아무것도 쓰지 않는다.
검사 항목 7가지 — 이미지 추출 일치 · 빈 본문 · 원시 JSON 노출 · 미변경 시 원본 보존 ·
수정 저장 시 이미지 생존 · 두 번 저장 안정성 · **원본 텍스트 조각 유실**.

2026-09-07 전수 결과: 운영 98건 · 문제 0건.
(같은 검사를 목록 노출 수정 이전 코드로 돌리면 **2건에서 텍스트 11조각이 유실**된다.)

## Pre-check without Xcode (Command Line Tools only)

Xcode 가 없는 기기(맥미니 등)에서도 **컴파일 오류를 미리 잡을 수 있다.** `xcodebuild` 는 못 쓰지만
`swiftc -typecheck` 로 전체 소스를 검사한다. 실기 빌드 전에 이걸로 걸러라.

```bash
SDK=$(xcrun --sdk macosx --show-sdk-path)
swiftc -typecheck -swift-version 5 -sdk "$SDK" -target arm64-apple-macos14.0 \
  $(find apps/BPMediaWriter/Sources -name '*.swift')
```

⚠️ 위 명령은 View 파일에서 `SwiftUIMacros.StateMacro ... plugin not found` 로 멈춘다 —
`@State` 는 **Xcode 전용 매크로 플러그인**이 있어야 확장되기 때문이다. **코드 결함이 아니다.**
View 까지 검사하려면 사본을 만들어 `@State` 를 동등한 프로퍼티 래퍼로 치환한다:

```bash
TC=$(mktemp -d) && cp -R apps/BPMediaWriter/Sources/* "$TC"/
find "$TC" -name '*.swift' -exec sed -i '' 's/@State /@StateShim /g' {} +
cat > "$TC/__StateShim.swift" <<'EOF'
import SwiftUI
@propertyWrapper
struct StateShim<Value> {
    final class Box { var v: Value; init(_ v: Value) { self.v = v } }
    private let box: Box
    init(wrappedValue: Value) { box = Box(wrappedValue) }
    var wrappedValue: Value {
        get { box.v }
        nonmutating set { box.v = newValue }
    }
    var projectedValue: Binding<Value> { Binding(get: { box.v }, set: { box.v = $0 }) }
}
extension StateShim where Value: ExpressibleByNilLiteral {
    init() { box = Box(nil) }
}
EOF
swiftc -typecheck -swift-version 5 -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  -target arm64-apple-macos14.0 $(find "$TC" -name '*.swift')
```

출력이 없으면 통과다. (사본만 검사하므로 원본은 건드리지 않는다.)

## Build from CLI (after Xcode is installed)

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -project apps/BPMediaWriter/BPMediaWriter.xcodeproj \
  -scheme BPMediaWriter -configuration Debug build
```

Signing may still require selecting a Team once in the Xcode UI.
