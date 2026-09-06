import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: AuthUser?
    @Published var role: String?
    @Published var posts: [PostSummary] = []
    @Published var totalPosts = 0
    @Published var isLoadingList = false
    @Published var listError: String?
    @Published var searchQuery = ""
    @Published var categoryFilter: PostCategory? = nil
    @Published var publishedFilter: PublishedFilter = .all
    @Published var editorMode: EditorMode?
    @Published var editorSessionID = UUID()
    @Published var globalAlert: String?
    @Published var authors: [AuthorOption] = []
    @Published var specialFeatures: [String] = []
    @Published var metaTagPool: [String] = []

    let auth: AuthService
    let api: APIClient
    let drafts: DraftStore

    private var listTask: Task<Void, Never>?
    private var listGeneration = 0

    init(
        auth: AuthService = AuthService(),
        api: APIClient = APIClient(),
        drafts: DraftStore = DraftStore()
    ) {
        self.auth = auth
        self.api = api
        self.drafts = drafts
        self.api.tokenProvider = { [weak auth] in auth?.token }
        self.api.onUnauthorized = { [weak self] in
            Task { @MainActor in
                self?.handleUnauthorized()
            }
        }
        if auth.restoreSession() {
            isAuthenticated = true
            currentUser = auth.user
            role = auth.role
        }
    }

    func handleUnauthorized() {
        auth.logout()
        isAuthenticated = false
        currentUser = nil
        role = nil
        editorMode = nil
        posts = []
        globalAlert = "세션이 만료되었습니다. 다시 로그인해 주세요."
    }

    func login(username: String, password: String, turnstileToken: String?) async {
        do {
            let result = try await api.login(username: username, password: password, turnstileToken: turnstileToken)
            try auth.saveSession(token: result.token ?? "", role: result.role, user: result.user)
            currentUser = result.user
            role = result.role
            isAuthenticated = true
            await refreshPosts()
            await loadHelpers()
        } catch let error as APIError {
            if error.code == "otp_required" || error.message.contains("otp") {
                globalAlert = "v1 Mac 작성기에서는 2단계 인증(OTP)을 지원하지 않습니다. 웹 관리자(https://bpmedia.net/admin.html)에서 인증한 뒤 이용해 주세요."
            } else if error.code == "throttled" {
                let retry = error.retryAfter.map { "\($0)초 후" } ?? "잠시 후"
                globalAlert = "로그인이 일시 제한되었습니다. \(retry) 다시 시도해 주세요."
            } else {
                globalAlert = error.message
            }
        } catch let error as AuthServiceError {
            globalAlert = error.localizedDescription
        } catch {
            globalAlert = error.localizedDescription
        }
    }

    func logout() {
        auth.logout()
        isAuthenticated = false
        currentUser = nil
        role = nil
        editorMode = nil
        posts = []
    }

    func refreshPosts() async {
        listTask?.cancel()
        listGeneration += 1
        let generation = listGeneration
        isLoadingList = true
        listError = nil
        do {
            let page = try await api.fetchPosts(
                query: searchQuery,
                category: categoryFilter,
                published: publishedFilter,
                page: 1,
                limit: 50
            )
            guard !Task.isCancelled, generation == listGeneration else { return }
            posts = page.posts
            totalPosts = page.total
        } catch is CancellationError {
            return
        } catch let error as APIError {
            guard !Task.isCancelled, generation == listGeneration else { return }
            listError = error.message
            // 401 on authorized calls already triggers onUnauthorized; avoid double-clear here
            // but still surface list error.
        } catch {
            guard !Task.isCancelled, generation == listGeneration else { return }
            listError = error.localizedDescription
        }
        if generation == listGeneration {
            isLoadingList = false
        }
    }

    func scheduleRefresh() {
        listTask?.cancel()
        listTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await refreshPosts()
        }
    }

    func loadHelpers() async {
        async let editors = api.fetchEditors()
        async let authorFallback = api.fetchAuthorFallback()
        async let tags = api.fetchMetaTagPool(limit: 300)
        do {
            let map = try await editors
            var options = map.keys.sorted().compactMap { letter -> AuthorOption? in
                let name = map[letter]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let required = ["A", "B", "C"].contains(letter)
                if required || !name.isEmpty {
                    return AuthorOption(code: "Editor.\(letter)", label: name.isEmpty ? "Editor.\(letter)" : "Editor.\(letter) · \(name)")
                }
                return nil
            }
            if options.isEmpty {
                let fallback = (try? await authorFallback)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let code = (fallback?.isEmpty == false) ? fallback! : "Editor.A"
                options = [AuthorOption(code: code, label: code)]
            }
            authors = options
            metaTagPool = try await tags
        } catch {
            if authors.isEmpty {
                authors = [AuthorOption(code: "Editor.A", label: "Editor.A")]
            }
        }
    }

    func loadSpecialFeatures(for category: PostCategory) async {
        do {
            specialFeatures = try await api.fetchSpecialFeatures(category: category)
        } catch {
            specialFeatures = []
        }
    }

    func openNewPost() {
        editorSessionID = UUID()
        editorMode = .create(LocalDraft())
    }

    func openEdit(postID: Int) async {
        do {
            let post = try await api.fetchPost(id: postID)
            editorSessionID = UUID()
            editorMode = .edit(post)
            if let category = PostCategory(rawValue: post.category ?? "") {
                await loadSpecialFeatures(for: category)
            }
        } catch let error as APIError {
            globalAlert = error.message
        } catch {
            globalAlert = error.localizedDescription
        }
    }

    func deletePost(id: Int) async {
        do {
            try await api.deletePost(id: id)
            if case .edit(let post) = editorMode, post.id == id {
                editorMode = nil
            }
            await refreshPosts()
        } catch let error as APIError {
            globalAlert = error.message
        } catch {
            globalAlert = error.localizedDescription
        }
    }

    func savePost(_ payload: PostWritePayload, editing: PostDetail?) async -> Bool {
        do {
            let saved: PostDetail
            if let editing {
                var body = payload
                body.expectedUpdatedAt = editing.updatedAt
                saved = try await api.updatePost(id: editing.id, payload: body)
            } else {
                saved = try await api.createPost(payload: payload)
            }
            drafts.clear()
            editorMode = .edit(saved)
            await refreshPosts()
            globalAlert = (saved.published == true || saved.publishedInt == 1) ? "공개 상태로 저장했습니다." : "비공개(또는 예약)로 저장했습니다."
            return true
        } catch let error as APIError {
            if error.statusCode == 409 {
                globalAlert = "다른 사용자가 이 글을 먼저 수정했습니다. 목록에서 다시 열어 주세요."
            } else {
                globalAlert = error.message
            }
            return false
        } catch {
            globalAlert = error.localizedDescription
            return false
        }
    }
}

enum PublishedFilter: String, CaseIterable, Identifiable {
    case all
    case published
    case unpublished

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "전체"
        case .published: return "공개"
        case .unpublished: return "비공개"
        }
    }

    var queryValue: String? {
        switch self {
        case .all: return nil
        case .published: return "1"
        case .unpublished: return "0"
        }
    }
}

enum EditorMode {
    case create(LocalDraft)
    case edit(PostDetail)
}

struct AuthorOption: Identifiable, Hashable {
    var id: String { code }
    let code: String
    let label: String
}
