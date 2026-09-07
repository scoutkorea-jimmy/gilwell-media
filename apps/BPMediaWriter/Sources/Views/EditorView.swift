import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct EditorView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.appTypography) private var typography

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
    /// Body image URLs — may be http(s) or data: (never drop http on edit).
    @State private var bodyImageDataURLs: [String] = []
    @State private var editingPost: PostDetail?
    @State private var isSaving = false
    @State private var autosaveTask: Task<Void, Never>?
    @State private var loadToken = UUID()
    @State private var originalContentJSON: String?
    @State private var baselineBodyText = ""
    @State private var baselineImageURLs: [String] = []

    var body: some View {
        Group {
            switch appState.editorMode {
            case .view(let post):
                readOnlyDetail(post)
            case .edit, .create:
                editableEditor
            case .none:
                EmptyView()
            }
        }
        .background(BrandColors.brandBackground)
        .tint(BrandColors.brandPrimary)
        .onAppear { reloadFromMode() }
        .onChange(of: appState.editorSessionID) { _, _ in
            reloadFromMode()
        }
    }

    // MARK: - Read-only detail

    @ViewBuilder
    private func readOnlyDetail(_ post: PostDetail) -> some View {
        let decoded = EditorJSCodec.decode(post.content)
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("글 보기")
                        .font(typography.title2)
                        .foregroundStyle(BrandColors.scoutingPurple)
                    Text("ID \(post.id)")
                        .font(typography.caption2)
                        .foregroundStyle(.tertiary)
                }
                Spacer()
                Button("닫기") { appState.closeEditor() }
                Button("수정") {
                    appState.openEdit(post: post)
                }
                .buttonStyle(.borderedProminent)
                .tint(BrandColors.brandPrimary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(BrandColors.brandSurface)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(post.title ?? "(제목 없음)")
                            .font(typography.title)
                            .foregroundStyle(BrandColors.scoutingPurple)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack(spacing: 8) {
                            metaChip(PostCategory.displayTitle(for: post.category))
                            Text(post.isPublished ? "공개" : "비공개")
                                .font(typography.captionSemibold)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .foregroundStyle(post.isPublished ? BrandColors.forestGreen : BrandColors.midnightPurple)
                                .background(
                                    (post.isPublished ? BrandColors.leafGreen : BrandColors.blossomPink)
                                        .opacity(0.35)
                                )
                                .clipShape(Capsule())
                            Label(post.viewsLabel, systemImage: "eye")
                                .font(typography.caption)
                                .foregroundStyle(.secondary)
                        }

                        if let sub = post.subtitle, !sub.isEmpty {
                            Text(sub)
                                .font(typography.title3)
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        if let feature = post.specialFeature, !feature.isEmpty {
                            labeledRow("스페셜 피처", feature)
                        }

                        if let url = post.imageURL, !url.isEmpty {
                            Text("대표 이미지")
                                .font(typography.captionSemibold)
                                .foregroundStyle(BrandColors.scoutingPurple.opacity(0.85))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    if let url = post.imageURL, !url.isEmpty {
                        fullBleedCover(url)
                            .padding(.bottom, 20)
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        sectionHeader("본문")
                        Text(decoded.text.isEmpty ? "(본문 없음)" : decoded.text)
                            .font(typography.body)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)

                        if !decoded.imageURLs.isEmpty {
                            sectionHeader("본문 이미지")
                                .padding(.top, 8)
                            ForEach(Array(decoded.imageURLs.enumerated()), id: \.offset) { idx, url in
                                if url.hasPrefix("http"), let nsURL = URL(string: url) {
                                    VStack(alignment: .leading, spacing: 6) {
                                        HStack(alignment: .top, spacing: 8) {
                                            Text("이미지 \(idx + 1)")
                                                .font(typography.caption)
                                            Link(url, destination: nsURL)
                                                .font(typography.caption)
                                                .lineLimit(2)
                                        }
                                        AsyncImage(url: nsURL) { phase in
                                            if case .success(let img) = phase {
                                                img.resizable()
                                                    .scaledToFit()
                                                    .frame(maxWidth: .infinity, maxHeight: 220)
                                                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                            }
                                        }
                                    }
                                } else {
                                    Text("이미지 \(idx + 1): \(url.hasPrefix("data:") ? "(첨부 data URL)" : url)")
                                        .font(typography.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        Divider()
                            .padding(.vertical, 4)

                        VStack(alignment: .leading, spacing: 8) {
                            if let meta = post.metaTags, !meta.isEmpty {
                                labeledRow("메타 태그", meta)
                            }
                            if let author = post.author, !author.isEmpty {
                                labeledRow("작성자", author)
                            }
                            if let at = post.publishAt, !at.isEmpty {
                                labeledRow("공개 예정/시각", at)
                            } else if let created = post.createdAt, !created.isEmpty {
                                labeledRow("작성", created)
                            }
                            if let updated = post.updatedAt, !updated.isEmpty {
                                labeledRow("수정", updated)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(typography.headline)
            .foregroundStyle(BrandColors.scoutingPurple)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Edge-to-edge cover inside the detail pane (ignores horizontal content padding).
    @ViewBuilder
    private func fullBleedCover(_ url: String) -> some View {
        Group {
            if url.hasPrefix("http"), let nsURL = URL(string: url) {
                AsyncImage(url: nsURL) { phase in
                    switch phase {
                    case .success(let img):
                        img
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity)
                            .frame(height: 300)
                            .clipped()
                    case .failure:
                        Link(url, destination: nsURL)
                            .font(typography.caption)
                            .padding(.horizontal, 20)
                    default:
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .frame(height: 160)
                    }
                }
            } else {
                Text(url)
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 20)
            }
        }
        .frame(maxWidth: .infinity)
        .background(BrandColors.brandSurface)
    }

    private func labeledRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label)
                .font(typography.caption)
                .foregroundStyle(.secondary)
                .frame(width: 96, alignment: .leading)
            Text(value)
                .font(typography.callout)
                .textSelection(.enabled)
            Spacer(minLength: 0)
        }
    }

    private func metaChip(_ text: String) -> some View {
        Text(text)
            .font(typography.caption2Semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(BrandColors.midnightPurple)
            .background(BrandColors.riverBlue.opacity(0.45))
            .clipShape(Capsule())
            .lineLimit(2)
    }

    // MARK: - Editable editor

    private var editableEditor: some View {
        VStack(spacing: 0) {
            editToolbar
            Divider()
            ScrollView {
                Form {
                    // 1. 제목 (필수)
                    Section {
                        fieldLabel("제목", required: true)
                        TextField("제목을 입력하세요", text: $title)
                            .font(typography.bodySemibold)
                    }

                    // 카테고리 (필수) — 제목 바로 다음
                    Section {
                        fieldLabel("카테고리", required: true)
                        Picker("카테고리", selection: $category) {
                            ForEach(PostCategory.allCases) { cat in
                                Text(cat.titleKO).tag(cat)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .onChange(of: category) { _, newValue in
                            Task { await appState.loadSpecialFeatures(for: newValue) }
                        }
                    }

                    // 2. 부제 (선택)
                    Section {
                        fieldLabel("부제", required: false)
                        TextField("부제 (선택)", text: $subtitle)
                    }

                    // 3. 스페셜 피처 (선택) + 4. 기존 특집 불러오기
                    Section {
                        fieldLabel("스페셜 피처", required: false)
                        TextField("특집명 직접 입력", text: $specialFeature)
                        fieldLabel("등록된 특집에서 선택", required: false)
                        Text("이미 쓴 특집명을 고르면 위에 채워집니다")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if appState.specialFeatures.isEmpty {
                            Text("이 카테고리에 등록된 특집이 없습니다.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Picker("등록된 특집에서 선택", selection: $specialFeature) {
                                Text("(선택 안 함)").tag("")
                                ForEach(appState.specialFeatures, id: \.self) { f in
                                    Text(f).tag(f)
                                }
                            }
                            .labelsHidden()
                        }
                    }

                    // 5. 대표 이미지 (선택)
                    Section {
                        fieldLabel("대표 이미지", required: false)
                        VStack(alignment: .leading, spacing: 8) {
                            if let coverPreview {
                                Image(nsImage: coverPreview)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 200)
                                    .clipped()
                                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                            } else if let url = coverDataURL, url.hasPrefix("http"), let nsURL = URL(string: url) {
                                AsyncImage(url: nsURL) { phase in
                                    switch phase {
                                    case .success(let img):
                                        img.resizable()
                                            .scaledToFill()
                                            .frame(maxWidth: .infinity)
                                            .frame(height: 200)
                                            .clipped()
                                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                                    default:
                                        ProgressView()
                                    }
                                }
                            } else {
                                Text("없음")
                                    .font(typography.body)
                                    .foregroundStyle(.secondary)
                            }
                            HStack(spacing: 8) {
                                Button("대표 이미지 선택…") { pickCover() }
                                if coverDataURL != nil {
                                    Button("제거", role: .destructive) {
                                        coverDataURL = nil
                                        coverPreview = nil
                                        scheduleAutosave()
                                    }
                                    .tint(BrandColors.brandDanger)
                                }
                            }
                        }
                    }

                    // 6. 본문 (필수)
                    Section {
                        fieldLabel("본문", required: true)
                        TextEditor(text: $bodyText)
                            .font(typography.body)
                            .frame(minHeight: 240)
                            .padding(6)
                            .background(BrandColors.canvasWhite)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(BrandColors.scoutingPurple.opacity(0.25), lineWidth: 1)
                            )
                    }

                    // 7. 본문 이미지 (선택)
                    Section {
                        fieldLabel("본문 이미지", required: false)
                        Text("본문에 붙일 이미지 (\(bodyImageDataURLs.count))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("본문 이미지 추가…") { pickBodyImages() }
                        ForEach(Array(bodyImageDataURLs.enumerated()), id: \.offset) { idx, url in
                            HStack {
                                Text(imageLabel(url, index: idx))
                                Spacer()
                                Button("삭제", role: .destructive) {
                                    bodyImageDataURLs.remove(at: idx)
                                    scheduleAutosave()
                                }
                                .tint(BrandColors.brandDanger)
                            }
                            .font(.caption)
                        }
                    }

                    // 8. 메타 태그 (선택)
                    Section {
                        fieldLabel("메타 태그", required: false)
                        Text("SEO 해시태그 · 쉼표로 구분")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("예: 스카우트,잼버리", text: $metaTags)
                        if !appState.metaTagPool.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(appState.metaTagPool.prefix(30), id: \.self) { tag in
                                        Button(tag) { appendMetaTag(tag) }
                                            .buttonStyle(.bordered)
                                            .controlSize(.mini)
                                    }
                                }
                            }
                        }
                    }

                    // 작성자 (선택) — 공개 설정 직전
                    Section {
                        fieldLabel("작성자", required: false)
                        Picker("작성자", selection: $author) {
                            ForEach(appState.authors) { opt in
                                Text(opt.label).tag(opt.code)
                            }
                        }
                        .labelsHidden()
                    }

                    // 9. 공개 설정
                    Section {
                        fieldLabel("공개 설정", required: true)
                        Picker("모드", selection: $publishMode) {
                            ForEach(PublishMode.allCases) { mode in
                                Text(mode.titleKO).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        if publishMode == .schedule {
                            DatePicker("예약 시각 (로컬)", selection: $scheduleDate)
                            Text("서버는 KST 벽시계 문자열로 저장합니다.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if scheduleDate < Date() {
                                Text("예약 시각이 과거입니다. 저장 시 확인이 필요합니다.")
                                    .font(.caption)
                                    .foregroundStyle(BrandColors.brandWarning)
                            }
                        }
                    }
                }
                .padding(20)
                .formStyle(.grouped)
            }
        }
        .onChange(of: title) { _, _ in scheduleAutosave() }
        .onChange(of: subtitle) { _, _ in scheduleAutosave() }
        .onChange(of: bodyText) { _, _ in scheduleAutosave() }
        .onChange(of: metaTags) { _, _ in scheduleAutosave() }
        .onChange(of: specialFeature) { _, _ in scheduleAutosave() }
        .onChange(of: author) { _, _ in scheduleAutosave() }
        .onChange(of: publishMode) { _, _ in scheduleAutosave() }
    }

    private var editToolbar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(editingPost == nil ? "새 글 작성" : "글 수정")
                    .font(typography.title2)
                    .foregroundStyle(BrandColors.scoutingPurple)
                if let id = editingPost?.id {
                    Text("ID \(id)")
                        .font(typography.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if editingPost != nil {
                Button("취소") {
                    if let id = editingPost?.id {
                        Task { await appState.openView(postID: id) }
                    } else {
                        appState.closeEditor()
                    }
                }
            }
            Button("닫기") { appState.closeEditor() }
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
            .tint(BrandColors.brandPrimary)
            .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(12)
        .background(BrandColors.brandSurface)
    }


    private func fieldLabel(_ title: String, required: Bool) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(typography.headline)
                .foregroundStyle(BrandColors.scoutingPurple)
            Text(required ? "필수" : "선택")
                .font(typography.caption2Semibold)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .foregroundStyle(required ? Color.white : BrandColors.midnightPurple)
                .background(required ? BrandColors.scoutingPurple : BrandColors.riverBlue.opacity(0.35))
                .clipShape(Capsule())
            Spacer(minLength: 0)
        }
    }

    private func imageLabel(_ url: String, index: Int) -> String {
        if url.hasPrefix("http") {
            return "이미지 \(index + 1) (원격)"
        }
        if url.hasPrefix("data:") {
            return "이미지 \(index + 1) (첨부)"
        }
        return "이미지 \(index + 1)"
    }

    /// Full state reset + reload. Driven by session id / onAppear — never rely on didLoad alone.
    private func reloadFromMode() {
        autosaveTask?.cancel()
        loadToken = UUID()
        resetFields()
        switch appState.editorMode {
        case .create:
            editingPost = nil
            originalContentJSON = nil
            baselineBodyText = ""
            baselineImageURLs = []
            // Never restore a draft tied to an existing post into create.
            // Intentional 「새 글」 clears drafts first; leftover draft is crash-recovery for create only.
            if let local = appState.drafts.load(), local.editingPostID == nil {
                applyDraft(local)
            } else {
                applyDraft(LocalDraft())
            }
            Task { await appState.loadSpecialFeatures(for: category) }
        case .edit(let post):
            applyPost(post)
        case .view, .none:
            break
        }
    }

    private func resetFields() {
        title = ""
        subtitle = ""
        category = .korea
        bodyText = ""
        author = appState.authors.first?.code ?? "Editor.A"
        metaTags = ""
        specialFeature = ""
        publishMode = .immediate
        scheduleDate = Date().addingTimeInterval(3600)
        coverDataURL = nil
        coverPreview = nil
        bodyImageDataURLs = []
        editingPost = nil
        originalContentJSON = nil
        baselineBodyText = ""
        baselineImageURLs = []
        isSaving = false
    }

    private func applyPost(_ post: PostDetail) {
        editingPost = post
        title = post.title ?? ""
        subtitle = post.subtitle ?? ""
        category = PostCategory(rawValue: post.category ?? "korea") ?? .korea
        author = post.author ?? appState.authors.first?.code ?? "Editor.A"
        metaTags = post.metaTags ?? ""
        specialFeature = post.specialFeature ?? ""
        originalContentJSON = post.content
        let decoded = EditorJSCodec.decode(post.content)
        bodyText = decoded.text
        // CRITICAL: keep ALL image URLs (http + data), not only data:
        bodyImageDataURLs = decoded.imageURLs
        baselineBodyText = decoded.text
        baselineImageURLs = decoded.imageURLs
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
        if !d.publishAt.isEmpty, let date = parsePublishAt(d.publishAt) {
            scheduleDate = date
        }
        if let dataURL = d.coverDataURL, dataURL.hasPrefix("data:"), let img = nsImage(fromDataURL: dataURL) {
            coverPreview = img
        }
    }

    private func scheduleAutosave() {
        // View mode never autosaves.
        if case .view = appState.editorMode { return }
        autosaveTask?.cancel()
        autosaveTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            if case .view = appState.editorMode { return }
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
            coverDataURL: coverDataURL,
            bodyImageDataURLs: bodyImageDataURLs,
            editingPostID: editingPost?.id,
            expectedUpdatedAt: editingPost?.updatedAt
        )
    }

    private func bodyUnchanged() -> Bool {
        let textSame = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
            == baselineBodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        let imagesSame = bodyImageDataURLs == baselineImageURLs
        return textSame && imagesSame
    }

    private func resolveContentJSON() -> String {
        if let original = originalContentJSON, bodyUnchanged() {
            return original
        }
        return EditorJSCodec.encode(plainText: bodyText, imageDataURLs: bodyImageDataURLs)
    }

    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }

        // Hard guarantee: create mode never carries an editingPost (no accidental PUT).
        if case .create = appState.editorMode {
            editingPost = nil
        }

        if publishMode == .schedule, scheduleDate < Date() {
            appState.globalAlert = "예약 시각이 과거입니다. 미래 시각으로 설정하거나 즉시 공개/비공개 보관으로 바꿔 주세요."
            return
        }

        let content = resolveContentJSON()
        var published = false
        var publishAt: String? = nil
        switch publishMode {
        case .immediate:
            published = true
            publishAt = nil
        case .schedule:
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
            if ImageCompressor.approximateByteLength(ofDataURL: coverDataURL) > ImageCompressor.maxEncodedBytes {
                appState.globalAlert = "커버 이미지가 너무 큽니다(약 4MB 초과). 더 작은 이미지로 줄인 뒤 다시 시도해 주세요."
                return
            }
            payload.imageData = coverDataURL
        } else if let coverDataURL, coverDataURL.hasPrefix("http") {
            payload.imageURL = coverDataURL
        }
        for url in bodyImageDataURLs where url.hasPrefix("data:") {
            if ImageCompressor.approximateByteLength(ofDataURL: url) > ImageCompressor.maxEncodedBytes {
                appState.globalAlert = "본문 이미지가 너무 큽니다(약 4MB 초과). 더 작은 이미지로 줄인 뒤 다시 시도해 주세요."
                return
            }
        }
        // editingPost == nil → POST create; non-nil → PUT with expected_updated_at
        guard let saved = await appState.savePost(payload, editing: editingPost) else { return }
        // 저장 성공 = 서버의 updated_at 이 방금 바뀌었다. 그 값을 여기서 받아 두지 않으면
        // 바로 이어지는 두 번째 저장이 옛 스탬프를 보내 409("다른 사용자가 먼저 수정")로 막힌다.
        editingPost = saved
        originalContentJSON = saved.content ?? content
        baselineBodyText = bodyText
        baselineImageURLs = bodyImageDataURLs
    }

    private func appendMetaTag(_ tag: String) {
        let parts = metaTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard !parts.contains(tag) else { return }
        metaTags = (parts + [tag]).joined(separator: ",")
    }

    private func pickCover() {
        guard let url = openImagePanel(multiple: false).first else { return }
        do {
            let dataURL = try ImageCompressor.makeDataURL(from: url)
            coverDataURL = dataURL
            coverPreview = nsImage(fromDataURL: dataURL)
            scheduleAutosave()
        } catch {
            appState.globalAlert = error.localizedDescription
        }
    }

    private func pickBodyImages() {
        let urls = openImagePanel(multiple: true)
        var failed = false
        for url in urls {
            do {
                let dataURL = try ImageCompressor.makeDataURL(from: url)
                bodyImageDataURLs.append(dataURL)
            } catch {
                failed = true
                appState.globalAlert = error.localizedDescription
            }
        }
        if !failed || !bodyImageDataURLs.isEmpty {
            scheduleAutosave()
        }
    }

    private func openImagePanel(multiple: Bool) -> [URL] {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = multiple
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.jpeg, .png, .gif, .heic, .webP]
        panel.title = multiple ? "본문 이미지 선택" : "커버 이미지 선택"
        return panel.runModal() == .OK ? panel.urls : []
    }

    private func nsImage(fromDataURL dataURL: String) -> NSImage? {
        guard let range = dataURL.range(of: "base64,") else { return nil }
        let b64 = String(dataURL[range.upperBound...])
        guard let data = Data(base64Encoded: b64) else { return nil }
        return NSImage(data: data)
    }

    private func formatPublishAt(_ date: Date) -> String {
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
