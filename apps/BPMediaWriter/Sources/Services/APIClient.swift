import Foundation

struct APIError: Error, LocalizedError {
    let message: String
    let statusCode: Int?
    let code: String?
    let retryAfter: Int?

    var errorDescription: String? { message }
}

final class APIClient {
    var baseURL = URL(string: "https://bpmedia.net")!
    var tokenProvider: (() -> String?)?
    var onUnauthorized: (() -> Void)?

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func login(username: String, password: String, turnstileToken: String?) async throws -> LoginResponse {
        var body: [String: Any] = [
            "username": username,
            "password": password
        ]
        if let turnstileToken, !turnstileToken.isEmpty {
            body["cf_turnstile_response"] = turnstileToken
        }
        let data = try await request(
            path: "/api/admin/login",
            method: "POST",
            jsonBody: body,
            authorized: false
        )
        let decoded = try JSONDecoder().decode(LoginResponse.self, from: data)
        guard let token = decoded.token, !token.isEmpty else {
            throw APIError(
                message: decoded.error ?? "로그인할 수 없습니다.",
                statusCode: nil,
                code: decoded.code,
                retryAfter: decoded.retryAfter
            )
        }
        return LoginResponse(
            token: token,
            role: decoded.role,
            user: decoded.user,
            error: decoded.error,
            code: decoded.code,
            retryAfter: decoded.retryAfter
        )
    }

