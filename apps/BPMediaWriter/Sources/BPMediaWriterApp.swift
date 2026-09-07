import SwiftUI

@main
struct BPMediaWriterApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .frame(minWidth: 980, minHeight: 640)
                .tint(BrandColors.scoutingPurple)
                .background(BrandColors.canvasWhite)
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("새 글") {
                    appState.openNewPost()
                }
                .keyboardShortcut("n", modifiers: [.command])
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
                    if appState.editorMode != nil {
                        EditorView()
                            .id(appState.editorSessionID)
                    } else {
                        ContentUnavailableView(
                            "글을 선택하세요",
                            systemImage: "doc.text",
                            description: Text("왼쪽 목록에서 글을 고르거나 새 글을 작성하세요.")
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
        .alert("알림", isPresented: Binding(
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
