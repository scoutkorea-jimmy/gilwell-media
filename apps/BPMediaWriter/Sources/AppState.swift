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
    @Published var selectedPostID: Int?
    @Published var currentPage = 1
    @Published var pageSize = 30
    @Published var globalAlert: String?
    @Published var authors: [AuthorOption] = []
    @Published var specialFeatures: [String] = []
    @Published var metaTagPool: [String] = []

    /// Remote Mac writer version newer than local — shown once per dismissed version.
    @Published var updateAvailableVersion: String?
    private var lastUpdateCheckAt: Date?
    private let updateCheckMinInterval: TimeInterval = 7 * 60
    private let dismissedUpdateKey = "bpmedia.writer.dismissedUpdateVersion"

    static let pageSizeOptions = [10, 30, 50]

    let auth: AuthService
    let api: APIClient
    let drafts: DraftStore

    private var listTask: Task<Void, Never>?
    private var listGeneration = 0

    var totalPages: Int {
        max(1, Int(ceil(Double(totalPosts) / Double(max(pageSize, 1)))))
    }

    var listRangeLabel: String {
        guard totalPosts > 0 else { return "0 / 0" }
        let start = (currentPage - 1) * pageSize + 1
        let end = min(currentPage * pageSize, totalPosts)
        return "\(start)–\(end) / \(totalPosts)"
    }

    init(
        auth: AuthService? = nil,
        api: APIClient? = nil,
        drafts: DraftStore? = nil
    ) {
        // 기본 파라미터 표현식은 nonisolated 컨텍스트에서 평가되므로
        // @MainActor 인 AuthService 는 여기(격리된 init 본문)에서 생성한다.
        let auth = auth ?? AuthService()
        let api = api ?? APIClient()
        let drafts = drafts ?? DraftStore()
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
        selectedPostID = nil
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
            currentPage = 1
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
        selectedPostID = nil
        posts = []
    }

    func refreshPosts() async {
        listTask?.cancel()
        listGeneration += 1
        let generation = listGeneration
        isLoadingList = true
        listError = nil
        // Clamp page if filters shrunk the result set.
        if currentPage > totalPages { currentPage = totalPages }
        let page = max(1, currentPage)
        let limit = pageSize
        do {
            let pageResult = try await api.fetchPosts(
                query: searchQuery,
                category: categoryFilter,
                published: publishedFilter,
                page: page,
                limit: limit
            )
            guard !Task.isCancelled, generation == listGeneration else { return }
            posts = pageResult.posts
            totalPosts = pageResult.total
            // If we asked past the last page (e.g. after deletes), snap back once.
            let pages = max(1, Int(ceil(Double(pageResult.total) / Double(max(limit, 1)))))
            if page > pages, pageResult.total > 0 {
                currentPage = pages
                isLoadingList = false
                await refreshPosts()
                return
            }
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

    func scheduleRefresh(resetPage: Bool = true) {
        if resetPage { currentPage = 1 }
        listTask?.cancel()
        listTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await refreshPosts()
        }
    }

    func goToPage(_ page: Int) async {
        let clamped = max(1, min(page, totalPages))
        guard clamped != currentPage || posts.isEmpty else { return }
        currentPage = clamped
        await refreshPosts()
    }

    func setPageSize(_ size: Int) async {
        guard Self.pageSizeOptions.contains(size) else { return }
        pageSize = size
        currentPage = 1
        await refreshPosts()
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

    /// 「새 글」 — always blank create. Clears autosave so a prior edit draft cannot leak in.
    func openNewPost() {
        drafts.clear()
        selectedPostID = nil
        editorSessionID = UUID()
        editorMode = .create(LocalDraft())
    }

    /// List row tap → read-only detail.
    func openView(postID: Int) async {
        do {
            let post = try await api.fetchPost(id: postID)
            selectedPostID = postID
            editorSessionID = UUID()
            editorMode = .view(post)
            if let category = PostCategory(rawValue: post.category ?? "") {
                await loadSpecialFeatures(for: category)
            }
        } catch let error as APIError {
            globalAlert = error.message
        } catch {
            globalAlert = error.localizedDescription
        }
    }

    /// 「수정」 from read-only view (or context menu) → editable editor with same post.
    func openEdit(post: PostDetail) {
        selectedPostID = post.id
        editorSessionID = UUID()
        editorMode = .edit(post)
        if let category = PostCategory(rawValue: post.category ?? "") {
            Task { await loadSpecialFeatures(for: category) }
        }
    }

    func openEdit(postID: Int) async {
        do {
            let post = try await api.fetchPost(id: postID)
            openEdit(post: post)
        } catch let error as APIError {
            globalAlert = error.message
        } catch {
            globalAlert = error.localizedDescription
        }
    }

    func closeEditor() {
        editorMode = nil
        // Keep list selection highlight; user may re-open.
    }

    func deletePost(id: Int) async {
        do {
            try await api.deletePost(id: id)
            if let mode = editorMode {
                switch mode {
                case .edit(let post), .view(let post):
                    if post.id == id {
                        editorMode = nil
                        selectedPostID = nil
                    }
                case .create:
                    break
                }
            }
            await refreshPosts()
        } catch let error as APIError {
            globalAlert = error.message
        } catch {
            globalAlert = error.localizedDescription
        }
    }

    /// 저장에 성공하면 서버가 돌려준 글(갱신된 `updated_at` 포함)을, 실패하면 nil 을 준다.
    /// 호출부는 이 값으로 편집 중인 글을 갱신해야 한다 — 안 하면 두 번째 저장이 409 로 막힌다.
    @discardableResult
    func savePost(_ payload: PostWritePayload, editing: PostDetail?) async -> PostDetail? {
        do {
            let saved: PostDetail
            if let editing {
                var body = payload
                body.expectedUpdatedAt = editing.updatedAt
                saved = try await api.updatePost(id: editing.id, payload: body)
            } else {
                // Create path: never PUT — editing must be nil.
                saved = try await api.createPost(payload: payload)
            }
            drafts.clear()
            selectedPostID = saved.id
            // Stay in edit with fresh server state (updated_at for next save).
            editorMode = .edit(saved)
            await refreshPosts()
            globalAlert = (saved.published == true || saved.publishedInt == 1) ? "공개 상태로 저장했습니다." : "비공개(또는 예약)로 저장했습니다."
            return saved
        } catch let error as APIError {
            // 409 는 두 가지다 — 동시편집 충돌(EDIT_CONFLICT)과 그 밖의 규칙 위반(예: 에디터 추천 4개 초과).
            // 코드로 갈라야 엉뚱한 안내를 하지 않는다.
            if error.statusCode == 409, error.code == "EDIT_CONFLICT" {
                globalAlert = "다른 사용자가 이 글을 먼저 수정했습니다. 목록에서 다시 열어 주세요."
            } else {
                globalAlert = error.message
            }
            return nil
        } catch {
            globalAlert = error.localizedDescription
            return nil
        }
    }

    enum UpdateCheckReason {
        case appear
        case focus
        case manual
    }

    /// Poll remote mac_writer_version (start/appear + focus, throttled).
    func checkForUpdateIfNeeded(reason: UpdateCheckReason) async {
        let now = Date()
        if reason != .manual, let last = lastUpdateCheckAt, now.timeIntervalSince(last) < updateCheckMinInterval {
            return
        }
        lastUpdateCheckAt = now
        guard let remote = await UpdateChecker.fetchRemoteVersion(baseURL: api.baseURL) else { return }
        let local = UpdateChecker.localVersion
        guard UpdateChecker.isRemoteNewer(remote, than: local) else { return }
        let dismissed = UserDefaults.standard.string(forKey: dismissedUpdateKey)
        if dismissed == remote { return }
        updateAvailableVersion = remote
        globalAlert = "새로운 버전이 업로드되었습니다 (\(remote)). 최신 코드로 다시 빌드·실행해 주세요. (현재 \(local))"
    }

    func dismissUpdateAlert() {
        if let v = updateAvailableVersion {
            UserDefaults.standard.set(v, forKey: dismissedUpdateKey)
        }
        updateAvailableVersion = nil
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
    case view(PostDetail)
    case edit(PostDetail)
    case create(LocalDraft)
}

struct AuthorOption: Identifiable, Hashable {
    var id: String { code }
    let code: String
    let label: String
}
