import Foundation

final class DraftStore {
    private let fileURL: URL
    /// Skip persisting individual data-URL images larger than this into Application Support.
    private let maxImageBytesForDraft = 200_000

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dir = base.appendingPathComponent("BPMediaWriter", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("local-draft.json")
    }

    func save(_ draft: LocalDraft) {
        var slim = draft
        // Never autosave multi-MB data URLs. Keep remote http(s) cover refs; drop huge body data URLs.
        if let cover = slim.coverDataURL, cover.hasPrefix("data:"),
           ImageCompressor.approximateByteLength(ofDataURL: cover) > maxImageBytesForDraft {
            slim.coverDataURL = nil
        }
        slim.bodyImageDataURLs = slim.bodyImageDataURLs.filter { url in
            if url.hasPrefix("http://") || url.hasPrefix("https://") { return true }
            if url.hasPrefix("data:") {
                return ImageCompressor.approximateByteLength(ofDataURL: url) <= maxImageBytesForDraft
            }
            return false
        }
        // Edit sessions: do not persist body/cover image payloads at all (server already has them).
        if slim.editingPostID != nil {
            slim.coverDataURL = slim.coverDataURL?.hasPrefix("http") == true ? slim.coverDataURL : nil
            slim.bodyImageDataURLs = slim.bodyImageDataURLs.filter {
                $0.hasPrefix("http://") || $0.hasPrefix("https://")
            }
        }
        do {
            let data = try JSONEncoder().encode(slim)
            // Hard cap entire draft file ~1.5MB
            if data.count > 1_500_000 {
                slim.coverDataURL = nil
                slim.bodyImageDataURLs = []
                let textOnly = try JSONEncoder().encode(slim)
                try textOnly.write(to: fileURL, options: [.atomic])
            } else {
                try data.write(to: fileURL, options: [.atomic])
            }
        } catch {
            // Best-effort autosave
        }
    }

    func load() -> LocalDraft? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(LocalDraft.self, from: data)
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
