import Foundation

// MARK: - Admin analytics (GET /api/admin/analytics)

struct AdminAnalyticsResponse: Decodable {
    var today: AnalyticsToday?
    var summary: AnalyticsSummary?
    var visitors: AnalyticsVisitors?
    var views: AnalyticsViewsBlock?
    var counts: AnalyticsCounts?
    var articleTopPosts: [AnalyticsTopPost]?
    var topPosts: [AnalyticsTopPost]?
    var trackingNote: String?

    enum CodingKeys: String, CodingKey {
        case today, summary, visitors, views, counts
        case articleTopPosts = "article_top_posts"
        case topPosts = "top_posts"
        case trackingNote = "tracking_note"
    }

    var resolvedTodayVisits: Int {
        today?.visits
            ?? visitors?.todayVisits
            ?? summary?.todayVisits
            ?? 0
    }

    var resolvedTodayViews: Int {
        today?.views
            ?? summary?.todayPageviews
            ?? summary?.todayViews
            ?? views?.today
            ?? 0
    }

    var resolvedTopPosts: [AnalyticsTopPost] {
        if let articleTopPosts, !articleTopPosts.isEmpty { return articleTopPosts }
        if let topPosts, !topPosts.isEmpty { return topPosts }
        return []
    }
}

struct AnalyticsToday: Decodable {
    var visits: Int?
    var views: Int?

    enum CodingKeys: String, CodingKey { case visits, views }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        visits = Self.decodeFlexibleInt(c, forKey: .visits)
        views = Self.decodeFlexibleInt(c, forKey: .views)
    }

    private static func decodeFlexibleInt(_ c: KeyedDecodingContainer<CodingKeys>, forKey key: CodingKeys) -> Int? {
        if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return i }
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return Int(d) }
        if let s = try? c.decodeIfPresent(String.self, forKey: key), let i = Int(s) { return i }
        return nil
    }
}

struct AnalyticsSummary: Decodable {
    var todayVisits: Int?
    var todayPageviews: Int?
    var todayViews: Int?
    var visits: Int?
    var pageviews: Int?

    enum CodingKeys: String, CodingKey {
        case todayVisits = "today_visits"
        case todayPageviews = "today_pageviews"
        case todayViews = "today_views"
        case visits, pageviews
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        todayVisits = flexInt(c, .todayVisits)
        todayPageviews = flexInt(c, .todayPageviews)
        todayViews = flexInt(c, .todayViews)
        visits = flexInt(c, .visits)
        pageviews = flexInt(c, .pageviews)
    }
}

struct AnalyticsVisitors: Decodable {
    var todayVisits: Int?
    enum CodingKeys: String, CodingKey { case todayVisits = "today_visits" }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        todayVisits = flexInt(c, .todayVisits)
    }
}

struct AnalyticsViewsBlock: Decodable {
    var today: Int?
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        today = flexInt(c, .today)
    }
    enum CodingKeys: String, CodingKey { case today }
}

struct AnalyticsCounts: Decodable {
    var total: Int?
    var published: Int?
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        total = flexInt(c, .total)
        published = flexInt(c, .published)
    }
    enum CodingKeys: String, CodingKey { case total, published }
}

struct AnalyticsTopPost: Decodable, Identifiable {
    var postID: Int?
    var title: String?
    var views: Int?
    var pageviews: Int?
    var path: String?

    var id: String {
        if let postID { return "post-\(postID)" }
        if let path, !path.isEmpty { return "path-\(path)" }
        return "title-\(title ?? "unknown")"
    }
    var displayViews: Int { views ?? pageviews ?? 0 }

    enum CodingKeys: String, CodingKey {
        case postID = "id"
        case title, views, pageviews, path
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        postID = flexInt(c, .postID)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        views = flexInt(c, .views)
        pageviews = flexInt(c, .pageviews)
        path = try c.decodeIfPresent(String.self, forKey: .path)
    }
}

// MARK: - Geo audience

struct GeoAudienceResponse: Decodable {
    var summary: GeoAudienceSummary?
    var countries: [GeoCountryRow]?
    var trackingNote: String?
    var warmupNote: String?

    enum CodingKeys: String, CodingKey {
        case summary, countries
        case trackingNote = "tracking_note"
        case warmupNote = "warmup_note"
    }
}

struct GeoAudienceSummary: Decodable {
    var countries: Int?
    var cities: Int?
    var visits: Int?
    var pageviews: Int?
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        countries = flexInt(c, .countries)
        cities = flexInt(c, .cities)
        visits = flexInt(c, .visits)
        pageviews = flexInt(c, .pageviews)
    }
    enum CodingKeys: String, CodingKey { case countries, cities, visits, pageviews }
}

struct GeoCountryRow: Decodable, Identifiable {
    var countryCode: String?
    var countryName: String?
    var visits: Int?
    var pageviews: Int?
    var cityCount: Int?

    var id: String { countryCode ?? countryName ?? UUID().uuidString }
    var displayName: String { countryName ?? countryCode ?? "Unknown" }

    enum CodingKeys: String, CodingKey {
        case countryCode = "country_code"
        case countryName = "country_name"
        case visits, pageviews
        case cityCount = "city_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        countryCode = try c.decodeIfPresent(String.self, forKey: .countryCode)
        countryName = try c.decodeIfPresent(String.self, forKey: .countryName)
        visits = flexInt(c, .visits)
        pageviews = flexInt(c, .pageviews)
        cityCount = flexInt(c, .cityCount)
    }
}

struct PopularPostsResponse: Decodable {
    var posts: [PostSummary]?
    var total: Int?
}

// MARK: - Flexible number decode helpers

private func flexInt<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int? {
    if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return i }
    if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return Int(d) }
    if let s = try? c.decodeIfPresent(String.self, forKey: key), let i = Int(s) { return i }
    return nil
}
