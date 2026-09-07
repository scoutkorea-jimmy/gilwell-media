import Foundation

func resolveContentJSON(originalContentJSON: String?, bodyText: String, baselineBodyText: String,
                        imageURLs: [String], baselineImageURLs: [String]) -> String {
    let textSame = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        == baselineBodyText.trimmingCharacters(in: .whitespacesAndNewlines)
    if let original = originalContentJSON, textSame, imageURLs == baselineImageURLs { return original }
    return EditorJSCodec.merge(original: originalContentJSON, plainText: bodyText, imageURLs: imageURLs)
}
var pass = 0, fail = 0
func check(_ n: String, _ ok: Bool, _ d: String = "") {
    if ok { pass += 1; print("  ✅ \(n)") } else { fail += 1; print("  ❌ \(n)\(d.isEmpty ? "" : " — \(d)")") }
}

let serverJSON = """
{"time":1757000000000,"blocks":[\
{"type":"paragraph","data":{"text":"네팔스카우트가 &quot;Mobilising Hope&quot; 모금을 시작했다."}},\
{"type":"image","data":{"file":{"url":"https://bpmedia.net/api/images/abc123.jpg"},"caption":"현장","withBorder":false,"stretched":false,"withBackground":false}},\
{"type":"paragraph","data":{"text":"라수와 &lt;현장&gt; 상황은 여전히 심각하다."}},\
{"type":"image","data":{"file":{"url":"https://bpmedia.net/api/images/def456.jpg"},"caption":"","withBorder":false,"stretched":false,"withBackground":false}}\
],"version":"2.28.0"}
"""
print("\n[1] 기존 글 열기 — decode")
let d = EditorJSCodec.decode(serverJSON)
check("이미지 2장 추출", d.imageURLs.count == 2)
check("URL 원형 유지", d.imageURLs == ["https://bpmedia.net/api/images/abc123.jpg","https://bpmedia.net/api/images/def456.jpg"])
check("HTML 이스케이프 복원", d.text.contains("\"Mobilising Hope\"") && d.text.contains("<현장>"))

print("\n[2] 미변경 재저장 — 원본 보존")
let u = resolveContentJSON(originalContentJSON: serverJSON, bodyText: d.text, baselineBodyText: d.text, imageURLs: d.imageURLs, baselineImageURLs: d.imageURLs)
check("바이트 동일", u == serverJSON)
check("캡션 보존", u.contains("\"caption\":\"현장\""))

print("\n[3] 본문 수정 재저장 — 이미지 생존")
let e = resolveContentJSON(originalContentJSON: serverJSON, bodyText: d.text + "\n\n추가 문단입니다.", baselineBodyText: d.text, imageURLs: d.imageURLs, baselineImageURLs: d.imageURLs)
let rd = EditorJSCodec.decode(e)
check("이미지 2장 유지", rd.imageURLs == d.imageURLs)
check("추가 문단 반영", rd.text.contains("추가 문단입니다."))
check("기존 본문 보존", rd.text.contains("Mobilising Hope"))

print("\n[4] 이미지 1장 삭제")
let r = resolveContentJSON(originalContentJSON: serverJSON, bodyText: d.text, baselineBodyText: d.text, imageURLs: [d.imageURLs[0]], baselineImageURLs: d.imageURLs)
check("1장만 남음", EditorJSCodec.decode(r).imageURLs.count == 1)

print("\n[5] ★목록·표 — 이제 편집창에 보이는가 (이번 수정 대상)")
let complexJSON = """
{"time":1,"blocks":[\
{"type":"header","data":{"text":"소제목"}},\
{"type":"list","data":{"style":"unordered","items":["항목 하나","항목 둘","항목 셋"]}},\
{"type":"quote","data":{"text":"인용문","caption":"출처"}},\
{"type":"table","data":{"content":[["구분","인원"],["로버","120"]]}},\
{"type":"paragraph","data":{"text":"끝 문단"}}\
],"version":"2.28.0"}
"""
let cd = EditorJSCodec.decode(complexJSON)
check("목록 3항목 모두 노출", cd.text.contains("- 항목 하나") && cd.text.contains("- 항목 둘") && cd.text.contains("- 항목 셋"), cd.text)
check("표 내용 노출", cd.text.contains("구분 | 인원") && cd.text.contains("로버 | 120"), cd.text)
check("헤더·인용·문단 유지", cd.text.contains("소제목") && cd.text.contains("인용문") && cd.text.contains("끝 문단"))

