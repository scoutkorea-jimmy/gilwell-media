# 공식 검색어 성과 모니터링

관리자 **분석 → 방문 분석 → 검색어 성과 모니터링**에 Google·Naver 검색어·클릭·노출·CTR을 모아 표시한다. 서버에 저장한 결과는 방문 분석 보기 권한이 있는 관리자가 어느 기기·브라우저에서든 함께 볼 수 있다. 확장 설치나 기기별 수집기는 없다. 기존 방문 기록 통계는 유지한다.

## 가져오는 방법

### Google — 구글 불러오기

버튼을 누르면 서버가 Search Console 공식 API의 `sc-domain:bpmedia.net` 웹 검색 실적을 조회한다. 읽기 전용 `webmasters.readonly` 범위의 서비스 계정을 사용한다. Google의 PT 기준 3일 전을 종료일로 하는 최근 28일 **확정 데이터**를 가져온다. 집계 종료일·가져온 KST 시각을 표시한다. 공개 검색어 페이지를 끝까지 조회하고 전체 클릭 수는 검색어 차원 없이 별도로 조회한다.

Google API는 내부 데이터 제한 때문에 모든 검색어 행 반환을 보장하지 않는다. 비공개 검색어·API가 반환하지 않는 검색어는 복원하지 않는다. 전체 클릭과 공개 검색어 클릭 합계의 차이를 비공개 검색어의 정확한 수라고 설명하지 않는다.

### Naver — 네이버 표 붙여넣기

1. 네이버 서치어드바이저의 BP미디어 콘텐츠 노출/클릭 보고서를 연다.
2. **최근 30일 · PC + Mobile**을 선택한다. 보고서의 `최근 업데이트` 날짜와 `최근 총 클릭`을 관리자 입력란에 입력한다.
3. **검색 키워드 TOP 30** 표의 순위·검색어·클릭·노출·CTR 열을 복사한다. 모든 페이지를 순서대로 복사해 붙여넣기 칸에 이어 붙인다. 페이지마다 포함되는 표 제목·열 제목은 허용한다.
4. 표의 마지막 순위를 **전체 행 수**로 입력한다. 검색어가 없으면 0과 빈 표를 입력한다.
5. 기간·PC + Mobile·모든 페이지를 확인했다는 확인란을 체크한 뒤 **검사 후 저장**을 누른다.

서버는 순위 1부터 선언한 마지막 순위까지의 연속성, 전체 행 수, 중복 검색어, 숫자·날짜를 검사한다. 실제 공식 보고서의 기간·전체 행 수와 일치하는지는 운영자가 확인한다. 잘못된 표·누락·중복·오래된 기준일·저장 실패 시 이전 보고서와 붙여넣은 입력을 유지한다. 네이버 공개 보고서는 TOP 30이므로 그 밖의 검색어는 포함되지 않는다.

## Google 서버 연결 — 한 번만 설정

1. BP미디어가 사용하는 Google Cloud 프로젝트에서 Search Console API를 활성화한다.
2. 보고서용 서비스 계정을 준비한다. 이 작업은 새로운 자격 증명과 사이트 보고서 접근을 부여하므로 현재 사용자 승인 범위에서 진행한다. 불필요한 Cloud IAM 역할·도메인 전체 위임·Search Console 소유자 권한을 부여하지 않는다.
3. `bpmedia.net` Search Console의 **설정 → 사용자 및 권한**에서 서비스 계정 이메일을 제한된 사용자로 추가한다. 실제 API 조회 성공으로 필요한 읽기 권한을 확인한다.
4. 서비스 계정 JSON 키를 Cloudflare Pages 프로젝트 `gilwell-media`의 **secret** `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`으로 설정한다. CLI 사용 시 보호된 기기 로컬 파일을 표준 입력으로 전달한다. 키를 Git·공유 Desktop·보고서·채팅·로그에 넣지 않는다. 서버의 D1 설정이나 관리자 화면에도 저장하지 않는다.
5. 관리자에서 구글 불러오기를 실행해 API 결과와 저장·화면 반영을 확인한다. 로컬 개발은 Git에서 제외된 `.dev.vars`에 해당 키를 설정한다.
6. 연결 해제는 Search Console의 서비스 계정 접근 권한 제거와 JSON 키 폐기·서버 secret 제거로 진행한다. 키를 교체한 경우 새 키 조회 성공을 확인한 뒤 기존 키를 폐기한다.

## 권한·보존·한계

- GET은 `view:analytics-visits`, POST는 `write:analytics-visits`와 기존 쓰기 rate limit·same-origin 보호를 사용한다. 읽기 권한만 있는 사용자는 가져오기 버튼을 볼 수 없다.
- 인증 정보는 클라이언트에 반환하지 않는다. GET의 `google_configured`는 서버 secret 설정 유무만 나타내며 실제 API 연결 성공을 보장하지 않는다. Google 토큰 요청·API 실패 원문은 화면이나 로그에 전달하지 않는다.
- 엔진별 최신 스냅샷은 기존 `settings`, 이전 값은 `settings_history`에 보존한다. D1 batch/비교 조건으로 동시 갱신 충돌을 감지한다. 기존 인증·게시글·방문 데이터는 변경하지 않는다.
- shortcut: 최대 10000행·1 MiB 스냅샷. 초과하면 부분 저장하지 않고 오류를 표시한다. 이 한도에 도달하면 검색어별 저장소로 이관한다.
- 두 엔진의 기간·집계 기준이 달라 전체 클릭 수를 합산하지 않는다. 마지막 가져오기가 7일 이상 지났으면 갱신을 안내한다. 네이버 표 입력은 자동 조회가 아니다. 예약 작업은 없다.

## 검증

`node --test scripts/search-performance/search-performance.test.mjs`: 네이버 표 파싱·누락/중복·숫자/날짜·Google 읽기 전용 JWT 서명·API 페이지 이동·PT 날짜·API 권한·저장 이력/실패 보존·화면 출력 검증. 실제 Google 서비스 계정 권한·Cloudflare secret·운영 배포·D1 저장·다른 실제 기기 조회는 별도로 검증해야 한다.

근거: [Google Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [Google 서버 간 인증](https://developers.google.com/identity/protocols/oauth2/service-account), [네이버 콘텐츠 노출/클릭 및 TOP 30](https://searchadvisor.naver.com/guide/report-expose-ctr).
