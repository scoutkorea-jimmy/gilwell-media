import SwiftUI

struct PostListView: View {
    @EnvironmentObject private var appState: AppState
    @State private var pendingDelete: PostSummary?
    @State private var confirmDelete = false
    @State private var selectedID: Int?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("게시글")
                    .font(.headline)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Spacer()
                Button {
                    appState.openNewPost()
                } label: {
                    Label("새 글", systemImage: "square.and.pencil")
                }
                .buttonStyle(.borderedProminent)
                .tint(BrandColors.brandPrimary)
                .controlSize(.small)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(BrandColors.brandSurface)

            VStack(alignment: .leading, spacing: 8) {
                TextField("제목·내용 검색", text: $appState.searchQuery)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: appState.searchQuery) { _, _ in
                        appState.scheduleRefresh()
                    }

                Picker("카테고리", selection: $appState.categoryFilter) {
                    Text("전체 카테고리").tag(Optional<PostCategory>.none)
                    ForEach(PostCategory.allCases) { cat in
                        Text(cat.titleKO).tag(Optional(cat))
                    }
                }
                .onChange(of: appState.categoryFilter) { _, _ in
                    Task { await appState.refreshPosts() }
                }

                Picker("공개", selection: $appState.publishedFilter) {
                    ForEach(PublishedFilter.allCases) { f in
                        Text(f.title).tag(f)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: appState.publishedFilter) { _, _ in
                    Task { await appState.refreshPosts() }
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)

            Divider()

            if appState.isLoadingList && appState.posts.isEmpty {
                ProgressView("불러오는 중…")
                    .tint(BrandColors.brandPrimary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = appState.listError, appState.posts.isEmpty {
                VStack(spacing: 8) {
                    Text(err).multilineTextAlignment(.center)
                    Button("다시 시도") {
                        Task { await appState.refreshPosts() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(BrandColors.brandPrimary)
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(appState.posts, selection: $selectedID) { post in
                    Button {
                        selectedID = post.id
                        Task { await appState.openEdit(postID: post.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(post.title ?? "(제목 없음)")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                Spacer()
                                Text(post.isPublished ? "공개" : "비공개")
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .foregroundStyle(post.isPublished ? BrandColors.forestGreen : BrandColors.midnightPurple)
                                    .background(
                                        (post.isPublished ? BrandColors.leafGreen : BrandColors.blossomPink)
                                            .opacity(0.35)
                                    )
                                    .clipShape(Capsule())
                            }
                            HStack(spacing: 8) {
                                categoryChip(post.category)
                                Text("·")
                                Text(post.displayDate)
                                if let author = post.author, !author.isEmpty {
                                    Text("·")
                                    Text(author)
                                }
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                        .padding(.horizontal, 4)
                        .background(
                            selectedID == post.id
                                ? BrandColors.scoutingPurple.opacity(0.12)
                                : Color.clear
                        )
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(
                        selectedID == post.id
                            ? BrandColors.scoutingPurple.opacity(0.08)
                            : BrandColors.canvasWhite
                    )
                    .contextMenu {
                        Button("편집") {
                            selectedID = post.id
                            Task { await appState.openEdit(postID: post.id) }
                        }
                        Button("삭제…", role: .destructive) {
                            pendingDelete = post
                            confirmDelete = true
                        }
                    }
                }
                .listStyle(.sidebar)
                .tint(BrandColors.brandPrimary)
            }

            Divider()
            HStack {
                Text("총 \(appState.totalPosts)건")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    appState.logout()
                } label: {
                    Text("로그아웃")
                }
                .controlSize(.small)
            }
            .padding(10)
            .background(BrandColors.brandSurface)
        }
        .frame(minWidth: 300)
        .background(BrandColors.brandBackground)
        .tint(BrandColors.brandPrimary)
        .task {
            if appState.isAuthenticated {
                await appState.refreshPosts()
                await appState.loadHelpers()
            }
        }
        .alert("게시글 삭제", isPresented: $confirmDelete, presenting: pendingDelete) { post in
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) {
                Task { await appState.deletePost(id: post.id) }
            }
        } message: { post in
            Text("「\(post.title ?? "#\(post.id)")」을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.")
        }
    }

    @ViewBuilder
    private func categoryChip(_ raw: String?) -> some View {
        let label = (raw ?? "-").uppercased()
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .foregroundStyle(BrandColors.midnightPurple)
            .background(BrandColors.riverBlue.opacity(0.45))
            .clipShape(Capsule())
    }
}