print("\n[6] 목록 글 — 미변경이면 여전히 원본 그대로")
let cu = resolveContentJSON(originalContentJSON: complexJSON, bodyText: cd.text, baselineBodyText: cd.text, imageURLs: cd.imageURLs, baselineImageURLs: cd.imageURLs)
check("원본 JSON 바이트 동일(목록 서식 보존)", cu == complexJSON)

print("\n[7] 목록 글 — 본문 고쳐 저장하면 내용이 살아남는가")
let ce = EditorJSCodec.encode(plainText: cd.text + "\n\n덧붙임", imageDataURLs: [])
let ce2 = EditorJSCodec.decode(ce)
check("목록 내용 3건 전부 생존", ce2.text.contains("항목 하나") && ce2.text.contains("항목 둘") && ce2.text.contains("항목 셋"), ce2.text)
check("표 내용 생존", ce2.text.contains("구분 | 인원") && ce2.text.contains("로버 | 120"))
check("(서식은 문단으로 평탄화됨 — 의도된 절충)", !ce.contains("\"type\":\"list\""))

print("\n[8] 중첩 목록(Editor.js 2.30 객체형) — 깨지지 않는가")
let nested = """
{"time":1,"blocks":[\
{"type":"list","data":{"style":"ordered","items":[\
{"content":"큰 항목","items":[{"content":"작은 항목 A","items":[]},{"content":"작은 항목 B","items":[]}]},\
{"content":"둘째","items":[]}]}},\
{"type":"paragraph","data":{"text":"뒤 문단"}}\
],"version":"2.30.0"}
"""
let nd = EditorJSCodec.decode(nested)
check("객체형 목록도 읽힘", nd.text.contains("- 큰 항목") && nd.text.contains("둘째"), nd.text)
check("중첩 하위 항목까지 노출", nd.text.contains("작은 항목 A") && nd.text.contains("작은 항목 B"))
check("뒤 문단 살아있음(디코딩 전체가 안 깨짐)", nd.text.contains("뒤 문단"))

print("\n[9] 낯선/깨진 스키마 견고성")
let weird = """
{"time":1,"blocks":[\
{"type":"paragraph","data":{"text":"정상 문단"}},\
{"type":"list","data":{"items":[{"weird":1},"문자열 항목"]}},\
{"type":"image","data":{"file":{"url":"https://x/y.jpg"},"withBorder":"yes","stretched":123}},\
{"type":"unknownBlock","data":{"text":"모르는 블록"}},\
{"type":"paragraph","data":{"text":"마지막 문단"}}\
],"version":"2.28.0"}
"""
let wd = EditorJSCodec.decode(weird)
check("타입 불일치가 있어도 전체가 안 깨짐", wd.text.contains("정상 문단") && wd.text.contains("마지막 문단"), wd.text)
check("이미지 URL 은 여전히 뽑힘", wd.imageURLs == ["https://x/y.jpg"], "\(wd.imageURLs)")
check("모르는 블록 텍스트도 보존", wd.text.contains("모르는 블록"))

print("\n[10] 신규 작성·특수문자")
check("빈 본문", EditorJSCodec.decode(EditorJSCodec.encode(plainText: "", imageDataURLs: [])).text == "")
let tricky = "따옴표 \" & 꺾쇠 <b> 태그 · 한글"
check("특수문자 라운드트립", EditorJSCodec.decode(EditorJSCodec.encode(plainText: tricky)).text == tricky)

print("\n[11] 목록 표기 라운드트립 안정성 (두 번 저장해도 안 늘어남)")
let once = EditorJSCodec.decode(EditorJSCodec.encode(plainText: cd.text)).text
let twice = EditorJSCodec.decode(EditorJSCodec.encode(plainText: once)).text
check("두 번 저장해도 동일", once == twice, "1:\(once)\n2:\(twice)")

print("\n[12] 문단/br 매핑 (웹 _createParagraphBlocks 패리티)")
let brSrc = "첫 줄\n둘째 줄\n\n다음 문단"
let brEnc = EditorJSCodec.encode(plainText: brSrc)
check("한 문단 안에 <br>", brEnc.contains("<br>"), brEnc)
let paraCount = brEnc.components(separatedBy: "\"type\":\"paragraph\"").count - 1
check("빈 줄로 문단 2개", paraCount == 2, "count=\(paraCount) \(brEnc)")
let brDec = EditorJSCodec.decode(brEnc)
check("디코드 시 빈 줄 복원", brDec.text.contains("\n\n"), brDec.text)
check("문단 내부 줄바꿈 복원", brDec.text.contains("첫 줄\n둘째 줄"), brDec.text)


