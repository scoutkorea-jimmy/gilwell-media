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
    /// Quiet list refresh (search/filter) — keep existing rows visible.
    @Published var isRefreshingQuietly = false
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
    /// 알림 제목 — 오류와 안내를 구분한다. `showError` / `showNotice` 로만 바꾼다.
    @Published var globalAlertTitle = "알림"
    /// 툴바에 잠깐 보이는 인라인 상태("저장됨 14:02"). 모달을 띄우지 않는다.
    @Published var inlineStatus: String?
    @Published var authors: [AuthorOption] = []
    @Published var specialFeatures: [String] = []
    @Published var metaTagPool: [String] = []

    /// Sidebar home: posts list (default) or article dashboard.
    @Published var homeTab: WriterHomeTab = .posts

    // Dashboard (KST "today" via API days=1 + start/end_date)
    @Published var isLoadingDashboard = false
    @Published var dashboardError: String?
    @Published var dashboardPermissionDenied = false
    @Published var dashTodayVisits: Int?
    @Published var dashTodayViews: Int?
    @Published var dashTodayPublished: Int?
    @Published var dashTotalPosts: Int?
    @Published var dashPublishedPosts: Int?
    @Published var dashTopPosts: [AnalyticsTopPost] = []
    @Published var dashPopularPosts: [PostSummary] = []
    @Published var dashCountries: [GeoCountryRow] = []
    @Published var dashTrackingNote: String?
    @Published var dashLoadedAt: Date?
    @Published var dashSearchKeywords: [SearchKeywordRow] = []
    @Published var dashSearchKeywordsError: String?
    @Published var dashMetaTags: [TagRankingRow] = []
    @Published var dashHeaderTags: [TagRankingRow] = []
    @Published var dashTagInsightsError: String?
    @Published var dashCategoryGaps: [CategoryGapRow] = []
    @Published var dashAgendaHints: [AgendaHintCard] = []

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

    func showError(_ message: String) {
        globalAlertTitle = "오류"
        globalAlert = message
    }

    func showNotice(_ message: String, title: String = "알림") {
        globalAlertTitle = title
        globalAlert = message
    }

    func handleUnauthorized() {
        auth.logout()
        isAuthenticated = false
        currentUser = nil
        role = nil
        editorMode = nil
        homeTab = .posts
        selectedPostID = nil
        posts = []
        showNotice("세션이 만료되었습니다. 다시 로그인해 주세요.", title: "다시 로그인")
    }

    func logout() {
        auth.logout()
        isAuthenticated = false
        currentUser = nil
        role = nil
        editorMode = nil
        homeTab = .posts
        selectedPostID = nil
        posts = []
    }

    func refreshPosts(quietIfPossible: Bool = true) async {
        // Cancel any pending debounce without self-canceling an in-flight listTask body.
        listTask?.cancel()
        listTask = nil
        listGeneration += 1
        await performListRefresh(quietIfPossible: quietIfPossible, generation: listGeneration)
    }

    /// Debounced list refresh for search typing. Empty query refreshes immediately.
    func scheduleRefresh(resetPage: Bool = true) {
        if resetPage { currentPage = 1 }
        listTask?.cancel()
        listGeneration += 1  // invalidate in-flight URLSession via generation + cancel
        let generation = listGeneration
        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let delayNs: UInt64 = trimmed.isEmpty ? 0 : 500_000_000  // 500ms within 450–600
        listTask = Task { [generation] in
            if delayNs > 0 {
                try? await Task.sleep(nanoseconds: delayNs)
            }
            guard !Task.isCancelled, generation == listGeneration else { return }
            await performListRefresh(quietIfPossible: true, generation: generation)
        }
    }

    private func performListRefresh(quietIfPossible: Bool, generation: Int) async {
        let quiet = quietIfPossible && !posts.isEmpty
        if quiet {
            isRefreshingQuietly = true
        } else {
            isLoadingList = true
            isRefreshingQuietly = false
        }
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
                if generation == listGeneration {
                    isLoadingList = false
                    isRefreshingQuietly = false
                }
                await refreshPosts(quietIfPossible: quietIfPossible)
                return
            }
        } catch is CancellationError {
            return
        } catch let error as APIError {
            guard !Task.isCancelled, generation == listGeneration else { return }
            listError = error.message
        } catch {
            guard !Task.isCancelled, generation == listGeneration else { return }
            listError = error.localizedDescription
        }
        if generation == listGeneration {
            isLoadingList = false
            isRefreshingQuietly = false
        }
    }

    /// Prefill list search from dashboard keyword/tag chips.
    func applyDashboardSearch(_ raw: String) {
        let q = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        homeTab = .posts
        searchQuery = q
        currentPage = 1
        scheduleRefresh(resetPage: true)
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
        homeTab = .posts
        selectedPostID = nil
        editorSessionID = UUID()
        editorMode = .create(LocalDraft())
    }

    /// List row tap → read-only detail.
    func openView(postID: Int) async {
        homeTab = .posts
        do {
            let post = try await api.fetchPost(id: postID)
            selectedPostID = postID
            editorSessionID = UUID()
            editorMode = .view(post)
            if let category = PostCategory(rawValue: post.category ?? "") {
                await loadSpecialFeatures(for: category)
            }
        } catch let error as APIError {
            showError(error.message)
        } catch {
            showError(error.localizedDescription)
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
            showError(error.message)
        } catch {
            showError(error.localizedDescription)
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
            showError(error.message)
        } catch {
            showError(error.localizedDescription)
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
            let state = (saved.published == true || saved.publishedInt == 1) ? "공개" : (saved.publishAt?.isEmpty == false ? "예약" : "비공개")
            inlineStatus = "\(state) 저장됨 \(APIDates.clock())"
            return saved
        } catch let error as APIError {
            // 409 는 두 가지다 — 동시편집 충돌(EDIT_CONFLICT)과 그 밖의 규칙 위반(예: 에디터 추천 4개 초과).
            // 코드로 갈라야 엉뚱한 안내를 하지 않는다.
            if error.statusCode == 409, error.code == "EDIT_CONFLICT" {
                showNotice("다른 사용자가 이 글을 먼저 수정했습니다. 목록에서 다시 열어 주세요.", title: "저장하지 못함")
            } else {
                showError(error.message)
            }
            return nil
        } catch {
            showError(error.localizedDescription)
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
        showNotice("BP Media Writer \(remote) 이(가) 나왔습니다. 최신 버전으로 다시 설치해 주세요. (지금 쓰는 버전 \(local))", title: "새 버전")
    }

    func dismissUpdateAlert() {
        if let v = updateAvailableVersion {
            UserDefaults.standard.set(v, forKey: dismissedUpdateKey)
        }
        updateAvailableVersion = nil
    }


    // MARK: - Dashboard

    /// YYYY-MM-DD in Asia/Seoul.
    var todayKSTString: String { APIDates.kstDay(Date()) }

    func loadDashboard() async {
        guard isAuthenticated else { return }
        isLoadingDashboard = true
        dashboardError = nil
        dashboardPermissionDenied = false
        dashSearchKeywordsError = nil
        dashTagInsightsError = nil
        defer { isLoadingDashboard = false }

        let today = todayKSTString
        var permissionHit = false
        var partialErrors: [String] = []

        // 서로 독립인 요청은 한꺼번에 보낸다 — 순서대로 기다리면 20회가 넘어 화면이 늦게 뜬다.
        async let analyticsTask: Result<AdminAnalyticsResponse, Error> = Self.capture { try await api.fetchAdminAnalytics(days: 1) }
        async let geoTask: Result<GeoAudienceResponse, Error> = Self.capture { try await api.fetchGeoAudience(days: 1) }
        async let popularTask = try? api.fetchPopularPosts(limit: 8)
        async let todayTask = try? api.fetchPosts(query: "", category: nil, published: .all, page: 1, limit: 1, startDate: today, endDate: today)
        async let totalTask = try? api.fetchPosts(query: "", category: nil, published: .all, page: 1, limit: 1)
        async let publishedTask = try? api.fetchPosts(query: "", category: nil, published: .published, page: 1, limit: 1)
        async let keywordsTask: Result<SearchKeywordsResponse, Error> = Self.capture { try await api.fetchSearchKeywords(days: 30) }
        async let tagsTask: Result<TagInsightsResponse, Error> = Self.capture { try await api.fetchTagInsights(days: 90) }
        async let gapsTask = computeCategoryGaps()

        // Slim KPI strip (secondary)
        switch await analyticsTask {
        case .success(let data):
            dashTodayVisits = data.resolvedTodayVisits
            dashTodayViews = data.resolvedTodayViews
            if let counts = data.counts {
                if let total = counts.total { dashTotalPosts = total }
                if let published = counts.published { dashPublishedPosts = published }
            }
            dashTopPosts = Array(data.resolvedTopPosts.prefix(8))
            dashTrackingNote = data.trackingNote
        case .failure(let error):
            if let api = error as? APIError {
                if api.statusCode == 403 { permissionHit = true }
                partialErrors.append("방문 분석: \(api.message)")
            } else {
                partialErrors.append("방문 분석: \(error.localizedDescription)")
            }
        }

        // Geo — demoted; still fetch for disclosure
        switch await geoTask {
        case .success(let data):
            dashCountries = Array((data.countries ?? []).prefix(8))
            if (dashTrackingNote ?? "").isEmpty {
                dashTrackingNote = data.trackingNote ?? data.warmupNote
            }
        case .failure(let error):
            if let api = error as? APIError, api.statusCode == 403 { permissionHit = true }
        }

        if let posts = await popularTask {
            dashPopularPosts = posts
        }
        if let res = await todayTask {
            dashTodayPublished = res.total
        }
        if dashTotalPosts == nil, let res = await totalTask {
            dashTotalPosts = res.total
        }
        if dashPublishedPosts == nil, let res = await publishedTask {
            dashPublishedPosts = res.total
        }

        // 1) 독자가 찾는 키워드
        switch await keywordsTask {
        case .success(let kw):
            dashSearchKeywords = Array((kw.keywords ?? []).prefix(12))
        case .failure(let error):
            if let api = error as? APIError {
                if api.statusCode == 403 {
                    permissionHit = true
                    dashSearchKeywordsError = "검색 키워드를 볼 권한이 없습니다 (analytics-visits)."
                } else {
                    dashSearchKeywordsError = api.message
                }
            } else {
                dashSearchKeywordsError = error.localizedDescription
            }
            dashSearchKeywords = []
        }

        // 2) 뜨는 태그 / 메타 주제
        switch await tagsTask {
        case .success(let tags):
            dashMetaTags = Array((tags.metaRanking ?? []).prefix(12))
            dashHeaderTags = Array((tags.headerRanking ?? []).prefix(8))
        case .failure(let error):
            if let api = error as? APIError {
                if api.statusCode == 403 {
                    permissionHit = true
                    dashTagInsightsError = "태그 인사이트를 볼 권한이 없습니다 (analytics-tags)."
                } else {
                    dashTagInsightsError = api.message
                }
            } else {
                dashTagInsightsError = error.localizedDescription
            }
            // Fallback: meta-tag-pool frequency order already loaded in helpers
            if dashMetaTags.isEmpty, !metaTagPool.isEmpty {
                dashMetaTags = metaTagPool.prefix(12).map { TagRankingRow(tag: $0, count: nil) }
            }
        }

        // 3) 카테고리 공백 — always works with scope=admin list
        dashCategoryGaps = await gapsTask

        // 5) 미발굴 힌트 — templated Korean copy from keywords + stale categories
        dashAgendaHints = buildAgendaHints(
            keywords: dashSearchKeywords,
            gaps: dashCategoryGaps,
            tags: dashMetaTags
        )

        dashboardPermissionDenied = permissionHit
        if permissionHit {
            dashboardError = "일부 분석 API 권한이 없습니다. 권한이 있는 데이터와 카테고리 공백은 계속 표시합니다."
        } else if !partialErrors.isEmpty {
            dashboardError = partialErrors.joined(separator: " · ")
        } else {
            dashboardError = nil
        }
        dashLoadedAt = Date()
    }

    private static func capture<T>(_ work: () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await work()) } catch { return .failure(error) }
    }

    private func computeCategoryGaps() async -> [CategoryGapRow] {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = APIDates.kst
        let today = cal.startOfDay(for: Date())
        let day7 = cal.date(byAdding: .day, value: -7, to: today).map { APIDates.kstDay($0) }
        let day30 = cal.date(byAdding: .day, value: -30, to: today).map { APIDates.kstDay($0) }
        let todayStr = todayKSTString
        let api = self.api

        // 카테고리 4개 × 요청 3개를 전부 동시에 보낸다.
        let rows: [CategoryGapRow] = await withTaskGroup(of: CategoryGapRow.self) { group in
            for cat in PostCategory.allCases {
                group.addTask {
                    async let latest = try? api.fetchPosts(query: "", category: cat, published: .published, page: 1, limit: 1)
                    async let c7: Int? = {
                        guard let d = day7 else { return nil }
                        return (try? await api.fetchPosts(query: "", category: cat, published: .published, page: 1, limit: 1, startDate: d, endDate: todayStr))?.total
                    }()
                    async let c30: Int? = {
                        guard let d = day30 else { return nil }
                        return (try? await api.fetchPosts(query: "", category: cat, published: .published, page: 1, limit: 1, startDate: d, endDate: todayStr))?.total
                    }()
                    var daysSince: Int? = nil
                    var lastTitle: String? = nil
                    var lastID: Int? = nil
                    if let post = await latest?.posts.first {
                        lastTitle = post.title
                        lastID = post.id
                        let date = APIDates.parse(post.publishAt, kind: .kst) ?? APIDates.parse(post.createdAt, kind: .utc)
                        if let date {
                            let start = cal.startOfDay(for: date)
                            daysSince = cal.dateComponents([.day], from: start, to: today).day
                        }
                    }
                    return CategoryGapRow(
                        category: cat,
                        daysSinceLast: daysSince,
                        count7d: await c7 ?? 0,
                        count30d: await c30 ?? 0,
                        lastTitle: lastTitle,
                        lastPostID: lastID
                    )
                }
            }
            var out: [CategoryGapRow] = []
            for await row in group { out.append(row) }
            return out
        }
        return rows.sorted { ($0.daysSinceLast ?? 9999) > ($1.daysSinceLast ?? 9999) }
    }

    private func buildAgendaHints(
        keywords: [SearchKeywordRow],
        gaps: [CategoryGapRow],
        tags: [TagRankingRow]
    ) -> [AgendaHintCard] {
        var cards: [AgendaHintCard] = []
        let topKW = keywords.compactMap(\.keyword).filter { !$0.isEmpty }.prefix(3)
        let stale = gaps.filter(\.isStale)

        for gap in stale.prefix(3) {
            let days = gap.daysSinceLast.map { "\($0)일째" } ?? "기록 없음"
            if let kw = topKW.first {
                cards.append(AgendaHintCard(
                    id: "gap-\(gap.category.rawValue)-\(kw)",
                    text: "「\(gap.category.titleKO)」 소식이 \(days) 없습니다. 독자 검색어 상위는 ‘\(kw)’ 입니다."
                ))
            } else if let tag = tags.first?.tag, !tag.isEmpty {
                cards.append(AgendaHintCard(
                    id: "gap-\(gap.category.rawValue)-\(tag)",
                    text: "「\(gap.category.titleKO)」 소식이 \(days) 없습니다. 자주 쓰인 메타 주제는 ‘\(tag)’ 입니다."
                ))
            } else {
                cards.append(AgendaHintCard(
                    id: "gap-\(gap.category.rawValue)",
                    text: "「\(gap.category.titleKO)」 최근 7일 \(gap.count7d)건, 30일 \(gap.count30d)건. 다음 기사 자리가 비어 있습니다."
                ))
            }
        }

        for (idx, kw) in topKW.enumerated() {
            if cards.count >= 5 { break }
            let tagHint = tags.first?.tag
            let text: String
            if let tagHint, !tagHint.isEmpty {
                text = "독자가 ‘\(kw)’ 를 찾고 있습니다. 태그 ‘\(tagHint)’ 와 묶은 해설 기사가 어울립니다."
            } else {
                text = "독자가 ‘\(kw)’ 를 찾고 있습니다. 입문·현황 정리 기사가 어울립니다."
            }
            cards.append(AgendaHintCard(id: "kw-\(idx)-\(kw)", text: text))
        }

        // Deduplicate by text, cap 2–5
        var seen = Set<String>()
        var unique: [AgendaHintCard] = []
        for c in cards {
            if seen.insert(c.text).inserted {
                unique.append(c)
            }
            if unique.count >= 5 { break }
        }
        return Array(unique.prefix(5))
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

enum WriterHomeTab: String, CaseIterable, Identifiable {
    case posts
    case dashboard

    var id: String { rawValue }

    var titleKO: String {
        switch self {
        case .posts: return "게시글"
        case .dashboard: return "대시보드"
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
