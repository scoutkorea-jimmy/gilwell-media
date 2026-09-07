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
    @State private var imageCaption = ""
    /// Body image URLs — may be http(s) or data: (never drop http on edit).
    @State private var bodyImageDataURLs: [String] = []
    @State private var editingPost: PostDetail?
    @State private var isSaving = false
    @State private var autosaveTask: Task<Void, Never>?
    @State private var serverDraftID: Int?
    @State private var draftStatus: String?
    @State private var loadToken = UUID()
    @State private var originalContentJSON: String?
    @State private var baselineBodyText = ""
    @State private var baselineImageURLs: [String] = []

    /// 화면에 채운 직후의 스냅샷. 이것과 같으면 자동저장을 보내지 않는다 — 열기만 해도 draft 가 쌓이던 문제.
    @State private var loadedSnapshot: LocalDraft?
    /// 마지막으로 서버에 올린 내용. 같으면 다시 올리지 않는다.
    @State private var lastPushedDraft: LocalDraft?
    /// 서버에 남아 있던 임시저장 — 자동으로 덮어쓰지 않고 사용자에게 묻는다.
    @State private var pendingServerDraft: ServerDraft?
    @State private var showDraftPrompt = false
    @State private var showLeaveDialog = false
    @State private var leaveAction: (() -> Void)?
    @State private var permissionErrorShown = false

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
        .environment(\.layoutDirection, .leftToRight)
        .onAppear { reloadFromMode() }
        .onChange(of: appState.editorSessionID) { _, _ in
            reloadFromMode()
        }
        .alert("임시저장이 있습니다", isPresented: $showDraftPrompt, presenting: pendingServerDraft) { draft in
            Button("불러오기") { acceptServerDraft(draft) }
            Button("버리기", role: .destructive) { discardServerDraft(draft) }
            Button("나중에", role: .cancel) { pendingServerDraft = nil }
        } message: { draft in
            Text(draftPromptMessage(draft))
        }
        .confirmationDialog("편집을 그만둘까요?", isPresented: $showLeaveDialog, titleVisibility: .visible) {
            Button("임시저장 지우고 나가기", role: .destructive) {
                Task {
                    await deleteServerDraftIfAny()
                    leaveAction?()
                }
            }
            Button("임시저장 두고 나가기") { leaveAction?() }
            Button("계속 편집", role: .cancel) {}
        } message: {
            Text("저장하지 않은 내용은 서버 임시저장으로 남습니다. 다음에 이 글을 열면 불러올지 다시 묻습니다.")
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
                    .buttonStyle(.writerSecondary)
                Button("수정") {
                    appState.openEdit(post: post)
                }
                .buttonStyle(.writerPrimary)
            }
            .padding(.horizontal, BrandColors.panePadding)
            .padding(.vertical, BrandColors.toolbarVerticalPadding)
            .frame(minHeight: BrandColors.buttonHeight + BrandColors.toolbarVerticalPadding * 2 + 18)
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
                            WriterChip(text: PostCategory.displayTitle(for: post.category), style: .neutral, size: .badge)
                            WriterChip(
                                text: post.isPublished ? "공개" : "비공개",
                                style: post.isPublished ? .success : .muted,
                                size: .badge,
                                systemImage: post.isPublished ? "checkmark" : "lock"
                            )
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
                        if let caption = post.imageCaption?.trimmingCharacters(in: .whitespacesAndNewlines), !caption.isEmpty {
                            Text(caption)
                                .font(typography.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 20)
                                .padding(.top, 8)
                                .textSelection(.enabled)
                        }
                        Color.clear.frame(height: 20)
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        sectionHeader("본문")
                        if decoded.text.isEmpty {
                            Text("(본문 없음)")
                                .font(typography.body)
                                .foregroundStyle(.secondary)
                        } else {
                            let paragraphs = decoded.text
                                .components(separatedBy: "\n\n")
                                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                                .filter { !$0.isEmpty }
                            ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, para in
                                Text(para)
                                    .font(typography.body)
                                    .lineSpacing(4)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .textSelection(.enabled)
                                    .padding(.bottom, 10)
                            }
                        }

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
                                    Text("이미지 \(idx + 1): \(url.hasPrefix("data:") ? "(첨부 이미지)" : url)")
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
                                labeledRow(post.isPublished ? "공개 시각" : "공개 예정", APIDates.display(at, kind: .kst))
                            } else if let created = post.createdAt, !created.isEmpty {
                                labeledRow("작성", APIDates.display(created, kind: .utc))
                            }
                            if let updated = post.updatedAt, !updated.isEmpty {
                                labeledRow("마지막 수정", APIDates.display(updated, kind: .utc))
                            }
                            Text("시각은 한국 시간(KST) 기준입니다.")
                                .font(typography.caption2)
                                .foregroundStyle(.tertiary)
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

    // MARK: - Editable editor

    private var editableEditor: some View {
        VStack(spacing: 0) {
            editToolbar
            Divider()
            // grouped Form 은 스스로 스크롤한다 — ScrollView 로 한 번 더 감싸면 높이 계산이 어긋난다.
            Form {
                // 1. 제목 (필수)
                Section {
                    fieldLabel("제목", required: true)
                    TextField("제목을 입력해 주세요", text: $title)
                        .font(typography.bodySemibold)
                        .multilineTextAlignment(.leading)
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
                        .multilineTextAlignment(.leading)
                }

                // 3. 스페셜 피처 (선택) + 4. 기존 특집 불러오기
                Section {
                    fieldLabel("스페셜 피처", required: false)
                    TextField("특집명 직접 입력", text: $specialFeature)
                        .multilineTextAlignment(.leading)
                    fieldLabel("등록된 특집에서 선택", required: false)
                    Text("이미 쓴 특집명을 고르면 위 칸이 채워집니다.")
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                    if appState.specialFeatures.isEmpty {
                        Text("이 카테고리에 등록된 특집이 없습니다.")
                            .font(typography.caption)
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
                                .buttonStyle(.writerSecondary)
                            if coverDataURL != nil {
                                Button("제거", role: .destructive) {
                                    coverDataURL = nil
                                    coverPreview = nil
                                    scheduleAutosave()
                                }
                                .buttonStyle(.writerDestructive)
                            }
                        }
                    }
                }

                // 5b. 출처 / 캡션 (선택)
                Section {
                    fieldLabel("출처 / 캡션", required: false)
                    TextField("이미지 출처 또는 캡션 (선택)", text: $imageCaption)
                        .multilineTextAlignment(.leading)
                        .onChange(of: imageCaption) { _, _ in scheduleAutosave() }
                }

                // 6. 본문 (필수)
                Section {
                    fieldLabel("본문", required: true)
                    TextEditor(text: $bodyText)
                        .font(typography.body)
                        .multilineTextAlignment(.leading)
                        .frame(minHeight: 240)
                        .padding(6)
                        .background(BrandColors.canvasWhite)
                        .overlay(
                            RoundedRectangle(cornerRadius: BrandColors.chipRadius, style: .continuous)
                                .stroke(BrandColors.scoutingPurple.opacity(0.25), lineWidth: 1)
                        )
                    if originalContentJSON != nil {
                        InlineNotice(text: "빈 줄 하나가 문단 하나입니다. 손대지 않은 문단·소제목·목록·표와 사진 설명은 그대로 남습니다.", kind: .info)
                    } else {
                        Text("빈 줄 하나가 문단 하나입니다.")
                            .font(typography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // 7. 본문 이미지 (선택)
                Section {
                    fieldLabel("본문 이미지", required: false)
                    Text("본문에 붙일 이미지 \(bodyImageDataURLs.count)장")
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                    Button("본문 이미지 추가…") { pickBodyImages() }
                        .buttonStyle(.writerSecondary)
                    ForEach(Array(bodyImageDataURLs.enumerated()), id: \.offset) { idx, url in
                        HStack {
                            Text(imageLabel(url, index: idx))
                                .font(typography.caption)
                            Spacer()
                            Button("삭제", role: .destructive) {
                                bodyImageDataURLs.remove(at: idx)
                                scheduleAutosave()
                            }
                            .buttonStyle(.writerDestructive)
                        }
                    }
                }

                // 8. 메타 태그 (선택)
                Section {
                    fieldLabel("메타 태그", required: false)
                    Text("검색용 태그 · 쉼표로 구분")
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                    TextField("예: 스카우트,잼버리", text: $metaTags)
                        .multilineTextAlignment(.leading)
                    if !appState.metaTagPool.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(appState.metaTagPool.prefix(30), id: \.self) { tag in
                                    WriterChipButton(text: tag, style: .topic, help: "‘\(tag)’ 태그 추가") {
                                        appendMetaTag(tag)
                                    }
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
                        DatePicker("예약 시각", selection: $scheduleDate)
                        Text("예약 시각은 한국 시간(KST) 기준입니다.")
                            .font(typography.caption)
                            .foregroundStyle(.secondary)
                        if scheduleDate < Date() {
                            InlineNotice(text: "예약 시각이 이미 지났습니다. 미래 시각으로 바꿔야 저장됩니다.", kind: .warning)
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .environment(\.layoutDirection, .leftToRight)
        }
        .onChange(of: title) { _, _ in scheduleAutosave() }
        .onChange(of: subtitle) { _, _ in scheduleAutosave() }
        .onChange(of: bodyText) { _, _ in scheduleAutosave() }
        .onChange(of: metaTags) { _, _ in scheduleAutosave() }
        .onChange(of: specialFeature) { _, _ in scheduleAutosave() }
        .onChange(of: author) { _, _ in scheduleAutosave() }
        .onChange(of: publishMode) { _, _ in scheduleAutosave() }
        .onChange(of: category) { _, _ in scheduleAutosave() }
    }

    private var editToolbar: some View {
        HStack(spacing: 8) {
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
            if let draftStatus {
                Text(draftStatus)
                    .font(typography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if serverDraftID != nil {
                Button("임시저장 삭제") {
                    Task { await deleteServerDraftIfAny() }
                }
                .buttonStyle(.writerSecondary)
                .help("서버에 남은 임시저장을 지웁니다. 화면의 내용은 그대로입니다.")
            }
            if editingPost != nil {
                Button("취소") {
                    requestLeave {
                        if let id = editingPost?.id {
                            Task { await appState.openView(postID: id) }
                        } else {
                            appState.closeEditor()
                        }
                    }
                }
                .buttonStyle(.writerSecondary)
            }
            Button("닫기") {
                requestLeave { appState.closeEditor() }
            }
            .buttonStyle(.writerSecondary)
            Button {
                Task { await save() }
            } label: {
                if isSaving {
                    ProgressView().controlSize(.small)
                } else {
                    Text("저장")
                }
            }
            .buttonStyle(.writerPrimary)
            .keyboardShortcut("s", modifiers: [.command])
            .disabled(isSaving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, BrandColors.panePadding)
        .padding(.vertical, BrandColors.toolbarVerticalPadding)
        .frame(minHeight: BrandColors.buttonHeight + BrandColors.toolbarVerticalPadding * 2 + 18)
        .background(BrandColors.brandSurface)
    }

    private func fieldLabel(_ title: String, required: Bool) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(typography.headline)
                .foregroundStyle(BrandColors.scoutingPurple)
            WriterChip(text: required ? "필수" : "선택", style: required ? .filled : .neutral, size: .badge)
            Spacer(minLength: 0)
        }
    }

    private func imageLabel(_ url: String, index: Int) -> String {
        if url.hasPrefix("http") {
            return "이미지 \(index + 1) (서버에 있음)"
        }
        if url.hasPrefix("data:") {
            return "이미지 \(index + 1) (새로 첨부)"
        }
        return "이미지 \(index + 1)"
    }

    // MARK: - Load / reset

    /// Full state reset + reload. Driven by session id / onAppear — never rely on didLoad alone.
    private func reloadFromMode() {
        autosaveTask?.cancel()
        loadToken = UUID()
        resetFields()
        appState.inlineStatus = nil
        switch appState.editorMode {
        case .create:
            editingPost = nil
            originalContentJSON = nil
            baselineBodyText = ""
            baselineImageURLs = []
            serverDraftID = nil
            draftStatus = nil
            // 「새 글」은 빈 화면에서 시작한다. 서버 임시저장이 있으면 자동으로 넣지 않고 묻는다.
            applyDraft(LocalDraft())
            loadedSnapshot = currentDraft()
            lastPushedDraft = nil
            let token = loadToken
            Task {
                await appState.loadSpecialFeatures(for: category)
                await findServerDraft(editingPostID: nil, token: token)
            }
        case .edit(let post):
            applyPost(post)
            loadedSnapshot = currentDraft()
            lastPushedDraft = nil
            let token = loadToken
            Task { await findServerDraft(editingPostID: post.id, token: token) }
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
        imageCaption = ""
        bodyImageDataURLs = []
        editingPost = nil
        originalContentJSON = nil
        baselineBodyText = ""
        baselineImageURLs = []
        serverDraftID = nil
        draftStatus = nil
        isSaving = false
        loadedSnapshot = nil
        lastPushedDraft = nil
        pendingServerDraft = nil
        showDraftPrompt = false
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
        imageCaption = post.imageCaption ?? ""
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
        imageCaption = d.imageCaption
        bodyImageDataURLs = d.bodyImageDataURLs
        serverDraftID = d.serverDraftID
        if !d.publishAt.isEmpty, let date = parsePublishAt(d.publishAt) {
            scheduleDate = date
        }
        if let dataURL = d.coverDataURL, dataURL.hasPrefix("data:"), let img = nsImage(fromDataURL: dataURL) {
            coverPreview = img
        }
    }

    // MARK: - Autosave (server drafts)

    private func scheduleAutosave() {
        // View mode never autosaves.
        if case .view = appState.editorMode { return }
        autosaveTask?.cancel()
        autosaveTask = Task {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard !Task.isCancelled else { return }
            if case .view = appState.editorMode { return }
            let draft = currentDraft()
            // 화면을 채운 직후와 같거나 이미 올린 내용이면 보내지 않는다.
            if let loadedSnapshot, draft == loadedSnapshot { return }
            if let lastPushedDraft, draft == lastPushedDraft { return }
            appState.drafts.save(draft)
            await pushServerDraft(draft)
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
            imageCaption: imageCaption,
            bodyImageDataURLs: bodyImageDataURLs,
            editingPostID: editingPost?.id,
            expectedUpdatedAt: editingPost?.updatedAt,
            serverDraftID: serverDraftID
        )
    }

    private func serverDraftPayload() -> ServerDraftPayload {
        var publishedFlag = true
        var publishAt: String? = nil
        switch publishMode {
        case .immediate:
            publishedFlag = true
            publishAt = nil
        case .schedule:
            publishedFlag = false
            publishAt = formatPublishAt(scheduleDate)
        case .hold:
            publishedFlag = false
            publishAt = nil
        }
        return ServerDraftPayload(
            editingPostId: editingPost?.id,
            title: title,
            subtitle: subtitle.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            category: category.rawValue,
            metaTags: metaTags.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            author: author.nilIfEmpty,
            publishAt: publishAt,
            imageURL: coverDataURL,
            imageCaption: imageCaption.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            specialFeature: specialFeature.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            content: resolveContentJSON(),
            publishedFlag: publishedFlag
        )
    }

    @MainActor
    private func pushServerDraft(_ draft: LocalDraft) async {
        let payload = serverDraftPayload()
        do {
            let saved: ServerDraft
            if let id = serverDraftID {
                saved = try await appState.api.updateDraft(id: id, payload: payload)
            } else {
                saved = try await appState.api.createDraft(payload)
            }
            serverDraftID = saved.id
            var stored = draft
            stored.serverDraftID = saved.id
            appState.drafts.save(stored)
            lastPushedDraft = stored
            draftStatus = "임시저장됨 \(APIDates.clock())"
        } catch let error as APIError {
            // 실패는 툴바 한 줄로만 알린다. 타이핑을 멈출 때마다 모달이 뜨면 일을 못 한다.
            if error.statusCode == 403 {
                draftStatus = "임시저장 안 됨 (권한 없음)"
                if !permissionErrorShown {
                    permissionErrorShown = true
                    appState.showNotice("이 계정은 서버 임시저장 권한이 없습니다. 이 기기에만 임시 보관합니다.", title: "임시저장")
                }
            } else if error.statusCode == 401 {
                draftStatus = "임시저장 안 됨 (로그인 필요)"
            } else {
                draftStatus = "임시저장 안 됨 · \(error.message)"
            }
        } catch {
            draftStatus = "임시저장 안 됨 (오프라인)"
        }
    }

    /// 서버 임시저장을 찾아 **묻는다.** 예전엔 자동으로 덮어써서, 취소하고 나간 옛 draft 가
    /// 다른 편집자의 최신 수정을 소리 없이 지웠다.
    @MainActor
    private func findServerDraft(editingPostID: Int?, token: UUID) async {
        do {
            let drafts = try await appState.api.fetchDrafts()
            guard token == loadToken else { return } // 다른 글로 넘어갔으면 버린다
            let match: ServerDraft?
            if let editingPostID {
                match = drafts.first { $0.editingPostId == editingPostID }
            } else {
                match = drafts
                    .filter { $0.editingPostId == nil }
                    .sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
                    .first
            }
            guard let match else { return }
            pendingServerDraft = match
            showDraftPrompt = true
        } catch {
            // Offline / permission — keep local backup only.
        }
    }

    private func draftPromptMessage(_ d: ServerDraft) -> String {
        var lines: [String] = []
        let when = APIDates.display(d.updatedAt, kind: .utc)
        if !when.isEmpty { lines.append("마지막 임시저장 \(when)") }
        if let t = d.title, !t.isEmpty { lines.append("제목: \(t)") }
        if let post = editingPost,
           let draftAt = APIDates.parse(d.updatedAt, kind: .utc),
           let postAt = APIDates.parse(post.updatedAt, kind: .utc),
           draftAt < postAt {
            lines.append("⚠︎ 이 글은 임시저장 뒤에 \(APIDates.display(postAt)) 에 다시 수정됐습니다. 불러오면 그 수정 위에 옛 내용을 덮어씁니다.")
        }
        lines.append("불러오면 지금 화면의 내용을 임시저장으로 바꿉니다. 버리면 서버에서 지웁니다.")
        return lines.joined(separator: "\n")
    }

    private func acceptServerDraft(_ d: ServerDraft) {
        pendingServerDraft = nil
        if let title = d.title, !title.isEmpty { self.title = title }
        if let subtitle = d.subtitle { self.subtitle = subtitle }
        if let cat = d.category, let parsed = PostCategory(rawValue: cat) { category = parsed }
        if let author = d.author, !author.isEmpty { self.author = author }
        if let meta = d.metaTags { metaTags = meta }
        if let feature = d.specialFeature { specialFeature = feature }
        if let caption = d.imageCaption { imageCaption = caption }
        if let url = d.imageURL, !url.isEmpty {
            coverDataURL = url
            coverPreview = nil
        }
        if let content = d.content, !content.isEmpty {
            // 편집 중인 글이 있으면 원본은 그 글의 JSON 을 유지한다 — 병합 기준은 서버 글이다.
            if editingPost == nil { originalContentJSON = content }
            let decoded = EditorJSCodec.decode(content)
            bodyText = decoded.text
            bodyImageDataURLs = decoded.imageURLs
        }
        if let at = d.publishAt, !at.isEmpty, let date = parsePublishAt(at) {
            publishMode = .schedule
            scheduleDate = date
        } else if d.publishedFlag == false, editingPost == nil {
            publishMode = .hold
        }
        serverDraftID = d.id
        draftStatus = "임시저장 불러옴"
        lastPushedDraft = currentDraft()
    }

    private func discardServerDraft(_ d: ServerDraft) {
        pendingServerDraft = nil
        Task {
            do {
                try await appState.api.deleteDraft(id: d.id)
                draftStatus = "임시저장 버림"
            } catch let error as APIError {
                draftStatus = "임시저장을 지우지 못함 · \(error.message)"
            } catch {
                draftStatus = "임시저장을 지우지 못함"
            }
        }
    }

    private func deleteServerDraftIfAny() async {
        appState.drafts.clear()
        guard let id = serverDraftID else { return }
        do {
            try await appState.api.deleteDraft(id: id)
            serverDraftID = nil
            draftStatus = "임시저장 삭제됨"
            lastPushedDraft = nil
        } catch let error as APIError {
            draftStatus = "임시저장을 지우지 못함 · \(error.message)"
        } catch {
            draftStatus = "임시저장을 지우지 못함"
        }
    }

    /// 나가기 전에 묻는다 — 고친 게 있거나 서버 임시저장이 남아 있을 때만.
    private func requestLeave(_ action: @escaping () -> Void) {
        autosaveTask?.cancel()
        let dirty = loadedSnapshot.map { $0 != currentDraft() } ?? false
        if dirty || serverDraftID != nil {
            leaveAction = action
            showLeaveDialog = true
        } else {
            action()
        }
    }

    private func clearServerDraftAfterSave() async {
        guard let id = serverDraftID else {
            appState.drafts.clear()
            return
        }
        do {
            try await appState.api.deleteDraft(id: id)
        } catch {
            // Best-effort; local clear still happens.
        }
        serverDraftID = nil
        lastPushedDraft = nil
        appState.drafts.clear()
    }

    // MARK: - Content

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
        // 원본이 있으면 병합 — 손대지 않은 블록(헤더·목록·표·사진 캡션·위치)을 그대로 남긴다.
        return EditorJSCodec.merge(original: originalContentJSON, plainText: bodyText, imageURLs: bodyImageDataURLs)
    }

    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        autosaveTask?.cancel()

        // Hard guarantee: create mode never carries an editingPost (no accidental PUT).
        if case .create = appState.editorMode {
            editingPost = nil
        }

        if publishMode == .schedule, scheduleDate < Date() {
            appState.showNotice("예약 시각이 이미 지났습니다. 미래 시각으로 바꾸거나 즉시 공개·비공개 보관으로 바꿔 주세요.", title: "저장하지 못함")
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
            imageCaption: imageCaption.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            expectedUpdatedAt: nil
        )
        if let coverDataURL, coverDataURL.hasPrefix("data:") {
            if ImageCompressor.approximateByteLength(ofDataURL: coverDataURL) > ImageCompressor.maxEncodedBytes {
                appState.showNotice("대표 이미지가 너무 큽니다(약 4MB 초과). 더 작은 이미지로 줄인 뒤 다시 시도해 주세요.", title: "저장하지 못함")
                return
            }
            payload.imageData = coverDataURL
        } else if let coverDataURL, coverDataURL.hasPrefix("http") {
            payload.imageURL = coverDataURL
        }
        for url in bodyImageDataURLs where url.hasPrefix("data:") {
            if ImageCompressor.approximateByteLength(ofDataURL: url) > ImageCompressor.maxEncodedBytes {
                appState.showNotice("본문 이미지가 너무 큽니다(약 4MB 초과). 더 작은 이미지로 줄인 뒤 다시 시도해 주세요.", title: "저장하지 못함")
                return
            }
        }
        // editingPost == nil → POST create; non-nil → PUT with expected_updated_at
        guard let saved = await appState.savePost(payload, editing: editingPost) else { return }
        // 저장 성공 = 서버의 updated_at 이 방금 바뀌었다. 그 값을 여기서 받아 두지 않으면
        // 바로 이어지는 두 번째 저장이 옛 스탬프를 보내 409("다른 사용자가 먼저 수정")로 막힌다.
        editingPost = saved
        originalContentJSON = saved.content ?? content
        let decoded = EditorJSCodec.decode(originalContentJSON)
        baselineBodyText = decoded.text
        baselineImageURLs = decoded.imageURLs
        bodyImageDataURLs = decoded.imageURLs
        if let caption = saved.imageCaption { imageCaption = caption }
        if let url = saved.imageURL, !url.isEmpty {
            coverDataURL = url
            coverPreview = nil
        }
        await clearServerDraftAfterSave()
        loadedSnapshot = currentDraft()
        draftStatus = appState.inlineStatus
    }

    // MARK: - Helpers

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
            appState.showError(error.localizedDescription)
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
                appState.showError(error.localizedDescription)
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
        panel.title = multiple ? "본문 이미지 선택" : "대표 이미지 선택"
        return panel.runModal() == .OK ? panel.urls : []
    }

    private func nsImage(fromDataURL dataURL: String) -> NSImage? {
        guard let range = dataURL.range(of: "base64,") else { return nil }
        let b64 = String(dataURL[range.upperBound...])
        guard let data = Data(base64Encoded: b64) else { return nil }
        return NSImage(data: data)
    }

    private func formatPublishAt(_ date: Date) -> String {
        APIDates.kstWallClock(date)
    }

    private func parsePublishAt(_ raw: String) -> Date? {
        APIDates.parse(raw, kind: .kst)
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