print("\n[13] ★본문 수정 시 이미지 캡션·위치 보존 (merge)")
let m1 = resolveContentJSON(originalContentJSON: serverJSON, bodyText: d.text.replacingOccurrences(of: "여전히 심각하다", with: "아직도 심각하다"), baselineBodyText: d.text, imageURLs: d.imageURLs, baselineImageURLs: d.imageURLs)
check("캡션 ‘현장’ 살아남음", m1.contains("\"caption\":\"현장\""), m1)
let m1types = (try? JSONSerialization.jsonObject(with: m1.data(using: .utf8)!) as? [String: Any]).flatMap { ($0["blocks"] as? [[String: Any]])?.map { $0["type"] as? String ?? "" } } ?? []
check("블록 순서 문단·이미지·문단·이미지 유지", m1types == ["paragraph","image","paragraph","image"], "\(m1types)")
check("안 고친 첫 문단은 원본 그대로", m1.contains("&quot;Mobilising Hope&quot;"))
check("고친 문단 반영", EditorJSCodec.decode(m1).text.contains("아직도 심각하다"))

print("\n[14] 문단을 앞에 끼워 넣어도 이미지가 끝으로 안 밀림")
let m2 = resolveContentJSON(originalContentJSON: serverJSON, bodyText: "새 머리 문단\n\n" + d.text, baselineBodyText: d.text, imageURLs: d.imageURLs, baselineImageURLs: d.imageURLs)
let m2types = (try? JSONSerialization.jsonObject(with: m2.data(using: .utf8)!) as? [String: Any]).flatMap { ($0["blocks"] as? [[String: Any]])?.map { $0["type"] as? String ?? "" } } ?? []
check("머리 문단 뒤에도 이미지 위치 유지", m2types == ["paragraph","paragraph","image","paragraph","image"], "\(m2types)")

print("\n[15] 헤더·목록·표를 안 고치면 서식이 남고, 고친 것만 문단이 된다")
let m3 = resolveContentJSON(originalContentJSON: complexJSON, bodyText: cd.text.replacingOccurrences(of: "끝 문단", with: "끝 문단 고침"), baselineBodyText: cd.text, imageURLs: [], baselineImageURLs: [])
check("header 블록 유지", m3.contains("\"type\":\"header\""), m3)
check("list 블록 유지", m3.contains("\"type\":\"list\""))
check("table 블록 유지", m3.contains("\"type\":\"table\""))
check("quote 블록 유지", m3.contains("\"type\":\"quote\""))
check("고친 문단 반영", EditorJSCodec.decode(m3).text.contains("끝 문단 고침"))
let m4 = resolveContentJSON(originalContentJSON: complexJSON, bodyText: cd.text.replacingOccurrences(of: "항목 둘", with: "항목 둘 수정"), baselineBodyText: cd.text, imageURLs: [], baselineImageURLs: [])
check("목록을 고치면 그 목록만 문단으로(내용 보존)", !m4.contains("\"type\":\"list\"") && EditorJSCodec.decode(m4).text.contains("항목 둘 수정") && m4.contains("\"type\":\"header\""), m4)

print("\n[16] 이미지 삭제·추가와 두 번 저장")
let m5 = resolveContentJSON(originalContentJSON: serverJSON, bodyText: d.text + "\n\n덧", baselineBodyText: d.text, imageURLs: [d.imageURLs[1], "data:image/jpeg;base64,AAAA"], baselineImageURLs: d.imageURLs)
let m5d = EditorJSCodec.decode(m5)
check("지운 이미지 빠지고 새 이미지 붙음", m5d.imageURLs == [d.imageURLs[1], "data:image/jpeg;base64,AAAA"], "\(m5d.imageURLs)")
let m6 = resolveContentJSON(originalContentJSON: m1, bodyText: EditorJSCodec.decode(m1).text, baselineBodyText: "x", imageURLs: d.imageURLs, baselineImageURLs: d.imageURLs)
check("두 번째 저장도 캡션·순서 유지", m6.contains("\"caption\":\"현장\"") && EditorJSCodec.decode(m6).text == EditorJSCodec.decode(m1).text)

print("\n════ 통과 \(pass) · 실패 \(fail) ════")
if fail > 0 { exit(1) }
