import SwiftUI
import AppKit

struct PostListView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.appTypography) private var typography
    @State private var pendingDelete: PostSummary?
    @State private var confirmDelete = false
    @State private var showSettings = false
    @State private var filtersExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            topToolbar
            homeTabBar
            if appState.homeTab == .posts {
                filterSection
                Divider()
                listBody
                Divider()
                paginationBar
            } else {
                dashboardSidebar
            }
        }
        .frame(minWidth: 300)
        .background(BrandColors.brandBackground)
        .tint(BrandColors.brandPrimary)
        .environment(\.layoutDirection, .leftToRight)
        .task {
            if appState.isAuthenticated {
                await appState.refreshPosts(quietIfPossible: false)
                await appState.loadHelpers()
                await appState.checkForUpdateIfNeeded(reason: .appear)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await appState.checkForUpdateIfNeeded(reason: .focus) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .bpmediaOpenSettings)) { _ in
            showSettings = true
        }
        .alert("게시글 삭제", isPresented: $confirmDelete, presenting: pendingDelete) { post in
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) {
                Task { await appState.deletePost(id: post.id) }
            }
        } message: { post in
            Text("「\(post.title ?? "#\(post.id)")」을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.")
        }
    }

    // MARK: - Top toolbar (primary CTA + secondary Menu)

    private var topToolbar: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("BP Media")
                    .font(typography.captionSemibold)
                    .foregroundStyle(BrandColors.scoutingPurple.opacity(0.85))
                Text(appState.homeTab.titleKO)
                    .font(typography.title2)
                    .foregroundStyle(BrandColors.scoutingPurple)
            }
            Spacer(minLength: 8)

            // Primary action — always prominent
            Button {
                appState.openNewPost()
            } label: {
                Label("새 글", systemImage: "square.and.pencil")
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
            }
            .buttonStyle(.borderedProminent)
            .tint(BrandColors.brandPrimary)
            .controlSize(.regular)
            .help("새 글 작성 (⌘N)")

            // Secondary prominent — refresh
            Button {
                Task { await appState.refreshPosts(quietIfPossible: false) }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .frame(minWidth: BrandColors.minTapTarget, minHeight: BrandColors.minTapTarget)
            }
            .buttonStyle(.bordered)
            .controlSize(.regular)
            .disabled(appState.isLoadingList || appState.isRefreshingQuietly)
            .help("새로고침")

            // Overflow secondary actions — avoid clipped titleAndIcon stack
            Menu {
                Button {
                    openWebAdmin()
                } label: {
                    Label("웹 관리자", systemImage: "safari")
                }
                Button {
                    showSettings = true
                } label: {
                    Label("설정", systemImage: "gearshape")
                }
                Divider()
                Button(role: .destructive) {
                    appState.logout()
                } label: {
                    Label("로그아웃", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .frame(minWidth: BrandColors.minTapTarget, minHeight: BrandColors.minTapTarget)
            }
            .help("더 보기 · 웹관리자 · 설정 · 로그아웃")
            .menuStyle(.borderlessButton)
        }
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, 12)
        .background(BrandColors.brandSurface)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    // MARK: - Home tabs

    private var homeTabBar: some View {
        Picker("화면", selection: $appState.homeTab) {
            ForEach(WriterHomeTab.allCases) { tab in
                Text(tab.titleKO).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, 8)
        .background(BrandColors.brandSurface)
    }

    // MARK: - Dashboard sidebar (useful, not empty void)

    private var dashboardSidebar: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: BrandColors.sectionSpacing) {
                Text("다음에 쓸 글")
                    .font(typography.headline)
                    .foregroundStyle(BrandColors.scoutingPurple)

                Text("아젠다 힌트와 키워드를 탭하면 목록 검색이 채워집니다.")
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if appState.dashAgendaHints.isEmpty && appState.dashCategoryGaps.isEmpty {
                    Text("대시보드를 불러오면 아젠다 칩이 여기에 표시됩니다.")
                        .font(typography.callout)
                        .foregroundStyle(.secondary)
                }

                ForEach(appState.dashAgendaHints.prefix(4)) { hint in
                    Button {
                        // Prefer first quoted search term if present
                        if let range = hint.text.range(of: "‘"),
                           let end = hint.text.range(of: "’", range: range.upperBound..<hint.text.endIndex) {
                            let kw = String(hint.text[range.upperBound..<end.lowerBound])
                            appState.applyDashboardSearch(kw)
                        } else {
                            appState.homeTab = .posts
                        }
                    } label: {
                        Text(hint.text)
                            .font(typography.caption)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(BrandColors.brandSurface)
                            .clipShape(RoundedRectangle(cornerRadius: BrandColors.chipRadius))
                    }
                    .buttonStyle(.plain)
                    .help("목록 검색으로 이동")
                }

                if !appState.dashCategoryGaps.isEmpty {
                    Text("카테고리 바로가기")
                        .font(typography.captionSemibold)
                        .foregroundStyle(.secondary)
                    FlexibleChipRow(spacing: 6) {
                        ForEach(appState.dashCategoryGaps) { gap in
                            Button {
                                appState.homeTab = .posts
                                appState.categoryFilter = gap.category
                                appState.currentPage = 1
                                Task { await appState.refreshPosts(quietIfPossible: true) }
                            } label: {
                                Text(gap.category.titleKO)
                                    .font(typography.captionSemibold)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .foregroundStyle(gap.isStale ? Color.white : BrandColors.midnightPurple)
                                    .background(gap.isStale ? BrandColors.scoutingPurple : BrandColors.riverBlue.opacity(0.35))
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .help(gap.isStale ? "아젠다 기회 · 목록 필터" : "카테고리 목록")
                        }
                    }
                }

                Button {
                    appState.homeTab = .posts
                } label: {
                    Label("게시글 목록으로", systemImage: "list.bullet")
                }
                .buttonStyle(.borderedProminent)
                .tint(BrandColors.brandPrimary)
                .padding(.top, 4)
            }
            .padding(BrandColors.panePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(BrandColors.brandBackground)
        .environment(\.layoutDirection, .leftToRight)
    }

    // MARK: - Filters (full-bleed, collapsible)

    private var filterSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("제목·내용 검색", text: $appState.searchQuery)
                    .textFieldStyle(.roundedBorder)
                    .environment(\.layoutDirection, .leftToRight)
                    .multilineTextAlignment(.leading)
                    .onChange(of: appState.searchQuery) { _, _ in
                        appState.scheduleRefresh(resetPage: true)
                    }

                if appState.isRefreshingQuietly {
                    ProgressView()
                        .controlSize(.small)
                        .help("검색 갱신 중")
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        filtersExpanded.toggle()
                    }
                } label: {
                    Image(systemName: filtersExpanded ? "chevron.up" : "chevron.down")
                        .frame(minWidth: BrandColors.minTapTarget, minHeight: BrandColors.minTapTarget)
                }
                .buttonStyle(.borderless)
                .help(filtersExpanded ? "필터 접기" : "필터 펼치기")
            }

            if filtersExpanded {
                Text("카테고리")
                    .font(typography.captionSemibold)
                    .foregroundStyle(.secondary)

                categoryChips

                Text("공개 상태")
                    .font(typography.captionSemibold)
                    .foregroundStyle(.secondary)

                Picker("공개", selection: $appState.publishedFilter) {
                    ForEach(PublishedFilter.allCases) { f in
                        Text(f.title).tag(f)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .onChange(of: appState.publishedFilter) { _, _ in
                    appState.currentPage = 1
                    Task { await appState.refreshPosts(quietIfPossible: true) }
                }
            }
        }
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandColors.brandSurface)
    }

    private var categoryChips: some View {
        FlexibleChipRow(spacing: 6) {
            categoryChip(title: "전체", selected: appState.categoryFilter == nil) {
                appState.categoryFilter = nil
                appState.currentPage = 1
                Task { await appState.refreshPosts(quietIfPossible: true) }
            }
            ForEach(PostCategory.allCases) { cat in
                categoryChip(title: cat.titleKO, selected: appState.categoryFilter == cat) {
                    appState.categoryFilter = cat
                    appState.currentPage = 1
                    Task { await appState.refreshPosts(quietIfPossible: true) }
                }
            }
        }
    }

    private func categoryChip(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(typography.captionSemibold)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .foregroundStyle(selected ? Color.white : BrandColors.midnightPurple)
                .background(selected ? BrandColors.scoutingPurple : BrandColors.riverBlue.opacity(0.35))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    @ViewBuilder
    private var listBody: some View {
        if appState.isLoadingList && appState.posts.isEmpty {
            ProgressView("불러오는 중…")
                .tint(BrandColors.brandPrimary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let err = appState.listError, appState.posts.isEmpty {
            VStack(spacing: 8) {
                Text(err)
                    .font(.body)
                    .multilineTextAlignment(.center)
                Button("다시 시도") {
                    Task { await appState.refreshPosts(quietIfPossible: false) }
                }
                .buttonStyle(.borderedProminent)
                .tint(BrandColors.brandPrimary)
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List(selection: Binding(
                get: { appState.selectedPostID },
                set: { appState.selectedPostID = $0 }
            )) {
                ForEach(appState.posts) { post in
                    Button {
                        appState.selectedPostID = post.id
                        Task { await appState.openView(postID: post.id) }
                    } label: {
                        postRow(post)
                    }
                    .buttonStyle(.plain)
                    .tag(post.id)
                    .listRowInsets(EdgeInsets(top: 8, leading: BrandColors.panePadding, bottom: 8, trailing: 12))
                    .listRowBackground(
                        appState.selectedPostID == post.id
                            ? BrandColors.scoutingPurple.opacity(0.10)
                            : BrandColors.canvasWhite
                    )
                    .contextMenu {
                        Button("보기") {
                            appState.selectedPostID = post.id
                            Task { await appState.openView(postID: post.id) }
                        }
                        Button("수정") {
                            appState.selectedPostID = post.id
                            Task { await appState.openEdit(postID: post.id) }
                        }
                        Button("삭제…", role: .destructive) {
                            pendingDelete = post
                            confirmDelete = true
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .tint(BrandColors.brandPrimary)
            .environment(\.layoutDirection, .leftToRight)
        }
    }

    private func postRow(_ post: PostSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(post.title ?? "(제목 없음)")
                    .font(typography.bodySemibold)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Text(post.isPublished ? "공개" : "비공개")
                    .font(typography.caption2Semibold)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .foregroundStyle(post.isPublished ? BrandColors.forestGreen : BrandColors.midnightPurple)
                    .background(
                        (post.isPublished ? BrandColors.leafGreen : BrandColors.blossomPink)
                            .opacity(0.35)
                    )
                    .clipShape(Capsule())
            }

            Text(PostCategory.displayTitle(for: post.category))
                .font(typography.caption2Semibold)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .foregroundStyle(BrandColors.midnightPurple)
                .background(BrandColors.riverBlue.opacity(0.45))
                .clipShape(Capsule())
                .lineLimit(2)

            HStack(alignment: .center, spacing: 6) {
                Text(post.displayDate)
                if let author = post.author, !author.isEmpty {
                    Text("·")
                    Text(author)
                        .lineLimit(1)
                }
                Text("·")
                Label(post.viewsLabel, systemImage: "eye")
            }
            .font(typography.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    // MARK: - Pagination

    private var paginationBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Text("페이지 크기")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(AppState.pageSizeOptions, id: \.self) { size in
                    Button("\(size)") {
                        Task { await appState.setPageSize(size) }
                    }
                    .buttonStyle(.bordered)
                    .tint(appState.pageSize == size ? BrandColors.brandPrimary : nil)
                    .controlSize(.mini)
                    .disabled(appState.pageSize == size)
                }
                Spacer()
                Text(appState.listRangeLabel)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            HStack(spacing: 10) {
                Button {
                    Task { await appState.goToPage(appState.currentPage - 1) }
                } label: {
                    Label("이전", systemImage: "chevron.left")
                }
                .controlSize(.small)
                .disabled(appState.currentPage <= 1 || appState.isLoadingList)

                Text("\(appState.currentPage) / \(appState.totalPages)")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(BrandColors.scoutingPurple)

                Button {
                    Task { await appState.goToPage(appState.currentPage + 1) }
                } label: {
                    Label("다음", systemImage: "chevron.right")
                }
                .controlSize(.small)
                .disabled(appState.currentPage >= appState.totalPages || appState.isLoadingList)

                Spacer()
                if appState.isLoadingList || appState.isRefreshingQuietly {
                    ProgressView().controlSize(.small)
                }
            }
        }
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, 10)
        .background(BrandColors.brandSurface)
    }

    private func openWebAdmin() {
        if let url = URL(string: "https://bpmedia.net/admin.html") {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Simple wrapping chip layout (leading-aligned)

private struct FlexibleChipRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: ProposedViewSize(width: bounds.width, height: bounds.height), subviews: subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: ProposedViewSize(frame.size)
            )
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        let maxWidth = proposal.width ?? .infinity
        var frames: [CGRect] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var width: CGFloat = 0

        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            width = max(width, x - spacing)
        }
        let height = y + rowHeight
        return (CGSize(width: width, height: height), frames)
    }
}
