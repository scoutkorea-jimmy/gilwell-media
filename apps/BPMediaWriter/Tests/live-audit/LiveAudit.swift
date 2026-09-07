import Foundation

func resolveContentJSON(original: String?, body: String, baseline: String,
                        imgs: [String], baseImgs: [String]) -> String {
    let same = body.trimmingCharacters(in: .whitespacesAndNewlines)
        == baseline.trimmingCharacters(in: .whitespacesAndNewlines)
    if let o = original, same, imgs == baseImgs { return o }
    return EditorJSCodec.encode(plainText: body, imageDataURLs: imgs)
}

let fm = FileManager.default
let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/.bpm_posts"
let truthData = try! Data(contentsOf: URL(fileURLWithPath: dir + "/../truth.json"))
let truth = (try! JSONSerialization.jsonObject(with: truthData)) as! [String: [String: Any]]

var total = 0, imgMismatch = 0, emptyText = 0, rawJSONLeak = 0
var unchangedFail = 0, editLostImage = 0, roundtripDrift = 0
var textLoss = 0, lostFragmentCount = 0
var worst: [(String, String)] = []

let fragData = try! Data(contentsOf: URL(fileURLWithPath: dir + "/../fragments.json"))
let fragments = (try! JSONSerialization.jsonObject(with: fragData)) as! [String: [String]]

/// EditorJSCodec.unescapeHTML 과 같은 순서로 푼다 (검사 쪽 독립 구현).
func unescape(_ s: String) -> String {
    s.replacingOccurrences(of: "&quot;", with: "\"")
        .replacingOccurrences(of: "&gt;", with: ">")
        .replacingOccurrences(of: "&lt;", with: "<")
        .replacingOccurrences(of: "&amp;", with: "&")
        .replacingOccurrences(of: "<br>", with: "\n")
        .replacingOccurrences(of: "<br/>", with: "\n")
        .replacingOccurrences(of: "<br />", with: "\n")
}

for f in try! fm.contentsOfDirectory(atPath: dir).sorted() where f.hasSuffix(".json") {
    let pid = String(f.dropLast(5))
    guard let raw = try? Data(contentsOf: URL(fileURLWithPath: "\(dir)/\(f)")),
          let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] else { continue }
    let post = (obj["post"] as? [String: Any]) ?? obj
    guard let content = post["content"] as? String else { continue }
    total += 1

    let d = EditorJSCodec.decode(content)
    let t = truth[pid]
    let expectedImages = (t?["images"] as? [String]) ?? []
    let isJSON = (t?["json"] as? Bool) ?? false

    // ① 이미지 추출이 Python 정답과 일치하는가
    if d.imageURLs != expectedImages {
        imgMismatch += 1
        worst.append((pid, "이미지 불일치: swift=\(d.imageURLs) py=\(expectedImages)"))
    }
    // ② 본문이 비었는가 (내용 있는 글인데 텍스트 0)
    if isJSON && d.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && expectedImages.isEmpty {
        emptyText += 1
        worst.append((pid, "본문이 빈 문자열로 나옴"))
    }
    // ③ 편집창에 원시 JSON 이 새어 나오는가 (디코딩 실패 신호)
    if isJSON && d.text.contains("\"blocks\"") && d.text.contains("\"version\"") {
        rawJSONLeak += 1
        worst.append((pid, "편집창에 원시 JSON 노출"))
    }
    // ④ 미변경 재저장 → 원본 바이트 보존
    let unchanged = resolveContentJSON(original: content, body: d.text, baseline: d.text,
                                       imgs: d.imageURLs, baseImgs: d.imageURLs)
    if unchanged != content { unchangedFail += 1; worst.append((pid, "미변경인데 원본이 안 지켜짐")) }
    // ⑤ 본문 수정 저장 → 이미지 생존
    let edited = resolveContentJSON(original: content, body: d.text + "\n\n덧붙임", baseline: d.text,
                                    imgs: d.imageURLs, baseImgs: d.imageURLs)
    let re = EditorJSCodec.decode(edited)
    if re.imageURLs != d.imageURLs { editLostImage += 1; worst.append((pid, "수정 저장에서 이미지 유실")) }
    // ⑦ 원본의 사람이 읽는 텍스트 조각이 전부 편집창에 살아 있는가 (블록 타입 불문)
    if let frags = fragments[pid] {
        var lost: [String] = []
        for f0 in frags {
            for line in unescape(f0).components(separatedBy: "\n") {
                let needle = line.trimmingCharacters(in: .whitespacesAndNewlines)
                if needle.isEmpty { continue }
                if !d.text.contains(needle) { lost.append(needle) }
            }
        }
        if !lost.isEmpty {
            textLoss += 1
            lostFragmentCount += lost.count
            let sample = lost.prefix(2).map { String($0.prefix(40)) }.joined(separator: " / ")
            worst.append((pid, "텍스트 \(lost.count)조각 유실 → \(sample)"))
        }
    }

    // ⑥ 두 번 저장해도 본문이 흔들리지 않는가
    let once = EditorJSCodec.decode(EditorJSCodec.encode(plainText: d.text, imageDataURLs: d.imageURLs)).text
    let twice = EditorJSCodec.decode(EditorJSCodec.encode(plainText: once, imageDataURLs: d.imageURLs)).text
    if once != twice { roundtripDrift += 1; worst.append((pid, "두 번 저장 시 본문 변동")) }
}

print("운영 기사 \(total)건 전수 검사")
print("  ① 이미지 추출 불일치      : \(imgMismatch)")
print("  ② 본문이 빈 문자열        : \(emptyText)")
print("  ③ 편집창 원시 JSON 노출   : \(rawJSONLeak)")
print("  ④ 미변경인데 원본 미보존  : \(unchangedFail)")
print("  ⑤ 수정 저장에서 이미지 유실: \(editLostImage)")
print("  ⑥ 두 번 저장 시 본문 변동 : \(roundtripDrift)")
print("  ⑦ 원본 텍스트 조각 유실   : \(textLoss)건 (조각 \(lostFragmentCount)개)")
if !worst.isEmpty {
    print("\n문제 사례 (최대 12건):")
    for (pid, msg) in worst.prefix(12) { print("  · id \(pid) — \(msg)") }
}
let fail = imgMismatch + emptyText + rawJSONLeak + unchangedFail + editLostImage + roundtripDrift + textLoss
print("\n════ 문제 총 \(fail)건 ════")
exit(fail == 0 ? 0 : 1)
