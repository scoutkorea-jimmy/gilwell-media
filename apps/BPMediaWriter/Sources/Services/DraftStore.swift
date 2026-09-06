import Foundation

final class DraftStore {
    private let fileURL: URL

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("BPMediaWriter", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("local-draft.json")
    }

    func save(_ draft: LocalDraft) {
        do {
            let data = try JSONEncoder().encode(draft)
            try data.write(to: fileURL, options: [.atomic])
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
