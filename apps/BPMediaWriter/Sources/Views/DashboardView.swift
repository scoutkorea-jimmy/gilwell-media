import SwiftUI

/// Editorial agenda dashboard — help Jimmy find what to write next.
/// Hierarchy: Write-next insights first; traffic KPIs secondary/collapsed (Figma).
struct DashboardView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.appTypography) private var typography
    @State private var showTraffic = false
    @State private var showGeo = false

    private let kpiColumns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: BrandColors.sectionSpacing) {
                    if appState.isLoadingDashboard && appState.dashLoadedAt == nil {
                        ProgressView("아젠다 불러오는 중…")
                            .tint(BrandColors.brandPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    } else {
                        if let err = appState.dashboardError {
                            errorBanner(err)
                        }

                        // PRIMARY — what to write next
                        sectionHeader("다음에 쓸 아젠다", subtitle: "키워드·공백·반응 좋은 기사에서 주제를 고르세요")

                        if !appState.dashAgendaHints.isEmpty {
                            sectionCard(title: "미발굴 힌트") {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(appState.dashAgendaHints) { hint in
                                        Text(hint.text)
                                            .font(typography.body)
                                            .foregroundStyle(.primary)
                                            .multilineTextAlignment(.leading)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(10)
                                            .background(BrandColors.brandSurface)
                                            .clipShape(RoundedRectangle(cornerRadius: BrandColors.chipRadius))
                                    }
                                }
                            }
                        }

                        sectionCard(title: "독자가 찾는 키워드") {
                            keywordsBlock
                        }

                        sectionCard(title: "카테고리 공백 · 아젠다 기회") {
                            categoryGapsBlock
                        }

                        sectionCard(title: "뜨는 태그 / 메타 주제") {
                            tagsBlock
                        }

                        sectionCard(title: "반응 좋은 최근 기사") {
                            popularList
                        }

                        // SECONDARY — traffic (progressive disclosure)
                        DisclosureGroup(isExpanded: $showTraffic) {
                            LazyVGrid(columns: kpiColumns, spacing: 10) {
                                miniStat("오늘 방문", format(appState.dashTodayVisits))
                                miniStat("오늘 조회", format(appState.dashTodayViews))
                                miniStat("오늘 게시", format(appState.dashTodayPublished))
                            }
                            .padding(.top, 8)

                            DisclosureGroup("오늘 방문 국가", isExpanded: $showGeo) {
                                countryList
                                    .padding(.top, 6)
                            }
                            .padding(.top, 8)
                            .font(typography.caption)
                        } label: {
                            Text("오늘 트래픽 (참고)")
                                .font(typography.headline)
                                .foregroundStyle(BrandColors.scoutingPurple.opacity(0.85))
                        }
                        .padding(BrandColors.cardPadding)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(BrandColors.canvasWhite)
                        .overlay(
                            RoundedRectangle(cornerRadius: BrandColors.cardRadius)
                                .stroke(BrandColors.scoutingPurple.opacity(0.10), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: BrandColors.cardRadius))

                        if let note = appState.dashTrackingNote, !note.isEmpty {
                            Text(note)
                                .font(typography.caption)
                                .foregroundStyle(.secondary)
                        }

                        if let at = appState.dashLoadedAt {
                            Text("갱신 \(APIDates.clock(at))")
                                .font(typography.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
                .padding(BrandColors.panePadding)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(BrandColors.brandBackground)
        .tint(BrandColors.brandPrimary)
        .environment(\.layoutDirection, .leftToRight)
        .task {
            if appState.dashLoadedAt == nil {
                await appState.loadDashboard()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("아젠다 대시보드")
                    .font(typography.title2)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Text("다음에 쓸 기사 주제 찾기 · 한국 시간 기준")
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                appState.openNewPost()
            } label: {
                Label("새 글", systemImage: "square.and.pencil")
            }
            .buttonStyle(.writerPrimary)
            .help("새 글 작성")

            Button {
                Task { await appState.loadDashboard() }
            } label: {
                if appState.isLoadingDashboard {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .buttonStyle(.writerIcon)
            .disabled(appState.isLoadingDashboard)
            .help("대시보드 새로고침")
        }
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, BrandColors.toolbarVerticalPadding)
        .frame(minHeight: BrandColors.buttonHeight + BrandColors.toolbarVerticalPadding * 2 + 18)
        .background(BrandColors.brandSurface)
    }

    private func sectionHeader(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(typography.title2)
                .foregroundStyle(BrandColors.scoutingPurple)
            Text(subtitle)
                .font(typography.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func errorBanner(_ message: String) -> some View {
        InlineNotice(text: message, kind: appState.dashboardPermissionDenied ? .warning : .error)
            .padding(BrandColors.cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BrandColors.brandSurface)
            .overlay(
                RoundedRectangle(cornerRadius: BrandColors.cardRadius)
                    .stroke(BrandColors.scoutingPurple.opacity(0.15), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: BrandColors.cardRadius))
    }

    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(typography.headline)
                .foregroundStyle(BrandColors.scoutingPurple)
            content()
        }
        .padding(BrandColors.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandColors.canvasWhite)
        .overlay(
            RoundedRectangle(cornerRadius: BrandColors.cardRadius)
                .stroke(BrandColors.scoutingPurple.opacity(0.12), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: BrandColors.cardRadius))
    }

    private func miniStat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(typography.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(typography.title3)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandColors.brandSurface)
        .clipShape(RoundedRectangle(cornerRadius: BrandColors.chipRadius))
    }

    // MARK: Keywords

    @ViewBuilder
    private var keywordsBlock: some View {
        if let err = appState.dashSearchKeywordsError {
            InlineNotice(text: err, kind: .warning)
        }
        if appState.dashSearchKeywords.isEmpty {
            Text(appState.dashSearchKeywordsError == nil
                 ? "검색 유입 키워드가 아직 없습니다."
                 : "권한이 있는 다른 섹션은 계속 표시됩니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        } else {
            ChipFlowLayout {
                ForEach(appState.dashSearchKeywords) { row in
                    if let kw = row.keyword, !kw.isEmpty {
                        WriterChipButton(text: kw, style: .neutral, count: row.visits, help: "목록 검색에 ‘\(kw)’ 넣기") {
                            appState.applyDashboardSearch(kw)
                        }
                    }
                }
            }
        }
    }

    // MARK: Category gaps

    @ViewBuilder
    private var categoryGapsBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(appState.dashCategoryGaps) { gap in
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Text(gap.category.titleKO)
                                .font(typography.bodySemibold)
                                .multilineTextAlignment(.leading)
                            if gap.isStale {
                                WriterChip(text: "아젠다 기회", style: .filled, size: .badge)
                            }
                        }
                        Text(gapSummary(gap))
                            .font(typography.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Button {
                        appState.homeTab = .posts
                        appState.categoryFilter = gap.category
                        appState.currentPage = 1
                        Task { await appState.refreshPosts(quietIfPossible: true) }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                    .buttonStyle(.writerIconPlain)
                    .help("이 카테고리로 목록 필터")
                }
                if gap.id != appState.dashCategoryGaps.last?.id {
                    Divider()
                }
            }
            if appState.dashCategoryGaps.isEmpty {
                Text("카테고리 공백을 계산하지 못했습니다.")
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func gapSummary(_ gap: CategoryGapRow) -> String {
        let since: String
        if let d = gap.daysSinceLast {
            since = d == 0 ? "오늘 게시됨" : "마지막 공개 \(d)일 전"
        } else {
            since = "공개 기사 없음"
        }
        return "\(since) · 7일 \(gap.count7d)건 · 30일 \(gap.count30d)건"
    }

    // MARK: Tags

    @ViewBuilder
    private var tagsBlock: some View {
        if let err = appState.dashTagInsightsError {
            InlineNotice(text: err, kind: .warning)
        }
        let rows = !appState.dashMetaTags.isEmpty ? appState.dashMetaTags : appState.dashHeaderTags
        if rows.isEmpty {
            Text("태그 데이터가 없습니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        } else {
            ChipFlowLayout {
                ForEach(rows.prefix(16)) { row in
                    if let tag = row.tag, !tag.isEmpty {
                        WriterChipButton(text: tag, style: .topic, count: row.count, help: "‘\(tag)’ 로 목록 검색") {
                            appState.applyDashboardSearch(tag)
                        }
                    }
                }
            }
        }
    }

    // MARK: Popular

    @ViewBuilder
    private var popularList: some View {
        let fromAnalytics = appState.dashTopPosts
        let fromPopular = appState.dashPopularPosts
        if !fromAnalytics.isEmpty {
            ForEach(Array(fromAnalytics.enumerated()), id: \.element.id) { idx, post in
                popularRow(
                    rank: idx + 1,
                    title: post.title ?? "(제목 없음)",
                    views: post.displayViews,
                    postID: post.postID,
                    hint: nil
                )
                if idx < fromAnalytics.count - 1 { Divider() }
            }
        } else if !fromPopular.isEmpty {
            ForEach(Array(fromPopular.enumerated()), id: \.element.id) { idx, post in
                popularRow(
                    rank: idx + 1,
                    title: post.title ?? "(제목 없음)",
                    views: post.views ?? 0,
                    postID: post.id,
                    hint: ownTagHint(post.metaTags)
                )
                if idx < fromPopular.count - 1 { Divider() }
            }
        } else {
            Text("인기 기사 데이터가 없습니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func popularRow(rank: Int, title: String, views: Int, postID: Int?, hint: String?) -> some View {
        Button {
            if let postID {
                appState.homeTab = .posts
                Task { await appState.openView(postID: postID) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(rank)")
                        .font(typography.captionSemibold)
                        .foregroundStyle(BrandColors.scoutingPurple)
                        .frame(width: 18, alignment: .leading)
                    Text(title)
                        .font(typography.bodySemibold)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Label(format(views), systemImage: "eye")
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                }
                if let hint, !hint.isEmpty {
                    Text(hint)
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                        .padding(.leading, 28)
                        .multilineTextAlignment(.leading)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(postID == nil)
    }

    /// 그 기사 자신의 메타 태그만 힌트로 쓴다. 전체 1위 태그를 모든 행에 붙이면 같은 말이 반복될 뿐이다.
    private func ownTagHint(_ meta: String?) -> String? {
        let parts = (meta ?? "")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !parts.isEmpty else { return nil }
        return "태그 · " + parts.prefix(3).joined(separator: " · ")
    }

    @ViewBuilder
    private var countryList: some View {
        if appState.dashCountries.isEmpty {
            Text(appState.dashboardPermissionDenied
                 ? "권한이 없어 국가 데이터를 불러오지 못했습니다."
                 : "국가별 접속 기록이 아직 없습니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(appState.dashCountries.prefix(6)) { row in
                    HStack {
                        Text(row.displayName)
                            .font(typography.caption)
                            .lineLimit(1)
                        Spacer()
                        Text("방문 \(format(row.visits))")
                            .font(typography.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func format(_ value: Int?) -> String {
        guard let value else { return "—" }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "ko_KR")
        return f.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
