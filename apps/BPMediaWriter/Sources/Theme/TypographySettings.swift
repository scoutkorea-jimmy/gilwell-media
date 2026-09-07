import SwiftUI
import AppKit

/// Persisted reader/editor typography (AppStorage / UserDefaults).
enum WriterFontSizeChoice: String, CaseIterable, Identifiable {
    case small
    case medium
    case large

    var id: String { rawValue }

    var titleKO: String {
        switch self {
        case .small: return "작게"
        case .medium: return "보통"
        case .large: return "크게"
        }
    }

    /// Multiplier applied to body/title/list text.
    var scale: CGFloat {
        switch self {
        case .small: return 0.85
        case .medium: return 1.0
        case .large: return 1.2
        }
    }
}

enum WriterFontFamilyChoice: String, CaseIterable, Identifiable {
    case system
    case gothic
    case serif

    var id: String { rawValue }

    var titleKO: String {
        switch self {
        case .system: return "시스템"
        case .gothic: return "본고딕"
        case .serif: return "명조"
        }
    }

    /// Preferred family names (first available wins).
    var preferredNames: [String] {
        switch self {
        case .system:
            return []
        case .gothic:
            return ["Apple SD Gothic Neo", "AppleSDGothicNeo-Regular"]
        case .serif:
            return ["Apple Myungjo", "Nanum Myeongjo", "New York", "Times New Roman"]
        }
    }

    func resolvedFamilyName() -> String? {
        let names = preferredNames
        guard !names.isEmpty else { return nil }
        let available = Set(NSFontManager.shared.availableFontFamilies)
        for name in names where available.contains(name) {
            return name
        }
        for name in names {
            if let match = available.first(where: {
                $0.caseInsensitiveCompare(name) == .orderedSame
                    || $0.localizedCaseInsensitiveContains(name)
            }) {
                return match
            }
        }
        return nil
    }
}

enum TypographyStorage {
    static let sizeKey = "bpmedia.writer.fontSize"
    static let familyKey = "bpmedia.writer.fontFamily"
}

/// Environment value for scaled, family-aware fonts.
struct AppTypography {
    var sizeChoice: WriterFontSizeChoice
    var familyChoice: WriterFontFamilyChoice

    var scale: CGFloat { sizeChoice.scale }

    static let `default` = AppTypography(sizeChoice: .medium, familyChoice: .system)

    func font(_ textStyle: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        let size = basePointSize(for: textStyle) * scale
        if let family = familyChoice.resolvedFamilyName() {
            // Custom family: size only (weight mapped via system when unavailable).
            return Font.custom(family, size: size)
        }
        return Font.system(size: size, weight: weight, design: .default)
    }

    var title: Font { font(.title, weight: .bold) }
    var title2: Font { font(.title2, weight: .bold) }
    var title3: Font { font(.title3, weight: .regular) }
    var headline: Font { font(.headline, weight: .semibold) }
    var body: Font { font(.body, weight: .regular) }
    var bodySemibold: Font { font(.body, weight: .semibold) }
    var callout: Font { font(.callout, weight: .regular) }
    var caption: Font { font(.caption, weight: .regular) }
    var captionSemibold: Font { font(.caption, weight: .semibold) }
    var caption2: Font { font(.caption2, weight: .regular) }
    var caption2Semibold: Font { font(.caption2, weight: .semibold) }

    private func basePointSize(for style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: return 26
        case .title: return 22
        case .title2: return 17
        case .title3: return 15
        case .headline: return 13
        case .body: return 13
        case .callout: return 12
        case .subheadline: return 11
        case .footnote: return 10
        case .caption: return 10
        case .caption2: return 10
        @unknown default: return 13
        }
    }
}

private struct AppTypographyKey: EnvironmentKey {
    static let defaultValue = AppTypography.default
}

extension EnvironmentValues {
    var appTypography: AppTypography {
        get { self[AppTypographyKey.self] }
        set { self[AppTypographyKey.self] = newValue }
    }
}

/// Reads AppStorage and injects `appTypography` into the environment.
struct TypographyEnvironmentModifier: ViewModifier {
    @AppStorage(TypographyStorage.sizeKey) private var sizeRaw = WriterFontSizeChoice.medium.rawValue
    @AppStorage(TypographyStorage.familyKey) private var familyRaw = WriterFontFamilyChoice.system.rawValue

    func body(content: Content) -> some View {
        let size = WriterFontSizeChoice(rawValue: sizeRaw) ?? .medium
        let family = WriterFontFamilyChoice(rawValue: familyRaw) ?? .system
        content.environment(\.appTypography, AppTypography(sizeChoice: size, familyChoice: family))
    }
}

extension View {
    func withAppTypography() -> some View {
        modifier(TypographyEnvironmentModifier())
    }
}
