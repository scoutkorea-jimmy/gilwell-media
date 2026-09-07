import SwiftUI
import AppKit

struct LoginView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.appTypography) private var typography
    @State private var username = ""
    @State private var password = ""
    @State private var isBusy = false
    @State private var turnstileToken: String?
    @State private var showTurnstile = false
    @State private var statusMessage: String?

    /// Optional override. Live site currently ships an empty site key (Turnstile off).
    /// Set via UserDefaults key `bpmedia.turnstile.sitekey` if production enables it later.
    private var siteKey: String {
        UserDefaults.standard.string(forKey: "bpmedia.turnstile.sitekey") ?? ""
    }

    var body: some View {
        HStack(spacing: 0) {
            brandPanel

            VStack(alignment: .leading, spacing: 14) {
                Text("관리자 로그인")
                    .font(typography.title2)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Text("웹 관리자와 같은 계정으로 로그인합니다.")
                    .font(typography.callout)
                    .foregroundStyle(.secondary)

                TextField("계정명", text: $username)
                    .multilineTextAlignment(.leading)
                    .textFieldStyle(.roundedBorder)
                SecureField("비밀번호", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit {
                        Task { await submit() }
                    }

                if showTurnstile && !siteKey.isEmpty {
                    TurnstileWebView(siteKey: siteKey) { token in
                        turnstileToken = token
                    }
                    .frame(height: 80)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.3))
                    )
                }

                if let statusMessage {
                    InlineNotice(text: statusMessage, kind: .warning)
                }

                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        if isBusy { ProgressView().controlSize(.small).tint(.white) }
                        Text(isBusy ? "로그인 중…" : "로그인")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.writerPrimary)
                .keyboardShortcut(.defaultAction)
                .disabled(isBusy || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)

                Text("2단계 인증(OTP)을 켠 계정은 웹 관리자에서 먼저 인증해 주세요.")
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(40)
            .frame(width: 420)
            .frame(maxHeight: .infinity, alignment: .center)
            .background(BrandColors.canvasWhite)
        }
        .tint(BrandColors.brandPrimary)
        .environment(\.layoutDirection, .leftToRight)
    }

    /// 브랜드 패널 — 앱 아이콘 + 이름 + 한 줄. 개발 환경 이야기는 여기 두지 않는다.
    private var brandPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .interpolation(.high)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.25), radius: 8, y: 4)
            VStack(alignment: .leading, spacing: 6) {
                Text("BP Media Writer")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.white)
                Text("bpmedia.net 기사 작성·관리")
                    .font(typography.callout)
                    .foregroundStyle(.white.opacity(0.85))
            }
            Spacer()
            Text("버전 \(UpdateChecker.localVersion)")
                .font(typography.caption)
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BrandColors.scoutingPurple)
    }

    private func submit() async {
        guard !isBusy else { return }
        isBusy = true
        statusMessage = nil
        defer { isBusy = false }

        let user = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = turnstileToken

        do {
            try await attemptLogin(username: user, password: password, turnstile: token)
            password = ""
            return
        } catch let error as APIError {
            if error.code == "rejected" || error.message.contains("로그인할 수 없습니다") {
                if !siteKey.isEmpty && token == nil {
                    showTurnstile = true
                    statusMessage = "보안 확인이 필요합니다. 아래 확인을 마친 뒤 다시 로그인해 주세요."
                    password = ""
                    return
                }
            }
            if error.code == "otp_required" || error.message.contains("otp") || error.message.contains("2단계") {
                statusMessage = "2단계 인증(OTP)을 켠 계정입니다. 웹 관리자에서 먼저 인증해 주세요."
                password = ""
                return
            }
            if error.code == "throttled" {
                let retry = error.retryAfter.map { "\($0)초 뒤" } ?? "잠시 뒤"
                statusMessage = "로그인 시도가 잠시 제한되었습니다. \(retry) 다시 시도해 주세요."
                password = ""
                return
            }
            statusMessage = error.message
            password = ""
        } catch let error as AuthServiceError {
            statusMessage = error.localizedDescription
            password = ""
        } catch {
            statusMessage = error.localizedDescription
            password = ""
        }
    }

    /// 로그인만 한다. 목록·헬퍼는 `PostListView` 가 나타나며 알아서 불러온다 — 여기서 또 부르면 두 번 나간다.
    private func attemptLogin(username: String, password: String, turnstile: String?) async throws {
        let result = try await appState.api.login(username: username, password: password, turnstileToken: turnstile)
        try appState.auth.saveSession(token: result.token ?? "", role: result.role, user: result.user)
        appState.currentUser = result.user
        appState.role = result.role
        appState.currentPage = 1
        appState.isAuthenticated = true
    }
}
