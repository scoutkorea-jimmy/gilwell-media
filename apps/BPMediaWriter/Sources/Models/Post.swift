import Foundation

enum PostCategory: String, CaseIterable, Identifiable, Codable {
    case korea, apr, wosm, people

    var id: String { rawValue }

    var titleKO: String {
        switch self {
        case .korea: return "Korea"
        case .apr: return "APR"
        case .wosm: return "WOSM"
        case .people: return "People"
        }
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

    enum CodingKeys: String, CodingKey {
        case id, category, title, subtitle, content, author, published
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
        try c.encodeIfPresent(publishedInt ?? (published == true ? 1 : 0), forKey: .published)
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
    var expectedUpdatedAt: String?

    enum CodingKeys: String, CodingKey {
        case title, subtitle, category, content, author, published
        case metaTags = "meta_tags"
        case specialFeature = "special_feature"
        case publishAt = "publish_at"
        case imageData = "image_data"
        case imageURL = "image_url"
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
    var bodyImageDataURLs: [String] = []
    var editingPostID: Int?
    var expectedUpdatedAt: String?
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
