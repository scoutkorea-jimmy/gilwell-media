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
                            Text("갱신 \(at.formatted(date: .omitted, time: .shortened))")
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
                Text("다음에 쓸 기사 주제 발견 · Asia/Seoul")
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                appState.openNewPost()
            } label: {
                Label("새 글", systemImage: "square.and.pencil")
            }
            .buttonStyle(.borderedProminent)
            .tint(BrandColors.brandPrimary)
            .help("새 글 작성")

            Button {
                Task { await appState.loadDashboard() }
            } label: {
                if appState.isLoadingDashboard {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .frame(minWidth: BrandColors.minTapTarget, minHeight: BrandColors.minTapTarget)
                }
            }
            .buttonStyle(.bordered)
            .disabled(appState.isLoadingDashboard)
            .help("대시보드 새로고침")
        }
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, 12)
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
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: appState.dashboardPermissionDenied ? "lock.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(appState.dashboardPermissionDenied ? BrandColors.brandWarning : BrandColors.brandDanger)
            Text(message)
                .font(typography.callout)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(BrandColors.cardPadding)
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
            Text(err)
                .font(typography.caption)
                .foregroundStyle(BrandColors.brandWarning)
        }
        if appState.dashSearchKeywords.isEmpty {
            Text(appState.dashSearchKeywordsError == nil
                 ? "검색 유입 키워드가 아직 없습니다."
                 : "권한이 있는 다른 섹션은 계속 표시됩니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        } else {
            FlowChips {
                ForEach(appState.dashSearchKeywords) { row in
                    if let kw = row.keyword, !kw.isEmpty {
                        Button {
                            appState.applyDashboardSearch(kw)
                        } label: {
                            HStack(spacing: 4) {
                                Text(kw)
                                    .font(typography.captionSemibold)
                                if let v = row.visits {
                                    Text("\(v)")
                                        .font(typography.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .foregroundStyle(BrandColors.midnightPurple)
                            .background(BrandColors.riverBlue.opacity(0.35))
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .help("목록 검색에 ‘\(kw)’ 넣기")
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
                                Text("아젠다 기회")
                                    .font(typography.caption2Semibold)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .foregroundStyle(.white)
                                    .background(BrandColors.scoutingPurple)
                                    .clipShape(Capsule())
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
                            .frame(minWidth: BrandColors.minTapTarget, minHeight: BrandColors.minTapTarget)
                    }
                    .buttonStyle(.borderless)
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
            Text(err)
                .font(typography.caption)
                .foregroundStyle(BrandColors.brandWarning)
        }
        let rows = !appState.dashMetaTags.isEmpty ? appState.dashMetaTags : appState.dashHeaderTags
        if rows.isEmpty {
            Text("태그 데이터가 없습니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        } else {
            FlowChips {
                ForEach(rows.prefix(16)) { row in
                    if let tag = row.tag, !tag.isEmpty {
                        Button {
                            appState.applyDashboardSearch(tag)
                        } label: {
                            HStack(spacing: 4) {
                                Text(tag)
                                    .font(typography.captionSemibold)
                                if let c = row.count {
                                    Text("\(c)")
                                        .font(typography.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .foregroundStyle(BrandColors.midnightPurple)
                            .background(BrandColors.blossomPink.opacity(0.28))
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .help("‘\(tag)’로 목록 검색")
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
                    hint: adjacentHint(forTitle: post.title)
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
                    hint: adjacentHint(fromMeta: post.metaTags)
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

    private func adjacentHint(forTitle title: String?) -> String? {
        guard let tag = appState.dashMetaTags.first?.tag, !tag.isEmpty else { return nil }
        return "이 주제 인접 아젠다? · \(tag)"
    }

    private func adjacentHint(fromMeta meta: String?) -> String? {
        let parts = (meta ?? "")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard let first = parts.first else {
            return adjacentHint(forTitle: nil)
        }
        return "이 주제 인접 아젠다? · \(first)"
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

// MARK: - Flow wrap for chips (leading-aligned)

private struct FlowChips: Layout {
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
        return (CGSize(width: width, height: y + rowHeight), frames)
    }
}
