# BP미디어 공개 홈페이지 작업 상태

공개 Site 정본은 이 worktree의 `main`, 배포 정적 루트는 `public/`이다. 연결된 `gilwell-media` worktree는 Mac Writer 작업용이다. 기술 구성과 실행 환경은 `README.md`, 승인·타겟별 규칙은 `AGENTS.md`와 `rules/`를 따른다.

## 2026-10-04 — 홈 스카우트 활동 안내 디자인

- `public/index.html`: 공통 `home-section-title`과 `home-rail-card`로 제목과 본문을 구성했다. 설명·네 주제 링크는 유지했다.
- `public/css/m3-site.css`, `public/css/topics.css`: 기존 M3 칩 규칙을 재사용하고 설명 크기·여백을 정리했다. 주제 상세 페이지 링크 스타일은 보존했다.
- 검증: 설치된 Chrome으로 1440/390/360/320px에서 가로 넘침 없음, 네 링크 44px 높이와 밑줄 제거 확인, 키보드 포커스 3px 확인. 데스크톱·모바일 캡처 시각 확인. APCA 본문 97.6, 칩 85.3, 포커스 84.4. `git diff --check` 통과. 원격 P0 조회 0건.
- 범위/위험: 공개 정적 HTML·CSS만 변경. 운영 데이터·인증·API 변경 없음. 로컬 검증이며 운영 반영은 승인 대기다.
- 검증 환경 참고: 기본 Playwright Chromium 실행 파일이 없어 최초 실행 실패. 추가 설치 없이 `channel: 'chrome'`으로 실제 브라우저 검증 완료. 정적 서버에는 API가 없어 홈 데이터 오류 알림이 표시되며 운영 오류의 증거가 아니다.
- 다음 작업: 사용자 커밋·배포 승인 후 `rules/02-versioning.md`, `rules/03-deploy.md`를 읽고 버전·changelog·자산 버전 동기화 및 release preflight를 수행한 다음 표준 배포와 라이브 화면 검증을 진행한다.

## 2026-10-08 — 단계별 아이콘 버튼과 사이트맵 검수

- 사용자 승인: 이번 요청의 내부 검수 2회 이후 커밋·푸시·production 배포 자동 진행.
- 기존 미배포 홈 스타일 변경을 보존·활용하며 네 링크에 발자국/나침반/산/악수 SVG를 추가했다. 공개 링크 의미와 목적지를 유지했다.
- 사이트맵: 배포 전 apex·www 리다이렉트·Googlebot·Yeti GET에서 일반/뉴스 XML 정상. 보고된 HTML 응답은 재현되지 않았으며 정확한 오류 URL 확인 대기. 원인 해결을 단정하지 않는다.
- 응답 길이만 검사하던 기존 회귀 검사를 XML Content-Type·GET/HEAD·HTML 부재 확인으로 강화하고 표준 배포 후 검사에 두 XML 파싱을 추가했다.
- SQLite fixture의 special_feature 누락으로 사이트맵 오류가 숨겨지던 기존 테스트를 수정하고 공개 기사 포함/초안 제외를 확인했다.
- 검증/실패 근거: work/gpt-scout-buttons-20261008. 운영 데이터·인증 변경 없음. 잔여위험은 검색서비스가 기록한 과거 오류/실제 색인 상태 미확인.

- 내부 검수 1회: SQLite/주제 페이지 및 라이브 XML GET/HEAD 통과, Chrome 1440/390/360/320 캡처 확인. 320px 줄 배치 개선 필요 발견.
- 내부 검수 2회: 모바일 2열 정리 후 UI 회귀/주제 SQLite/XML 검사 모두 통과, 4폭 캡처 확인. APCA 라벨85.34·포커스84.41, 메타데이터·노출 경계·diff 검사 통과.
- 기존 2026-10-03 외장 암호화 D1/R2 백업 파일 readback SHA256을 검증 기록과 대조해 일치 확인. 이 요청은 데이터 모델/DB 변경 없음, 이전 커밋 및 이번 release snapshot으로 코드 롤백 가능.
