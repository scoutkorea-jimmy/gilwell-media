import SwiftUI

@main
struct BPMediaWriterApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .withAppTypography()
                .environment(\.layoutDirection, .leftToRight)
                .frame(minWidth: 980, minHeight: 640)
                .tint(BrandColors.scoutingPurple)
                .background(BrandColors.canvasWhite)
                // 배경은 Canvas White 로 고정인데 글자는 시스템 동적색이라, 다크 모드에선 흰 바탕에 흰 글자가 된다.
                // 다크 팔레트(11-site-design: 딥퍼플이 소멸)를 따로 만들기 전까지는 라이트로 잠근다.
                .preferredColorScheme(.light)
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("새 글") {
                    appState.openNewPost()
                }
                .keyboardShortcut("n", modifiers: [.command])
            }
            CommandGroup(after: .appSettings) {
                Button("설정…") {
                    NotificationCenter.default.post(name: .bpmediaOpenSettings, object: nil)
                }
                .keyboardShortcut(",", modifiers: [.command])
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if appState.isAuthenticated {
                NavigationSplitView {
                    PostListView()
                } detail: {
                    if appState.homeTab == .dashboard {
                        DashboardView()
                    } else if appState.editorMode != nil {
                        EditorView()
                            .id(appState.editorSessionID)
                    } else {
                        ContentUnavailableView(
                            "글을 선택해 주세요",
                            systemImage: "doc.text",
                            description: Text("왼쪽 목록에서 글을 고르거나 「새 글」로 시작해 주세요.")
                        )
                        .background(BrandColors.brandBackground)
                    }
                }
                .tint(BrandColors.brandPrimary)
            } else {
                LoginView()
            }
        }
        .background(BrandColors.canvasWhite)
        .tint(BrandColors.scoutingPurple)
        .environment(\.layoutDirection, .leftToRight)
        .alert(appState.globalAlertTitle, isPresented: Binding(
            get: { appState.globalAlert != nil },
            set: { if !$0 {
                if appState.updateAvailableVersion != nil {
                    appState.dismissUpdateAlert()
                }
                appState.globalAlert = nil
            } }
        )) {
            Button("확인", role: .cancel) {
                if appState.updateAvailableVersion != nil {
                    appState.dismissUpdateAlert()
                }
                appState.globalAlert = nil
            }
        } message: {
            Text(appState.globalAlert ?? "")
        }
    }
}