    func fetchPosts(
        query: String,
        category: PostCategory?,
        published: PublishedFilter,
        page: Int,
        limit: Int,
        startDate: String? = nil,
        endDate: String? = nil
    ) async throws -> PostListResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "scope", value: "admin"),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }
        if let category { items.append(URLQueryItem(name: "category", value: category.rawValue)) }
        if let pub = published.queryValue { items.append(URLQueryItem(name: "published", value: pub)) }
        if let startDate { items.append(URLQueryItem(name: "start_date", value: startDate)) }
        if let endDate { items.append(URLQueryItem(name: "end_date", value: endDate)) }
        let data = try await request(path: "/api/posts", method: "GET", query: items)
        return try JSONDecoder().decode(PostListResponse.self, from: data)
    }

    func fetchAdminAnalytics(days: Int = 1) async throws -> AdminAnalyticsResponse {
        let data = try await request(
            path: "/api/admin/analytics",
            method: "GET",
            query: [URLQueryItem(name: "days", value: String(days))]
        )
        return try JSONDecoder().decode(AdminAnalyticsResponse.self, from: data)
    }

    func fetchGeoAudience(days: Int = 1) async throws -> GeoAudienceResponse {
        let data = try await request(
            path: "/api/admin/geo-audience",
            method: "GET",
            query: [URLQueryItem(name: "days", value: String(days))]
        )
        return try JSONDecoder().decode(GeoAudienceResponse.self, from: data)
    }

    func fetchPopularPosts(limit: Int = 5) async throws -> [PostSummary] {
        let data = try await request(
            path: "/api/posts/popular",
            method: "GET",
            query: [URLQueryItem(name: "limit", value: String(limit))]
        )
        if let decoded = try? JSONDecoder().decode(PopularPostsResponse.self, from: data) {
            return decoded.posts ?? []
        }
        if let arr = try? JSONDecoder().decode([PostSummary].self, from: data) {
            return arr
        }
        return []
    }

    func fetchPost(id: Int) async throws -> PostDetail {
        let data = try await request(path: "/api/posts/\(id)", method: "GET")
        if let env = try? JSONDecoder().decode(PostEnvelope.self, from: data) {
            return env.post
        }
        return try JSONDecoder().decode(PostDetail.self, from: data)
    }

    func createPost(payload: PostWritePayload) async throws -> PostDetail {
        let data = try await request(path: "/api/posts", method: "POST", encodable: payload)
        if let env = try? JSONDecoder().decode(PostEnvelope.self, from: data) {
            return env.post
        }
        return try JSONDecoder().decode(PostDetail.self, from: data)
    }

    func updatePost(id: Int, payload: PostWritePayload) async throws -> PostDetail {
        let data = try await request(path: "/api/posts/\(id)", method: "PUT", encodable: payload)
        if let env = try? JSONDecoder().decode(PostEnvelope.self, from: data) {
            return env.post
        }
        return try JSONDecoder().decode(PostDetail.self, from: data)
    }

    func deletePost(id: Int) async throws {
        _ = try await request(path: "/api/posts/\(id)", method: "DELETE")
    }

    func fetchEditors() async throws -> [String: String] {
        let data = try await request(path: "/api/settings/editors", method: "GET")
        let decoded = try JSONDecoder().decode(EditorsResponse.self, from: data)
        return decoded.editors ?? [:]
    }

    func fetchAuthorFallback() async throws -> String? {
        let data = try await request(path: "/api/settings/author", method: "GET")
        if let decoded = try? JSONDecoder().decode(AuthorResponse.self, from: data) {
            return decoded.author ?? decoded.value
        }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return (obj["author"] as? String) ?? (obj["value"] as? String)
        }
        return nil
    }

    func fetchMetaTagPool(limit: Int) async throws -> [String] {
        let data = try await request(
            path: "/api/admin/meta-tag-pool",
            method: "GET",
            query: [URLQueryItem(name: "limit", value: String(limit))]
        )
        let decoded = try JSONDecoder().decode(MetaTagPoolResponse.self, from: data)
        return (decoded.tags ?? []).compactMap { $0.name }.filter { !$0.isEmpty }
    }

    func fetchSpecialFeatures(category: PostCategory) async throws -> [String] {
        let data = try await request(
            path: "/api/posts/special-features",
            method: "GET",
            query: [URLQueryItem(name: "category", value: category.rawValue)]
        )
        if let decoded = try? JSONDecoder().decode(SpecialFeaturesResponse.self, from: data), !decoded.all.isEmpty {
            return decoded.all
        }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["features", "special_features", "items"] {
                if let arr = obj[key] as? [String] { return arr }
            }
        }
        if let arr = try? JSONDecoder().decode([String].self, from: data) {
            return arr
        }
        return []
    }

    // MARK: - Core

    private func request(
        path: String,
        method: String,
        query: [URLQueryItem] = [],
        jsonBody: [String: Any]? = nil,
        encodable: (any Encodable)? = nil,
        authorized: Bool = true
    ) async throws -> Data {
        let root = baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard var components = URLComponents(string: root + path) else {
            throw APIError(message: "잘못된 URL입니다.", statusCode: nil, code: nil, retryAfter: nil)
        }
        if !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else {
            throw APIError(message: "잘못된 URL입니다.", statusCode: nil, code: nil, retryAfter: nil)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if authorized, let token = tokenProvider?(), !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let jsonBody {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        } else if let encodable {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder()
            req.httpBody = try encoder.encode(AnyEncodable(encodable))
        }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "네트워크 응답이 없습니다.", statusCode: nil, code: nil, retryAfter: nil)
        }
        // Login / unauthorized:false paths must NOT clear session on 401.
        if http.statusCode == 401, authorized {
            onUnauthorized?()
        }
        if !(200...299).contains(http.statusCode) {
            if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data) {
                let msg = body.error ?? body.message ?? body.reason ?? "API 오류 (\(http.statusCode))"
                let code = body.code ?? (body.error == "otp_required" ? "otp_required" : nil)
                throw APIError(message: msg, statusCode: http.statusCode, code: code, retryAfter: body.retryAfter)
            }
            let text = String(data: data, encoding: .utf8) ?? ""
            throw APIError(message: text.isEmpty ? "API 오류 (\(http.statusCode))" : text, statusCode: http.statusCode, code: nil, retryAfter: nil)
        }
        return data
    }
}

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) {
        self.encodeFunc = wrapped.encode
    }
    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
