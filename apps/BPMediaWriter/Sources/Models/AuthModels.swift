import Foundation

struct AuthUser: Codable, Hashable {
    let id: Int?
    let username: String?
    let displayName: String?
    let role: String?
    let mustChangePassword: Bool?

    enum CodingKeys: String, CodingKey {
        case id, username, role
        case displayName = "display_name"
        case mustChangePassword = "must_change_password"
    }
}

struct LoginResponse: Codable {
    let token: String?
    let role: String?
    let user: AuthUser?
    let error: String?
    let code: String?
    let retryAfter: Int?

    enum CodingKeys: String, CodingKey {
        case token, role, user, error, code
        case retryAfter = "retry_after"
    }
}

struct EditorsResponse: Codable {
    let editors: [String: String]?
}

struct AuthorResponse: Codable {
    let author: String?
    let value: String?
}

struct MetaTagPoolResponse: Codable {
    let tags: [MetaTagItem]?
}

struct MetaTagItem: Codable {
    let name: String?
    let count: Int?
}

struct SpecialFeaturesResponse: Codable {
    let features: [String]?
    let specialFeatures: [String]?
    let items: [String]?

    enum CodingKeys: String, CodingKey {
        case features, items
        case specialFeatures = "special_features"
    }

    var all: [String] {
        features ?? specialFeatures ?? items ?? []
    }
}

struct APIErrorBody: Codable {
    let error: String?
    let code: String?
    let message: String?
    let retryAfter: Int?
    let reason: String?

    enum CodingKeys: String, CodingKey {
        case error, code, message, reason
        case retryAfter = "retry_after"
    }
}
