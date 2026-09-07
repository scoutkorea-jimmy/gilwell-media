import SwiftUI

/// 앱 전체에서 쓰는 단 하나의 칩.
///
/// 색 조합은 `rules/11-site-design.md` 를 따른다 — 파스텔(River Blue · Leaf Green · Blossom Pink)은
/// **배경에만**, 그 위 글자는 Midnight Purple. 선택·필수처럼 강조가 필요한 칩만 Scouting Purple 채움에 흰 글자.
struct WriterChip: View {
    enum Style {
        /// 카테고리·메타 정보 (River Blue tint)
        case neutral
        /// 공개됨 (Leaf Green tint)
        case success
        /// 비공개 (Blossom Pink tint)
        case muted
        /// 태그·주제 (Blossom Pink tint, 옅게)
        case topic
        /// 선택됨 · 필수 · 아젠다 기회 (Scouting Purple fill)
        case filled
    }

    enum Size {
        /// 행 안의 배지 — 눌리지 않는다
        case badge
        /// 누를 수 있는 칩 — 최소 히트 영역 확보
        case button
    }

    let text: String
    var style: Style = .neutral
    var size: Size = .badge
    var count: Int? = nil
    var systemImage: String? = nil

    @Environment(\.appTypography) private var typography

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: size == .badge ? 9 : 11, weight: .semibold))
            }
            Text(text)
                .font(size == .badge ? typography.caption2Semibold : typography.captionSemibold)
                .lineLimit(1)
            if let count {
                Text("\(count)")
                    .font(typography.caption2)
                    .opacity(0.75)
            }
        }
        .padding(.horizontal, size == .badge ? 7 : 10)
        .padding(.vertical, size == .badge ? 2 : 5)
        .frame(minHeight: size == .badge ? 0 : 24)
        .foregroundStyle(foreground)
        .background(background)
        .clipShape(Capsule())
        .fixedSize(horizontal: true, vertical: false)
    }

    private var foreground: Color {
        switch style {
        case .filled: return .white
        case .success: return BrandColors.forestGreen
        case .neutral, .muted, .topic: return BrandColors.midnightPurple
        }
    }

    private var background: Color {
        switch style {
        case .neutral: return BrandColors.riverBlue.opacity(0.38)
        case .success: return BrandColors.leafGreen.opacity(0.35)
        case .muted: return BrandColors.blossomPink.opacity(0.30)
        case .topic: return BrandColors.blossomPink.opacity(0.22)
        case .filled: return BrandColors.scoutingPurple
        }
    }
}

/// 누를 수 있는 칩 — `WriterChip` 을 `.plain` 버튼으로 감싼다.
struct WriterChipButton: View {
    let text: String
    var style: WriterChip.Style = .neutral
    var count: Int? = nil
    var systemImage: String? = nil
    var help: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            WriterChip(text: text, style: style, size: .button, count: count, systemImage: systemImage)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .help(help ?? text)
    }
}

/// 왼쪽 정렬로 줄바꿈하는 칩 배치. 예전의 `FlexibleChipRow` / `FlowChips` 를 하나로 합쳤다.
struct ChipFlowLayout: Layout {
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

/// 인라인 안내·경고·오류. **색만으로 뜻을 전하지 않는다** — 아이콘 + 글.
/// 글자는 항상 본문색(ink). Ember Orange · Fire Red 는 아이콘에만 쓴다 (팔레트 규칙: 본문 금지).
struct InlineNotice: View {
    enum Kind {
        case info
        case warning
        case error
        case success
    }

    let text: String
    var kind: Kind = .info

    @Environment(\.appTypography) private var typography

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(iconColor)
            Text(text)
                .font(typography.caption)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var icon: String {
        switch kind {
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .error: return "xmark.octagon.fill"
        case .success: return "checkmark.circle.fill"
        }
    }

    private var iconColor: Color {
        switch kind {
        case .info: return BrandColors.oceanBlue
        case .warning: return BrandColors.emberOrange
        case .error: return BrandColors.fireRed
        case .success: return BrandColors.forestGreen
        }
    }
}

/// 검색 결과 없음 · 데이터 없음 같은 빈 상태.
struct WriterEmptyState: View {
    let title: String
    var detail: String? = nil
    var systemImage: String = "tray"

    @Environment(\.appTypography) private var typography

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 26, weight: .regular))
                .foregroundStyle(BrandColors.scoutingPurple.opacity(0.45))
            Text(title)
                .font(typography.headline)
                .foregroundStyle(.primary)
            if let detail {
                Text(detail)
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
