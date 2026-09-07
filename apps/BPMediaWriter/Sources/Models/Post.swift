import Foundation

enum PostCategory: String, CaseIterable, Identifiable, Codable {
    case korea, apr, wosm, people

    var id: String { rawValue }

    var titleKO: String {
        switch self {
        case .korea: return "한국스카우트 소식"
        case .apr: return "아시아-태평양 스카우트 소식"
        case .wosm: return "세계의 스카우트 소식"
        case .people: return "스카우트 인물"
        }
    }

    /// Homepage-nav Korean label for a raw API category string.
    static func displayTitle(for raw: String?) -> String {
        guard let raw, !raw.isEmpty else { return "-" }
        if let cat = PostCategory(rawValue: raw) { return cat.titleKO }
        return raw
    }
}

struct PostSummary: Identifiable, Codable, Hashable {
    let id: Int
    var category: String?
    var title: String?
    var subtitle: String?
    var imageURL: String?
    var createdAt: String?
    var publishAt: String?
    var updatedAt: String?
    var author: String?
    var published: Bool?
    var publishedInt: Int?
    var specialFeature: String?
    var metaTags: String?
    var views: Int?

    enum CodingKeys: String, CodingKey {
        case id, category, title, subtitle, author, views
        case imageURL = "image_url"
        case createdAt = "created_at"
        case publishAt = "publish_at"
        case updatedAt = "updated_at"
        case published
        case specialFeature = "special_feature"
        case metaTags = "meta_tags"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        imageURL = try c.decodeIfPresent(String.self, forKey: .imageURL)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        publishAt = try c.decodeIfPresent(String.self, forKey: .publishAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        author = try c.decodeIfPresent(String.self, forKey: .author)
        specialFeature = try c.decodeIfPresent(String.self, forKey: .specialFeature)
        metaTags = try c.decodeIfPresent(String.self, forKey: .metaTags)
        views = try c.decodeIfPresent(Int.self, forKey: .views)
        if let b = try? c.decodeIfPresent(Bool.self, forKey: .published) {
            published = b
            publishedInt = b ? 1 : 0
        } else if let i = try? c.decodeIfPresent(Int.self, forKey: .published) {
            publishedInt = i
            published = i == 1
        } else {
            published = nil
            publishedInt = nil
        }
    }

    var isPublished: Bool { published == true || publishedInt == 1 }

    var displayDate: String {
        publishAt ?? createdAt ?? ""
    }

    var viewsLabel: String {
        let n = views ?? 0
        return Self.viewsFormatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    private static let viewsFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "ko_KR")
        return f
    }()
}

struct PostDetail: Identifiable, Codable, Hashable {
    let id: Int
    var category: String?
    var title: String?
    var subtitle: String?
    var content: String?
    var imageURL: String?
    var imageCaption: String?
    var author: String?
    var metaTags: String?
    var specialFeature: String?
    var published: Bool?
    var publishedInt: Int?
    var publishAt: String?
    var updatedAt: String?
    var createdAt: String?
    var views: Int?

    enum CodingKeys: String, CodingKey {
        case id, category, title, subtitle, content, author, published, views
        case imageURL = "image_url"
        case imageCaption = "image_caption"
        case metaTags = "meta_tags"
        case specialFeature = "special_feature"
        case publishAt = "publish_at"
        case updatedAt = "updated_at"
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        imageURL = try c.decodeIfPresent(String.self, forKey: .imageURL)
        imageCaption = try c.decodeIfPresent(String.self, forKey: .imageCaption)
        author = try c.decodeIfPresent(String.self, forKey: .author)
        metaTags = try c.decodeIfPresent(String.self, forKey: .metaTags)
        specialFeature = try c.decodeIfPresent(String.self, forKey: .specialFeature)
        publishAt = try c.decodeIfPresent(String.self, forKey: .publishAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        views = try c.decodeIfPresent(Int.self, forKey: .views)
        if let b = try? c.decodeIfPresent(Bool.self, forKey: .published) {
            published = b
            publishedInt = b ? 1 : 0
        } else if let i = try? c.decodeIfPresent(Int.self, forKey: .published) {
            publishedInt = i
            published = i == 1
        } else {
            published = nil
            publishedInt = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(category, forKey: .category)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(subtitle, forKey: .subtitle)
        try c.encodeIfPresent(content, forKey: .content)
        try c.encodeIfPresent(imageURL, forKey: .imageURL)
        try c.encodeIfPresent(imageCaption, forKey: .imageCaption)
        try c.encodeIfPresent(author, forKey: .author)
        try c.encodeIfPresent(metaTags, forKey: .metaTags)
        try c.encodeIfPresent(specialFeature, forKey: .specialFeature)
        try c.encodeIfPresent(publishAt, forKey: .publishAt)
        try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
        try c.encodeIfPresent(views, forKey: .views)
        try c.encodeIfPresent(publishedInt ?? (published == true ? 1 : 0), forKey: .published)
    }

    var isPublished: Bool { published == true || publishedInt == 1 }

    var viewsLabel: String {
        let n = views ?? 0
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "ko_KR")
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}

struct PostListResponse: Codable {
    let posts: [PostSummary]
    let total: Int
    let page: Int?
    let pageSize: Int?
}

struct PostEnvelope: Codable {
    let post: PostDetail
}

struct PostWritePayload: Encodable {
    var title: String
    var subtitle: String?
    var category: String
    var content: String
    var author: String?
    var metaTags: String?
    var specialFeature: String?
    var published: Bool
    var publishAt: String?
    var imageData: String?
    var imageURL: String?
    var imageCaption: String?
    var expectedUpdatedAt: String?

