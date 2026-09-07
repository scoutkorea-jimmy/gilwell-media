import SwiftUI

/// World Scouting brand colors (RGB for digital) + shared layout tokens (Figma-aligned).
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
    static let minTapTarget: CGFloat = 28
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
