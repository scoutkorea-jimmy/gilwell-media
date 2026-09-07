import SwiftUI

struct SettingsView: View {
    @AppStorage(TypographyStorage.sizeKey) private var sizeRaw = WriterFontSizeChoice.medium.rawValue
    @AppStorage(TypographyStorage.familyKey) private var familyRaw = WriterFontFamilyChoice.system.rawValue
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTypography) private var typography

    private var sizeBinding: Binding<WriterFontSizeChoice> {
        Binding(
            get: { WriterFontSizeChoice(rawValue: sizeRaw) ?? .medium },
            set: { sizeRaw = $0.rawValue }
        )
    }

    private var familyBinding: Binding<WriterFontFamilyChoice> {
        Binding(
            get: { WriterFontFamilyChoice(rawValue: familyRaw) ?? .system },
            set: { familyRaw = $0.rawValue }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("설정")
                    .font(typography.title2)
                    .foregroundStyle(BrandColors.scoutingPurple)
                Spacer()
                Button("완료") { dismiss() }
                    .buttonStyle(.writerPrimary)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(BrandColors.panePadding)
            .background(BrandColors.brandSurface)

            Divider()

            Form {
                Section {
                    Text("글자 크기")
                        .font(typography.headline)
                        .foregroundStyle(BrandColors.scoutingPurple)
                    Picker("글자 크기", selection: sizeBinding) {
                        ForEach(WriterFontSizeChoice.allCases) { choice in
                            Text(choice.titleKO).tag(choice)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    Text("목록·읽기 화면·에디터 본문에 적용됩니다.")
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Text("글꼴")
                        .font(typography.headline)
                        .foregroundStyle(BrandColors.scoutingPurple)
                    Picker("글꼴", selection: familyBinding) {
                        ForEach(WriterFontFamilyChoice.allCases) { choice in
                            Text(choice.titleKO).tag(choice)
                        }
                    }
                    .labelsHidden()

                    Text("시스템 · 본고딕(Apple SD Gothic Neo) · 명조(가능 시 Apple Myungjo / New York)")
                        .font(typography.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Text("미리보기")
                        .font(typography.headline)
                        .foregroundStyle(BrandColors.scoutingPurple)
                    let typo = AppTypography(
                        sizeChoice: sizeBinding.wrappedValue,
                        familyChoice: familyBinding.wrappedValue
                    )
                    VStack(alignment: .leading, spacing: 8) {
                        Text("제목 미리보기")
                            .font(typo.title2)
                            .foregroundStyle(BrandColors.scoutingPurple)
                        Text("본문 미리보기 — 스카우트 뉴스를 읽기 편하게 글자 크기와 글꼴을 바꿀 수 있습니다.")
                            .font(typo.body)
                            .foregroundStyle(.primary)
                        Text("메타 · 카테고리 · 날짜")
                            .font(typo.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(BrandColors.canvasWhite)
                    .overlay(
                        RoundedRectangle(cornerRadius: BrandColors.cardRadius)
                            .stroke(BrandColors.scoutingPurple.opacity(0.15), lineWidth: 1)
                    )
                }
            }
            .formStyle(.grouped)
            .padding(.bottom, 8)
        }
        .frame(minWidth: 420, minHeight: 420)
        .background(BrandColors.brandBackground)
        .tint(BrandColors.brandPrimary)
    }
}
