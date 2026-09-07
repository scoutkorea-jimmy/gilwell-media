import Foundation

/// API 날짜 문자열을 읽고 KST 로 보여 준다.
///
/// 서버는 두 종류를 섞어 준다 —
/// `created_at` / `updated_at` 은 SQLite `datetime('now')` 이라 **UTC** 벽시계,
/// `publish_at` 은 `normalizePublishAtInput` 이 만든 **KST** 벽시계다.
/// 둘 다 시간대 표기가 없으므로 호출부가 종류를 알려 줘야 한다.
enum APIDates {
    enum Kind {
        case utc
        case kst
    }

    static let kst = TimeZone(identifier: "Asia/Seoul") ?? .current

    static func parse(_ raw: String?, kind: Kind) -> Date? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // 시간대가 붙은 ISO8601 은 그 시간대를 믿는다.
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: trimmed) { return d }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: trimmed) { return d }

        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = kind == .kst ? kst : TimeZone(identifier: "UTC")
        for pattern in [
            "yyyy-MM-dd HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd'T'HH:mm",
            "yyyy-MM-dd"
        ] {
            f.dateFormat = pattern
            if let d = f.date(from: trimmed) { return d }
        }
        return nil
    }

    /// `2026-09-07 14:02` (KST). 못 읽으면 원문을 그대로 돌려준다.
    static func display(_ raw: String?, kind: Kind, withTime: Bool = true) -> String {
        guard let raw, !raw.isEmpty else { return "" }
        guard let date = parse(raw, kind: kind) else { return raw }
        return display(date, withTime: withTime)
    }

    static func display(_ date: Date, withTime: Bool = true) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.timeZone = kst
        f.dateFormat = withTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// `HH:mm` (KST) — 인라인 상태 표시용.
    static func clock(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.timeZone = kst
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    /// KST 벽시계 문자열 — 서버 `publish_at` 형식.
    static func kstWallClock(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = kst
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.string(from: date)
    }

    /// `yyyy-MM-dd` (KST).
    static func kstDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = kst
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
