import SwiftUI

struct PostListView: View {
    @EnvironmentObject private var appState: AppState
    @State private var pendingDelete: PostSummary?
    @State private var confirmDelete = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("게시글")
                    .font(.headline)
                Spacer()
                Button {
                    appState.openNewPost()
                } label: {
                    Label("새 글", systemImage: "square.and.pencil")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

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
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = appState.listError, appState.posts.isEmpty {
                VStack(spacing: 8) {
                    Text(err).multilineTextAlignment(.center)
                    Button("다시 시도") {
                        Task { await appState.refreshPosts() }
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(appState.posts) { post in
                    Button {
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
                                    .background(post.isPublished ? Color.green.opacity(0.2) : Color.orange.opacity(0.2))
                                    .clipShape(Capsule())
                            }
                            HStack(spacing: 8) {
                                Text(post.category?.uppercased() ?? "-")
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
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("편집") {
                            Task { await appState.openEdit(postID: post.id) }
                        }
                        Button("삭제…", role: .destructive) {
                            pendingDelete = post
                            confirmDelete = true
                        }
                    }
                }
                .listStyle(.sidebar)
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
        }
        .frame(minWidth: 300)
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
}
