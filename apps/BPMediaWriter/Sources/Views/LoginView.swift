import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appState: AppState
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
            VStack(alignment: .leading, spacing: 16) {
                Text("BP Media Writer")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.white)
                Text("macOS 작성기 v1 · bpmedia.net")
                    .foregroundStyle(.white.opacity(0.85))
                Spacer()
                Text("Personal Team / Free Apple ID용 로컬 앱입니다. App Store 배포·공증은 포함하지 않습니다.")
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.75))
            }
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(BrandColors.scoutingPurple)

            VStack(alignment: .leading, spacing: 14) {
                Text("관리자 로그인")
                    .font(.title2.bold())
                    .foregroundStyle(BrandColors.scoutingPurple)
                Text("웹 관리자와 동일한 계정명·비밀번호를 사용합니다.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                TextField("계정명", text: $username)
                    .multilineTextAlignment(.leading)
                    .environment(\.layoutDirection, .leftToRight)
                    .textFieldStyle(.roundedBorder)
                SecureField("비밀번호", text: $password)
                    .environment(\.layoutDirection, .leftToRight)
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
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundStyle(BrandColors.brandWarning)
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
                .disabled(isBusy || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)

                Text("2단계 인증(OTP)이 켜진 계정은 v1에서 웹 관리자로 먼저 인증해야 합니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(40)
            .frame(width: 420)
            .frame(maxHeight: .infinity, alignment: .center)
            .background(BrandColors.canvasWhite)
        }
        .tint(BrandColors.brandPrimary)
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
                    statusMessage = "Turnstile 확인이 필요할 수 있습니다. 아래 CAPTCHA를 완료한 뒤 다시 로그인해 주세요."
                    password = ""
                    return
                }
            }
            if error.code == "otp_required" || error.message.contains("otp") || error.message.contains("2단계") {
                appState.globalAlert = "v1 Mac 작성기에서는 2단계 인증(OTP)을 지원하지 않습니다. 웹 관리자에서 인증해 주세요."
                password = ""
                return
            }
            if error.code == "throttled" {
                let retry = error.retryAfter.map { "\($0)초 후" } ?? "잠시 후"
                statusMessage = "로그인이 일시 제한되었습니다. \(retry) 다시 시도해 주세요."
                appState.globalAlert = statusMessage
                password = ""
                return
            }
            statusMessage = error.message
            appState.globalAlert = error.message
            password = ""
        } catch let error as AuthServiceError {
            statusMessage = error.localizedDescription
            appState.globalAlert = error.localizedDescription
            password = ""
        } catch {
            statusMessage = error.localizedDescription
            appState.globalAlert = error.localizedDescription
            password = ""
        }
    }

    private func attemptLogin(username: String, password: String, turnstile: String?) async throws {
        let result = try await appState.api.login(username: username, password: password, turnstileToken: turnstile)
        try appState.auth.saveSession(token: result.token ?? "", role: result.role, user: result.user)
        appState.currentUser = result.user
        appState.role = result.role
        appState.isAuthenticated = true
        await appState.refreshPosts()
        await appState.loadHelpers()
    }
}
