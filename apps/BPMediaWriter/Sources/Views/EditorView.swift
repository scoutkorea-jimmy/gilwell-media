import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct EditorView: View {
    @EnvironmentObject private var appState: AppState

    @State private var title = ""
    @State private var subtitle = ""
    @State private var category: PostCategory = .korea
    @State private var bodyText = ""
    @State private var author = "Editor.A"
    @State private var metaTags = ""
    @State private var specialFeature = ""
    @State private var publishMode: PublishMode = .immediate
    @State private var scheduleDate = Date().addingTimeInterval(3600)
    @State private var coverDataURL: String?
    @State private var coverPreview: NSImage?
    @State private var bodyImageDataURLs: [String] = []
    @State private var editingPost: PostDetail?
    @State private var isSaving = false
    @State private var autosaveTask: Task<Void, Never>?
    @State private var didLoad = false

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            ScrollView {
                Form {
                    Section("필수") {
                        TextField("제목", text: $title)
                        Picker("카테고리", selection: $category) {
                            ForEach(PostCategory.allCases) { cat in
                                Text(cat.titleKO).tag(cat)
                            }
                        }
                        .onChange(of: category) { _, newValue in
                            Task { await appState.loadSpecialFeatures(for: newValue) }
                        }
                        Text("본문")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextEditor(text: $bodyText)
                            .font(.body)
                            .frame(minHeight: 220)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(Color.secondary.opacity(0.25))
                            )
                    }

                    Section("선택") {
                        TextField("부제", text: $subtitle)
                        TextField("스페셜 피처", text: $specialFeature)
                        if !appState.specialFeatures.isEmpty {
                            Picker("기존 피처", selection: $specialFeature) {
                                Text("(직접 입력)").tag("")
                                ForEach(appState.specialFeatures, id: \.self) { f in
                                    Text(f).tag(f)
                                }
                            }
                        }
                        TextField("메타 태그 (쉼표 구분)", text: $metaTags)
                        if !appState.metaTagPool.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack {
                                    ForEach(appState.metaTagPool.prefix(30), id: \.self) { tag in
                                        Button(tag) { appendMetaTag(tag) }
                                            .buttonStyle(.bordered)
                                            .controlSize(.mini)
                                    }
                                }
                            }
                        }
                        Picker("작성자", selection: $author) {
                            ForEach(appState.authors) { opt in
                                Text(opt.label).tag(opt.code)
                            }
                        }
                    }

                    Section("이미지") {
                        HStack(alignment: .top, spacing: 16) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("커버 이미지")
                                if let coverPreview {
                                    Image(nsImage: coverPreview)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(maxWidth: 220, maxHeight: 140)
                                        .cornerRadius(8)
                                } else if let url = coverDataURL, url.hasPrefix("http"), let nsURL = URL(string: url) {
                                    AsyncImage(url: nsURL) { phase in
                                        switch phase {
                                        case .success(let img):
                                            img.resizable().scaledToFit().frame(maxWidth: 220, maxHeight: 140)
                                        default:
                                            ProgressView()
                                        }
                                    }
                                } else {
                                    Text("없음").foregroundStyle(.secondary)
                                }
                                HStack {
                                    Button("커버 선택…") { pickCover() }
                                    if coverDataURL != nil {
                                        Button("제거", role: .destructive) {
                                            coverDataURL = nil
                                            coverPreview = nil
                                            scheduleAutosave()
                                        }
                                    }
                                }
                            }
                            VStack(alignment: .leading, spacing: 8) {
                                Text("본문 이미지 (\(bodyImageDataURLs.count))")
                                Button("본문 이미지 추가…") { pickBodyImages() }
                                ForEach(Array(bodyImageDataURLs.enumerated()), id: \.offset) { idx, _ in
                                    HStack {
                                        Text("이미지 \(idx + 1)")
                                        Spacer()
                                        Button("삭제", role: .destructive) {
                                            bodyImageDataURLs.remove(at: idx)
                                            scheduleAutosave()
                                        }
                                    }
                                    .font(.caption)
                                }
                            }
                        }
                    }

                    Section("공개 설정") {
                        Picker("모드", selection: $publishMode) {
                            ForEach(PublishMode.allCases) { mode in
                                Text(mode.titleKO).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        if publishMode == .schedule {
                            DatePicker("예약 시각 (로컬)", selection: $scheduleDate)
                            Text("서버는 KST 벽시계 문자열로 저장합니다.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(20)
                .formStyle(.grouped)
            }
        }
        .onAppear { loadFromMode() }
        .onChange(of: title) { _, _ in scheduleAutosave() }
        .onChange(of: subtitle) { _, _ in scheduleAutosave() }
        .onChange(of: bodyText) { _, _ in scheduleAutosave() }
        .onChange(of: metaTags) { _, _ in scheduleAutosave() }
        .onChange(of: specialFeature) { _, _ in scheduleAutosave() }
        .onChange(of: author) { _, _ in scheduleAutosave() }
        .onChange(of: publishMode) { _, _ in scheduleAutosave() }
    }

    private var toolbar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(editingPost == nil ? "새 글 작성" : "글 수정")
                    .font(.headline)
                if let id = editingPost?.id {
                    Text("ID \(id)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("닫기") { appState.editorMode = nil }
            Button {
                Task { await save() }
            } label: {
                if isSaving {
                    ProgressView().controlSize(.small)
                } else {
                    Text("저장")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(12)
    }


    private func loadFromMode() {
        guard !didLoad else { return }
        didLoad = true
        switch appState.editorMode {
        case .create(let draft):
            editingPost = nil
            let local = appState.drafts.load() ?? draft
            applyDraft(local)
        case .edit(let post):
            editingPost = post
            title = post.title ?? ""
            subtitle = post.subtitle ?? ""
            category = PostCategory(rawValue: post.category ?? "korea") ?? .korea
            author = post.author ?? appState.authors.first?.code ?? "Editor.A"
            metaTags = post.metaTags ?? ""
            specialFeature = post.specialFeature ?? ""
            let decoded = EditorJSCodec.decode(post.content)
            bodyText = decoded.text
            bodyImageDataURLs = decoded.imageURLs.filter { $0.hasPrefix("data:") }
            coverDataURL = post.imageURL
            coverPreview = nil
            if post.published == true || post.publishedInt == 1 {
                if let at = post.publishAt, isFuturePublishAt(at) {
                    publishMode = .schedule
                    scheduleDate = parsePublishAt(at) ?? scheduleDate
                } else {
                    publishMode = .immediate
                }
            } else if let at = post.publishAt, !at.isEmpty {
                publishMode = .schedule
                scheduleDate = parsePublishAt(at) ?? scheduleDate
            } else {
                publishMode = .hold
            }
            Task { await appState.loadSpecialFeatures(for: category) }
        case .none:
            break
        }
    }

    private func applyDraft(_ d: LocalDraft) {
        title = d.title
        subtitle = d.subtitle
        category = PostCategory(rawValue: d.category) ?? .korea
        bodyText = d.bodyText
        author = d.author
        metaTags = d.metaTags
        specialFeature = d.specialFeature
        publishMode = PublishMode(rawValue: d.publishMode) ?? .immediate
        coverDataURL = d.coverDataURL
        bodyImageDataURLs = d.bodyImageDataURLs
        if let s = d.publishAt, let date = parsePublishAt(s) {
            scheduleDate = date
        }
        if let dataURL = d.coverDataURL, dataURL.hasPrefix("data:"), let img = nsImage(fromDataURL: dataURL) {
            coverPreview = img
        }
    }

    private func scheduleAutosave() {
        autosaveTask?.cancel()
        autosaveTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            let draft = currentDraft()
            appState.drafts.save(draft)
        }
    }

    private func currentDraft() -> LocalDraft {
        LocalDraft(
            title: title,
            subtitle: subtitle,
            category: category.rawValue,
            bodyText: bodyText,
            author: author,
            metaTags: metaTags,
            specialFeature: specialFeature,
            publishMode: publishMode.rawValue,
            publishAt: formatPublishAt(scheduleDate),
            coverDataURL: coverDataURL?.hasPrefix("data:") == true ? coverDataURL : coverDataURL,
            bodyImageDataURLs: bodyImageDataURLs,
            editingPostID: editingPost?.id,
            expectedUpdatedAt: editingPost?.updatedAt
        )
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let content = EditorJSCodec.encode(plainText: bodyText, imageDataURLs: bodyImageDataURLs)
        var published = false
        var publishAt: String? = nil
        switch publishMode {
        case .immediate:
            published = true
            publishAt = nil
        case .schedule:
            // Server keeps unpublished future publish_at until publish-due job flips it.
            published = false
            publishAt = formatPublishAt(scheduleDate)
        case .hold:
            published = false
            publishAt = nil
        }
        var payload = PostWritePayload(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            subtitle: subtitle.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            category: category.rawValue,
            content: content,
            author: author.nilIfEmpty,
            metaTags: metaTags.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            specialFeature: specialFeature.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            published: published,
            publishAt: publishAt,
            imageData: nil,
            imageURL: nil,
            expectedUpdatedAt: nil
        )
        if let coverDataURL, coverDataURL.hasPrefix("data:") {
            payload.imageData = coverDataURL
        } else if let coverDataURL, coverDataURL.hasPrefix("http") {
            payload.imageURL = coverDataURL
        }
        _ = await appState.savePost(payload, editing: editingPost)
    }

    private func appendMetaTag(_ tag: String) {
        let parts = metaTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard !parts.contains(tag) else { return }
        metaTags = (parts + [tag]).joined(separator: ",")
    }

    private func pickCover() {
        guard let url = openImagePanel(multiple: false).first else { return }
        guard let dataURL = makeDataURL(from: url), let img = nsImage(fromDataURL: dataURL) else {
            appState.globalAlert = "이미지를 읽지 못했습니다."
            return
        }
        coverDataURL = dataURL
        coverPreview = img
        scheduleAutosave()
    }

    private func pickBodyImages() {
        let urls = openImagePanel(multiple: true)
        for url in urls {
            if let dataURL = makeDataURL(from: url) {
                bodyImageDataURLs.append(dataURL)
            }
        }
        scheduleAutosave()
    }

    private func openImagePanel(multiple: Bool) -> [URL] {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = multiple
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.jpeg, .png, .gif, .heic, .webP]
        panel.title = multiple ? "본문 이미지 선택" : "커버 이미지 선택"
        return panel.runModal() == .OK ? panel.urls : []
    }

    private func makeDataURL(from url: URL) -> String? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let ext = url.pathExtension.lowercased()
        let mime: String
        switch ext {
        case "jpg", "jpeg": mime = "image/jpeg"
        case "png": mime = "image/png"
        case "gif": mime = "image/gif"
        case "webp": mime = "image/webp"
        case "heic": mime = "image/heic"
        default: mime = "application/octet-stream"
        }
        return "data:\(mime);base64,\(data.base64EncodedString())"
    }

    private func nsImage(fromDataURL dataURL: String) -> NSImage? {
        guard let range = dataURL.range(of: "base64,") else { return nil }
        let b64 = String(dataURL[range.upperBound...])
        guard let data = Data(base64Encoded: b64) else { return nil }
        return NSImage(data: data)
    }

    private func formatPublishAt(_ date: Date) -> String {
        // Server stores KST wall-clock. Format local calendar components as KST-like string.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul") ?? .current
        let c = cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return String(
            format: "%04d-%02d-%02d %02d:%02d:%02d",
            c.year ?? 0, c.month ?? 0, c.day ?? 0, c.hour ?? 0, c.minute ?? 0, c.second ?? 0
        )
    }

    private func parsePublishAt(_ raw: String) -> Date? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let formats = [
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm",
            "yyyy-MM-dd"
        ]
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul") ?? .current
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
        for f in formats {
            formatter.dateFormat = f
            if let d = formatter.date(from: trimmed) { return d }
        }
        return nil
    }

    private func isFuturePublishAt(_ raw: String) -> Bool {
        guard let d = parsePublishAt(raw) else { return false }
        return d > Date()
    }
}

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