    enum CodingKeys: String, CodingKey {
        case title, subtitle, category, content, author, published
        case metaTags = "meta_tags"
        case specialFeature = "special_feature"
        case publishAt = "publish_at"
        case imageData = "image_data"
        case imageURL = "image_url"
        case imageCaption = "image_caption"
        case expectedUpdatedAt = "expected_updated_at"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(title, forKey: .title)
        try c.encodeIfPresent(subtitle, forKey: .subtitle)
        try c.encode(category, forKey: .category)
        try c.encode(content, forKey: .content)
        try c.encodeIfPresent(author, forKey: .author)
        try c.encodeIfPresent(metaTags, forKey: .metaTags)
        try c.encodeIfPresent(specialFeature, forKey: .specialFeature)
        try c.encode(published, forKey: .published)
        try c.encodeIfPresent(publishAt, forKey: .publishAt)
        try c.encodeIfPresent(imageData, forKey: .imageData)
        try c.encodeIfPresent(imageURL, forKey: .imageURL)
        try c.encodeIfPresent(imageCaption, forKey: .imageCaption)
        try c.encodeIfPresent(expectedUpdatedAt, forKey: .expectedUpdatedAt)
    }
}

struct LocalDraft: Codable, Equatable {
    var title: String = ""
    var subtitle: String = ""
    var category: String = PostCategory.korea.rawValue
    var bodyText: String = ""
    var author: String = "Editor.A"
    var metaTags: String = ""
    var specialFeature: String = ""
    var publishMode: String = PublishMode.immediate.rawValue
    var publishAt: String = ""
    var coverDataURL: String?
    var imageCaption: String = ""
    var bodyImageDataURLs: [String] = []
    var editingPostID: Int?
    var expectedUpdatedAt: String?
    /// Server `/api/admin/drafts` row id when online autosave succeeded.
    var serverDraftID: Int?

    enum CodingKeys: String, CodingKey {
        case title, subtitle, category, bodyText, author, metaTags, specialFeature
        case publishMode, publishAt, coverDataURL, imageCaption, bodyImageDataURLs
        case editingPostID, expectedUpdatedAt, serverDraftID
    }

