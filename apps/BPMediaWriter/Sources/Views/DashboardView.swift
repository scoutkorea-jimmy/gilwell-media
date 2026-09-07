import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.appTypography) private var typography

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if appState.isLoadingDashboard && appState.dashLoadedAt == nil {
                        ProgressView("대시보드 불러오는 중…")
                            .tint(BrandColors.brandPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    } else {
                        if let err = appState.dashboardError {
                            errorBanner(err)
                        }

                        LazyVGrid(columns: columns, spacing: 12) {
                            statCard(
                                title: "오늘 홈 방문",
                                value: format(appState.dashTodayVisits),
                                subtitle: "오늘 · KST",
                                systemImage: "person.2"
                            )
                            statCard(
                                title: "오늘 조회",
                                value: format(appState.dashTodayViews),
                                subtitle: "페이지뷰 · KST",
                                systemImage: "eye"
                            )
                            statCard(
                                title: "오늘 게시",
                                value: format(appState.dashTodayPublished),
                                subtitle: "오늘 올라간 기사",
                                systemImage: "doc.badge.plus"
                            )
                            statCard(
                                title: "전체 / 공개",
                                value: "\(format(appState.dashTotalPosts)) / \(format(appState.dashPublishedPosts))",
                                subtitle: "기사 수",
                                systemImage: "tray.full"
                            )
                        }

                        Text("기사 댓글 집계 없음")
                            .font(typography.caption)
                            .foregroundStyle(.tertiary)

                        sectionCard(title: "인기 기사") {
                            popularList
                        }

                        sectionCard(title: "방문 국가 (오늘)") {
                            countryList
                        }

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
                .padding(20)
            }
        }
        .background(BrandColors.brandBackground)
        .tint(BrandColors.brandPrimary)
        .task {
            if appState.dashLoadedAt == nil {
                await appState.loadDashboard()
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("대시보드")
                    .font(typography.title2)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Text("오늘 기준 · Asia/Seoul")
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task { await appState.loadDashboard() }
            } label: {
                if appState.isLoadingDashboard {
                    ProgressView().controlSize(.small)
                } else {
                    Label("새로고침", systemImage: "arrow.clockwise")
                }
            }
            .buttonStyle(.bordered)
            .disabled(appState.isLoadingDashboard)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(BrandColors.brandSurface)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: appState.dashboardPermissionDenied ? "lock.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(appState.dashboardPermissionDenied ? BrandColors.brandWarning : BrandColors.brandDanger)
            Text(message)
                .font(typography.callout)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(BrandColors.brandSurface)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(BrandColors.scoutingPurple.opacity(0.15), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func statCard(title: String, value: String, subtitle: String, systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Text(title)
                    .font(typography.captionSemibold)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Spacer(minLength: 0)
            }
            Text(value)
                .font(typography.title)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(subtitle)
                .font(typography.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
        .background(BrandColors.canvasWhite)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(BrandColors.scoutingPurple.opacity(0.12), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(typography.headline)
                .foregroundStyle(BrandColors.scoutingPurple)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandColors.canvasWhite)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(BrandColors.scoutingPurple.opacity(0.12), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

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
                    postID: post.postID
                )
                if idx < fromAnalytics.count - 1 { Divider() }
            }
        } else if !fromPopular.isEmpty {
            ForEach(Array(fromPopular.enumerated()), id: \.element.id) { idx, post in
                popularRow(
                    rank: idx + 1,
                    title: post.title ?? "(제목 없음)",
                    views: post.views ?? 0,
                    postID: post.id
                )
                if idx < fromPopular.count - 1 { Divider() }
            }
        } else {
            Text("인기 기사 데이터가 없습니다.")
                .font(typography.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func popularRow(rank: Int, title: String, views: Int, postID: Int?) -> some View {
        Button {
            if let postID {
                appState.homeTab = .posts
                Task { await appState.openView(postID: postID) }
            }
        } label: {
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
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(postID == nil)
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
            VStack(alignment: .leading, spacing: 8) {
                ForEach(appState.dashCountries) { row in
                    HStack {
                        Text(row.displayName)
                            .font(typography.bodySemibold)
                            .lineLimit(1)
                        Spacer()
                        Text("방문 \(format(row.visits))")
                            .font(typography.caption)
                            .foregroundStyle(.secondary)
                        Text("조회 \(format(row.pageviews))")
                            .font(typography.caption)
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
