import Foundation

enum EditorJSCodec {
    static let version = "2.28.0"

    struct Document: Codable {
        var time: Int64
        var blocks: [Block]
        var version: String
    }

    struct Block: Codable {
        var type: String
        var data: BlockData
    }

    struct BlockData: Codable {
        var text: String?
        var file: FilePayload?
        var caption: String?
        var withBorder: Bool?
        var stretched: Bool?
        var withBackground: Bool?
    }

    struct FilePayload: Codable {
        var url: String
    }

    /// Convert plain TextEditor text + image URLs (http(s) or data:) into Editor.js JSON string.
    static func encode(plainText: String, imageDataURLs: [String] = []) -> String {
        var blocks: [Block] = []
        let paragraphs = plainText
            .replacingOccurrences(of: "\r\n", with: "\n")
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }

        let nonEmpty = paragraphs.filter { !$0.isEmpty }
        if nonEmpty.isEmpty && imageDataURLs.isEmpty {
            blocks.append(Block(type: "paragraph", data: BlockData(text: "")))
        } else {
            for p in nonEmpty {
                blocks.append(Block(type: "paragraph", data: BlockData(text: escapeHTML(p))))
            }
        }
        for url in imageDataURLs where !url.isEmpty {
            blocks.append(
                Block(
                    type: "image",
                    data: BlockData(
                        file: FilePayload(url: url),
                        caption: "",
                        withBorder: false,
                        stretched: false,
                        withBackground: false
                    )
                )
            )
        }
        let doc = Document(
            time: Int64(Date().timeIntervalSince1970 * 1000),
            blocks: blocks,
            version: version
        )
        do {
            let data = try JSONEncoder().encode(doc)
            if let s = String(data: data, encoding: .utf8) {
                return s
            }
        } catch {
            // fall through to safe empty doc
        }
        return "{\"time\":0,\"blocks\":[],\"version\":\"\(version)\"}"
    }

    /// Extract editable plain text and image URLs from an Editor.js JSON string (or legacy plain text).
    static func decode(_ content: String?) -> (text: String, imageURLs: [String]) {
        guard let content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return ("", [])
        }
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("{"), let data = trimmed.data(using: .utf8) else {
            return (content, [])
        }
        do {
            let doc = try JSONDecoder().decode(Document.self, from: data)
            var lines: [String] = []
            var images: [String] = []
            for block in doc.blocks {
                switch block.type {
                case "paragraph", "header":
                    if let text = block.data.text {
                        lines.append(unescapeHTML(text))
                    }
                case "image":
                    if let url = block.data.file?.url {
                        images.append(url)
                    }
                case "list":
                    if let text = block.data.text {
                        lines.append(unescapeHTML(text))
                    }
                default:
                    if let text = block.data.text, !text.isEmpty {
                        lines.append(unescapeHTML(text))
                    }
                }
            }
            return (lines.joined(separator: "\n\n"), images)
        } catch {
            return (content, [])
        }
    }

    private static func escapeHTML(_ s: String) -> String {
        s
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func unescapeHTML(_ s: String) -> String {
        s
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "<br>", with: "\n")
            .replacingOccurrences(of: "<br/>", with: "\n")
            .replacingOccurrences(of: "<br />", with: "\n")
    }
}
