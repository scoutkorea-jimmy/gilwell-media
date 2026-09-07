import SwiftUI

/// World Scouting brand colors (RGB for digital) + shared layout / control tokens.
enum BrandColors {
    // PRIMARY
    static let scoutingPurple = Color(red: 98 / 255, green: 37 / 255, blue: 153 / 255) // #622599
    static let canvasWhite = Color(red: 1, green: 1, blue: 1) // #FFFFFF

    // SECONDARY / SUPPORT
    static let midnightPurple = Color(red: 77 / 255, green: 0, blue: 110 / 255) // #4D006E
    static let blossomPink = Color(red: 1, green: 141 / 255, blue: 1) // #FF8DFF
    static let fireRed = Color(red: 1, green: 86 / 255, blue: 85 / 255) // #FF5655
    static let emberOrange = Color(red: 1, green: 174 / 255, blue: 128 / 255) // #FFAE80
    static let oceanBlue = Color(red: 0, green: 148 / 255, blue: 180 / 255) // #0094B4
    static let riverBlue = Color(red: 130 / 255, green: 230 / 255, blue: 222 / 255) // #82E6DE
    static let forestGreen = Color(red: 36 / 255, green: 135 / 255, blue: 55 / 255) // #248737
    static let leafGreen = Color(red: 159 / 255, green: 237 / 255, blue: 143 / 255) // #9FED8F

    // Semantic aliases
    static let brandPrimary = scoutingPurple
    static let brandBackground = canvasWhite
    static let brandSurface = Color(red: 248 / 255, green: 246 / 255, blue: 252 / 255) // subtle purple-tinted surface
    static let brandDanger = fireRed
    static let brandSuccess = forestGreen
    static let brandWarning = emberOrange
    static let brandAccent = oceanBlue

    // Layout tokens — consistent across Dashboard / Posts / Editor panes
    static let cardRadius: CGFloat = 12
    static let chipRadius: CGFloat = 8
    static let panePadding: CGFloat = 16
    static let sectionSpacing: CGFloat = 16
    static let cardPadding: CGFloat = 14
    static let toolbarVerticalPadding: CGFloat = 12

    // Control tokens — unified buttons / hit targets app-wide
    static let buttonHeight: CGFloat = 28
    static let buttonPaddingH: CGFloat = 12
    static let buttonRadius: CGFloat = 8
    static let iconButtonSize: CGFloat = 28
    static let minTapTarget: CGFloat = 28
    static let controlFontSize: CGFloat = 13
}

extension Color {
    static var brandPrimary: Color { BrandColors.brandPrimary }
    static var brandBackground: Color { BrandColors.brandBackground }
    static var brandSurface: Color { BrandColors.brandSurface }
    static var brandDanger: Color { BrandColors.brandDanger }
    static var brandSuccess: Color { BrandColors.brandSuccess }
    static var brandWarning: Color { BrandColors.brandWarning }
    static var brandAccent: Color { BrandColors.brandAccent }
}

// MARK: - Shared Button Styles

/// Primary CTA — Scouting Purple fill.
struct WriterPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: BrandColors.controlFontSize, weight: .semibold))
            .foregroundStyle(Color.white.opacity(labelOpacity(configuration)))
            .padding(.horizontal, BrandColors.buttonPaddingH)
            .frame(minHeight: BrandColors.buttonHeight)
            .background(
                RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                    .fill(BrandColors.scoutingPurple.opacity(fillOpacity(configuration)))
            )
            .opacity(configuration.isPressed ? 0.92 : 1)
    }

    private func fillOpacity(_ configuration: Configuration) -> Double {
        guard isEnabled else { return 0.4 }
        return configuration.isPressed ? 0.88 : 1
    }

    private func labelOpacity(_ configuration: Configuration) -> Double {
        isEnabled ? 1 : 0.7
    }
}

/// Secondary / bordered control.
struct WriterSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: BrandColors.controlFontSize, weight: .medium))
            .foregroundStyle(BrandColors.scoutingPurple.opacity(isEnabled ? 1 : 0.45))
            .padding(.horizontal, BrandColors.buttonPaddingH)
            .frame(minHeight: BrandColors.buttonHeight)
            .background(
                RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                    .fill(BrandColors.brandSurface.opacity(configuration.isPressed ? 1 : 0.65))
            )
            .overlay(
                RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                    .stroke(BrandColors.scoutingPurple.opacity(isEnabled ? 0.35 : 0.18), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.9 : 1)
    }
}

/// Destructive action (delete / logout emphasis).
struct WriterDestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: BrandColors.controlFontSize, weight: .semibold))
            .foregroundStyle(Color.white.opacity(isEnabled ? 1 : 0.65))
            .padding(.horizontal, BrandColors.buttonPaddingH)
            .frame(minHeight: BrandColors.buttonHeight)
            .background(
                RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                    .fill(BrandColors.fireRed.opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.4))
            )
    }
}

/// Icon-only control with consistent hit target (toolbar refresh, overflow, filters).
struct WriterIconButtonStyle: ButtonStyle {
    var bordered: Bool = true
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: BrandColors.controlFontSize, weight: .medium))
            .foregroundStyle(BrandColors.scoutingPurple.opacity(isEnabled ? 1 : 0.4))
            .frame(width: BrandColors.iconButtonSize, height: BrandColors.iconButtonSize)
            .contentShape(Rectangle())
            .background {
                if bordered {
                    RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                        .fill(BrandColors.brandSurface.opacity(configuration.isPressed ? 1 : 0.65))
                        .overlay(
                            RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                                .stroke(BrandColors.scoutingPurple.opacity(isEnabled ? 0.28 : 0.14), lineWidth: 1)
                        )
                } else if configuration.isPressed {
                    RoundedRectangle(cornerRadius: BrandColors.buttonRadius, style: .continuous)
                        .fill(BrandColors.scoutingPurple.opacity(0.1))
                }
            }
            .opacity(configuration.isPressed ? 0.9 : 1)
    }
}

extension ButtonStyle where Self == WriterPrimaryButtonStyle {
    static var writerPrimary: WriterPrimaryButtonStyle { WriterPrimaryButtonStyle() }
}

extension ButtonStyle where Self == WriterSecondaryButtonStyle {
    static var writerSecondary: WriterSecondaryButtonStyle { WriterSecondaryButtonStyle() }
}

extension ButtonStyle where Self == WriterDestructiveButtonStyle {
    static var writerDestructive: WriterDestructiveButtonStyle { WriterDestructiveButtonStyle() }
}

extension ButtonStyle where Self == WriterIconButtonStyle {
    static var writerIcon: WriterIconButtonStyle { WriterIconButtonStyle(bordered: true) }
    static var writerIconPlain: WriterIconButtonStyle { WriterIconButtonStyle(bordered: false) }
}
