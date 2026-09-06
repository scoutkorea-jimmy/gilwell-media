# BP Media Writer (macOS) v1

Korean-first SwiftUI macOS app for writing/editing BP Media posts via existing `https://bpmedia.net` APIs. No new web CMS.

Bundle ID: `net.bpmedia.writer`  
Target: macOS 14+  
Signing: Free Apple ID / Personal Team (local run only — no App Store, no notarization)

## Open & run (Personal Team)

1. Install **full Xcode** from the Mac App Store (Command Line Tools alone are not enough).
2. Open the project:
   ```bash
   open /Users/jimmy/Desktop/VS_Code/gilwell-media/apps/BPMediaWriter/BPMediaWriter.xcodeproj
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
- Cover image via `NSOpenPanel` → `image_data` data URL
- Publish modes: immediate / schedule (`publish_at`, unpublished until due) / hold
- Local draft autosave under Application Support `BPMediaWriter/local-draft.json`
- Korean UI

Out of scope: analytics, KMS, member permissions UI, Facebook/SNS share, App Store metadata.

## OTP / 2FA

If the API returns `otp_required`, v1 shows a Korean message that 2FA must be completed in the **web admin**. Mac writer does not implement TOTP UI yet.

## Regenerate project (optional)

If `xcodegen` is installed:

```bash
cd apps/BPMediaWriter && xcodegen generate
```

## Build from CLI (after Xcode is installed)

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -project apps/BPMediaWriter/BPMediaWriter.xcodeproj \
  -scheme BPMediaWriter -configuration Debug build
```

Signing may still require selecting a Team once in the Xcode UI.
