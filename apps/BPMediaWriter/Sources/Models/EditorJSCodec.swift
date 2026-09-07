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
                if block.type == "image" {
                    if let url = block.data.file?.url {
                        images.append(url)
                    }
                    continue
                }
                lines.append(contentsOf: textChunks(of: block))
            }
            return (lines.joined(separator: "\n\n"), images)
        } catch {
            return (content, [])
        }
    }

    /// 한 블록이 편집창에 내보내는 문단 조각들. `decode` 와 `merge` 가 같은 규칙을 쓴다.
    static func textChunks(of block: Block) -> [String] {
        switch block.type {
        case "image":
            return []
        case "paragraph", "header":
            if let text = block.data.text { return [unescapeHTML(text)] }
            return []
        case "list", "checklist":
            // 목록은 편집창에 그대로 보여 준다 — 안 보이면 본문을 고칠 때 통째로 사라진다.
            if let items = block.data.items, !items.isEmpty {
                return flattenListItems(items, depth: 0)
            }
            if let text = block.data.text { return [unescapeHTML(text)] }
            return []
        case "table":
            if let rows = block.data.content, !rows.isEmpty {
                return rows.filter { !$0.isEmpty }.map { unescapeHTML($0.joined(separator: " | ")) }
            }
            if let text = block.data.text { return [unescapeHTML(text)] }
            return []
        default:
            if let text = block.data.text, !text.isEmpty { return [unescapeHTML(text)] }
            return []
        }
    }

    // MARK: - Merge (본문 수정 시 원본 블록 보존)

    /// 고친 평문과 이미지 목록을 **원본 문서에 되돌려 넣는다.**
    /// 손대지 않은 블록(헤더 레벨·목록·표·이미지 캡션·이미지 위치)은 원본 JSON 그대로 남기고,
    /// 바뀐 문단만 paragraph 블록으로 교체한다. 원본이 없거나 Editor.js JSON 이 아니면 `encode` 로 떨어진다.
    static func merge(original: String?, plainText: String, imageURLs: [String]) -> String {
        guard let original,
              let originalData = original.trimmingCharacters(in: .whitespacesAndNewlines).data(using: .utf8),
              let rootObj = try? JSONSerialization.jsonObject(with: originalData) as? [String: Any],
              let rawBlocks = rootObj["blocks"] as? [[String: Any]],
              let doc = try? JSONDecoder().decode(Document.self, from: originalData),
              doc.blocks.count == rawBlocks.count
        else {
            return encode(plainText: plainText, imageDataURLs: imageURLs)
        }

        let normalized = plainText
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let newParas: [String] = normalized.isEmpty ? [] : splitParagraphs(normalized)
        let norm: (String) -> String = { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let newNorm = newParas.map(norm)

        // 원본 블록별 조각 (이미지는 빈 배열)
        let chunks: [[String]] = doc.blocks.map { textChunks(of: $0).map(norm) }

        func firstMatch(_ seq: [String], from start: Int) -> Int? {
            guard !seq.isEmpty, start <= newNorm.count - seq.count else { return nil }
            var i = start
            while i + seq.count <= newNorm.count {
                if Array(newNorm[i..<(i + seq.count)]) == seq { return i }
                i += 1
            }
            return nil
        }

        func paragraphBlock(_ text: String) -> [String: Any] {
            let withBreaks = escapeHTML(text).replacingOccurrences(of: "\n", with: "<br>")
            return ["type": "paragraph", "data": ["text": withBreaks]]
        }

        var out: [[String: Any]] = []
        var remainingImages = imageURLs
        var j = 0

        for (i, block) in doc.blocks.enumerated() {
            let raw = rawBlocks[i]
            if block.type == "image" {
                guard let url = block.data.file?.url, let idx = remainingImages.firstIndex(of: url) else {
                    continue // 사용자가 지운 이미지
                }
                remainingImages.remove(at: idx)
                out.append(raw)
                continue
            }
            let seq = chunks[i]
            if seq.isEmpty {
                out.append(raw) // 편집창에 안 보이는 블록(구분선 등)은 그대로
                continue
            }
            if let pos = firstMatch(seq, from: j), pos == j {
                out.append(raw) // 손대지 않은 블록 — 원본 그대로
                j += seq.count
                continue
            }
            // 이 블록은 바뀌었거나 지워졌다. 다음에 살아남은 블록이 새 본문 어디에 있는지 찾아
            // 그 앞까지를 새 문단으로 내보낸다.
            var anchor: Int? = nil
            for k in (i + 1)..<doc.blocks.count where !chunks[k].isEmpty {
                if let pos = firstMatch(chunks[k], from: j) { anchor = pos; break }
            }
            let upto = anchor ?? newNorm.count
            while j < upto {
                out.append(paragraphBlock(newParas[j]))
                j += 1
            }
        }
        while j < newParas.count {
            out.append(paragraphBlock(newParas[j]))
            j += 1
        }
        for url in remainingImages where !url.isEmpty {
            out.append([
                "type": "image",
                "data": [
                    "file": ["url": url],
                    "caption": "",
                    "withBorder": false,
                    "stretched": false,
                    "withBackground": false
                ]
            ])
        }
        if out.isEmpty {
            out.append(paragraphBlock(""))
        }

        var root = rootObj
        root["blocks"] = out
        root["time"] = Int64(Date().timeIntervalSince1970 * 1000)
        if root["version"] == nil { root["version"] = version }
        if let data = try? JSONSerialization.data(withJSONObject: root, options: [.sortedKeys, .withoutEscapingSlashes]),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return encode(plainText: plainText, imageDataURLs: imageURLs)
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
