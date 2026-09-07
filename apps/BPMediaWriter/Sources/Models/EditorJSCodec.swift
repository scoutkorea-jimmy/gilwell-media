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
        var items: [ListItem]?      // list / checklist
        var content: [[String]]?    // table

        enum CodingKeys: String, CodingKey {
            case text, file, caption, withBorder, stretched, withBackground, items, content
        }

        init(
            text: String? = nil,
            file: FilePayload? = nil,
            caption: String? = nil,
            withBorder: Bool? = nil,
            stretched: Bool? = nil,
            withBackground: Bool? = nil,
            items: [ListItem]? = nil,
            content: [[String]]? = nil
        ) {
            self.text = text
            self.file = file
            self.caption = caption
            self.withBorder = withBorder
            self.stretched = stretched
            self.withBackground = withBackground
            self.items = items
            self.content = content
        }

        /// 낯선 스키마를 만나도 블록 하나 때문에 글 전체 디코딩이 깨지지 않도록 한 필드씩 느슨하게 읽는다.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? nil
            file = (try? c.decodeIfPresent(FilePayload.self, forKey: .file)) ?? nil
            caption = (try? c.decodeIfPresent(String.self, forKey: .caption)) ?? nil
            withBorder = (try? c.decodeIfPresent(Bool.self, forKey: .withBorder)) ?? nil
            stretched = (try? c.decodeIfPresent(Bool.self, forKey: .stretched)) ?? nil
            withBackground = (try? c.decodeIfPresent(Bool.self, forKey: .withBackground)) ?? nil
            items = (try? c.decodeIfPresent([ListItem].self, forKey: .items)) ?? nil
            content = (try? c.decodeIfPresent([[String]].self, forKey: .content)) ?? nil
        }
    }

    /// Editor.js 목록 항목 — 평문(`"항목"`)과 중첩 객체(`{content, items}`) 양쪽을 받는다.
    struct ListItem: Codable {
        var text: String
        var children: [ListItem]

        enum CodingKeys: String, CodingKey { case content, text, items }

        init(from decoder: Decoder) throws {
            if let s = try? decoder.singleValueContainer().decode(String.self) {
                text = s
                children = []
                return
            }
            let c = try decoder.container(keyedBy: CodingKeys.self)
            text = ((try? c.decodeIfPresent(String.self, forKey: .content)) ?? nil)
                ?? ((try? c.decodeIfPresent(String.self, forKey: .text)) ?? nil)
                ?? ""
            children = ((try? c.decodeIfPresent([ListItem].self, forKey: .items)) ?? nil) ?? []
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.singleValueContainer()
            try c.encode(text)
        }
    }

    struct FilePayload: Codable {
        var url: String
    }

    /// Convert plain TextEditor text + image URLs (http(s) or data:) into Editor.js JSON string.
    /// Matches web `_createParagraphBlocks`: split on blank lines (`\n\n`) for paragraph
    /// blocks; within a paragraph, single `\n` becomes `<br>` (site renderer rhythm).
    static func encode(plainText: String, imageDataURLs: [String] = []) -> String {
        var blocks: [Block] = []
        let normalized = plainText
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if normalized.isEmpty && imageDataURLs.isEmpty {
            blocks.append(Block(type: "paragraph", data: BlockData(text: "")))
        } else if !normalized.isEmpty {
            let paragraphs = splitParagraphs(normalized)
            for p in paragraphs {
                let withBreaks = escapeHTML(p).replacingOccurrences(of: "\n", with: "<br>")
                blocks.append(Block(type: "paragraph", data: BlockData(text: withBreaks)))
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
                case "list", "checklist":
                    // 목록은 편집창에 그대로 보여 준다 — 안 보이면 본문을 고칠 때 통째로 사라진다.
                    if let items = block.data.items, !items.isEmpty {
                        lines.append(contentsOf: flattenListItems(items, depth: 0))
                    } else if let text = block.data.text {
                        lines.append(unescapeHTML(text))
                    }
                case "table":
                    if let rows = block.data.content, !rows.isEmpty {
                        for row in rows where !row.isEmpty {
                            lines.append(unescapeHTML(row.joined(separator: " | ")))
                        }
                    } else if let text = block.data.text {
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

    /// 중첩 목록을 들여쓰기 붙인 줄로 편다.
    private static func flattenListItems(_ items: [ListItem], depth: Int) -> [String] {
        var out: [String] = []
        let indent = String(repeating: "  ", count: depth)
        for item in items {
            let text = unescapeHTML(item.text).trimmingCharacters(in: .whitespaces)
            if !text.isEmpty {
                out.append("\(indent)- \(text)")
            }
            if !item.children.isEmpty {
                out.append(contentsOf: flattenListItems(item.children, depth: depth + 1))
            }
        }
        return out
    }

    /// Blank line (`\n\n+`) = paragraph break; keep single newlines inside a chunk.
    private static func splitParagraphs(_ text: String) -> [String] {
        var parts: [String] = []
        var current: [String] = []
        let lines = text.components(separatedBy: "\n")
        for line in lines {
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                if !current.isEmpty {
                    parts.append(current.joined(separator: "\n"))
                    current = []
                }
            } else {
                current.append(line)
            }
        }
        if !current.isEmpty {
            parts.append(current.joined(separator: "\n"))
        }
        return parts.isEmpty ? [""] : parts
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