    init(
        title: String = "",
        subtitle: String = "",
        category: String = PostCategory.korea.rawValue,
        bodyText: String = "",
        author: String = "Editor.A",
        metaTags: String = "",
        specialFeature: String = "",
        publishMode: String = PublishMode.immediate.rawValue,
        publishAt: String = "",
        coverDataURL: String? = nil,
        imageCaption: String = "",
        bodyImageDataURLs: [String] = [],
        editingPostID: Int? = nil,
        expectedUpdatedAt: String? = nil,
        serverDraftID: Int? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.category = category
        self.bodyText = bodyText
        self.author = author
        self.metaTags = metaTags
        self.specialFeature = specialFeature
        self.publishMode = publishMode
        self.publishAt = publishAt
        self.coverDataURL = coverDataURL
        self.imageCaption = imageCaption
        self.bodyImageDataURLs = bodyImageDataURLs
        self.editingPostID = editingPostID
        self.expectedUpdatedAt = expectedUpdatedAt
        self.serverDraftID = serverDraftID
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle) ?? ""
        category = try c.decodeIfPresent(String.self, forKey: .category) ?? PostCategory.korea.rawValue
        bodyText = try c.decodeIfPresent(String.self, forKey: .bodyText) ?? ""
        author = try c.decodeIfPresent(String.self, forKey: .author) ?? "Editor.A"
        metaTags = try c.decodeIfPresent(String.self, forKey: .metaTags) ?? ""
        specialFeature = try c.decodeIfPresent(String.self, forKey: .specialFeature) ?? ""
        publishMode = try c.decodeIfPresent(String.self, forKey: .publishMode) ?? PublishMode.immediate.rawValue
        publishAt = try c.decodeIfPresent(String.self, forKey: .publishAt) ?? ""
        coverDataURL = try c.decodeIfPresent(String.self, forKey: .coverDataURL)
        imageCaption = try c.decodeIfPresent(String.self, forKey: .imageCaption) ?? ""
        bodyImageDataURLs = try c.decodeIfPresent([String].self, forKey: .bodyImageDataURLs) ?? []
        editingPostID = try c.decodeIfPresent(Int.self, forKey: .editingPostID)
        expectedUpdatedAt = try c.decodeIfPresent(String.self, forKey: .expectedUpdatedAt)
        serverDraftID = try c.decodeIfPresent(Int.self, forKey: .serverDraftID)
    }
}

// MARK: - Server drafts

struct ServerDraft: Identifiable, Codable, Hashable {
    let id: Int
    var editingPostId: Int?
    var title: String?
    var subtitle: String?
    var category: String?
    var metaTags: String?
    var author: String?
    var publishAt: String?
    var imageURL: String?
    var imageCaption: String?
    var specialFeature: String?
    var content: String?
    var publishedFlag: Bool?
    var updatedAt: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, category, author, content
        case editingPostId = "editing_post_id"
        case metaTags = "meta_tags"
        case publishAt = "publish_at"
        case imageURL = "image_url"
        case imageCaption = "image_caption"
        case specialFeature = "special_feature"
        case publishedFlag = "published_flag"
        case updatedAt = "updated_at"
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        metaTags = try c.decodeIfPresent(String.self, forKey: .metaTags)
        author = try c.decodeIfPresent(String.self, forKey: .author)
        publishAt = try c.decodeIfPresent(String.self, forKey: .publishAt)
        imageURL = try c.decodeIfPresent(String.self, forKey: .imageURL)
        imageCaption = try c.decodeIfPresent(String.self, forKey: .imageCaption)
        specialFeature = try c.decodeIfPresent(String.self, forKey: .specialFeature)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        if let b = try? c.decodeIfPresent(Bool.self, forKey: .publishedFlag) {
            publishedFlag = b
        } else if let i = try? c.decodeIfPresent(Int.self, forKey: .publishedFlag) {
            publishedFlag = i == 1
        } else {
            publishedFlag = nil
        }
        if let i = try? c.decodeIfPresent(Int.self, forKey: .editingPostId) {
            editingPostId = i
        } else if let s = try? c.decodeIfPresent(String.self, forKey: .editingPostId), let i = Int(s) {
            editingPostId = i
        } else {
            editingPostId = nil
        }
    }
}

struct ServerDraftListResponse: Codable {
    let drafts: [ServerDraft]?
    let maxDrafts: Int?
    let ttlDays: Int?

    enum CodingKeys: String, CodingKey {
        case drafts
        case maxDrafts = "max_drafts"
        case ttlDays = "ttl_days"
    }
}

struct ServerDraftEnvelope: Codable {
    let draft: ServerDraft?
}

struct ServerDraftPayload: Encodable {
    var editingPostId: Int?
    var title: String
    var subtitle: String?
    var category: String
    var metaTags: String?
    var author: String?
    var publishAt: String?
    var imageURL: String?
    var imageCaption: String?
    var specialFeature: String?
    var content: String
    var publishedFlag: Bool

    enum CodingKeys: String, CodingKey {
        case title, subtitle, category, author, content
        case editingPostId = "editing_post_id"
        case metaTags = "meta_tags"
        case publishAt = "publish_at"
        case imageURL = "image_url"
        case imageCaption = "image_caption"
        case specialFeature = "special_feature"
        case publishedFlag = "published_flag"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(editingPostId, forKey: .editingPostId)
        try c.encode(title, forKey: .title)
        try c.encodeIfPresent(subtitle, forKey: .subtitle)
        try c.encode(category, forKey: .category)
        try c.encodeIfPresent(metaTags, forKey: .metaTags)
        try c.encodeIfPresent(author, forKey: .author)
        try c.encodeIfPresent(publishAt, forKey: .publishAt)
        try c.encodeIfPresent(imageURL, forKey: .imageURL)
        try c.encodeIfPresent(imageCaption, forKey: .imageCaption)
        try c.encodeIfPresent(specialFeature, forKey: .specialFeature)
        try c.encode(content, forKey: .content)
        try c.encode(publishedFlag, forKey: .publishedFlag)
    }
}

enum PublishMode: String, CaseIterable, Identifiable {
    case immediate
    case schedule
    case hold

    var id: String { rawValue }

    var titleKO: String {
        switch self {
        case .immediate: return "즉시 공개"
        case .schedule: return "예약 공개"
        case .hold: return "비공개 보관"
        }
    }
}
