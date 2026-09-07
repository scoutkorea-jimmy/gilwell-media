import Foundation

/// Compares local MARKETING_VERSION against remote `mac_writer_version`.
enum UpdateChecker {
    struct RemoteVersion: Decodable {
        var macWriterVersion: String?
        var siteVersion: String?
        var adminVersion: String?

        enum CodingKeys: String, CodingKey {
            case macWriterVersion = "mac_writer_version"
            case siteVersion = "site_version"
            case adminVersion = "admin_version"
        }
    }

    static var localVersion: String {
        let short = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let trimmed = short?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "0" : trimmed
    }

    /// Fetch remote mac writer version from `/api/version`, falling back to static file.
    static func fetchRemoteVersion(session: URLSession = .shared, baseURL: URL = URL(string: "https://bpmedia.net")!) async -> String? {
        if let fromAPI = await fetchFromAPI(session: session, baseURL: baseURL) {
            return fromAPI
        }
        return await fetchFromStaticFile(session: session, baseURL: baseURL)
    }

    private static func fetchFromAPI(session: URLSession, baseURL: URL) async -> String? {
        let url = baseURL.appendingPathComponent("api/version")
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 12
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return nil
            }
            let decoded = try JSONDecoder().decode(RemoteVersion.self, from: data)
            let v = decoded.macWriterVersion?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (v?.isEmpty == false) ? v : nil
        } catch {
            return nil
        }
    }

    private static func fetchFromStaticFile(session: URLSession, baseURL: URL) async -> String? {
        let url = baseURL.appendingPathComponent("MAC_WRITER_VERSION")
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 12
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return nil
            }
            let text = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (text?.isEmpty == false) ? text : nil
        } catch {
            return nil
        }
    }

    /// true when remote is strictly newer than local (dot-separated numeric segments).
    static func isRemoteNewer(_ remote: String, than local: String) -> Bool {
        let r = parse(remote)
        let l = parse(local)
        let count = max(r.count, l.count)
        for i in 0..<count {
            let rv = i < r.count ? r[i] : 0
            let lv = i < l.count ? l[i] : 0
            if rv != lv { return rv > lv }
        }
        return false
    }

    private static func parse(_ raw: String) -> [Int] {
        raw.split(separator: ".").map { Int($0.filter(\.isNumber)) ?? 0 }
    }
}
