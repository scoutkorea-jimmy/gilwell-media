# Preview Release Checklist

## 목적

프로덕션 반영 전에 preview URL에서 핵심 화면과 회귀 포인트를 빠르게 점검한다.

## 기본 흐름

1. `./scripts/deploy_preview.sh`
2. 배포 출력에서 preview URL 확보
3. `./scripts/post_deploy_check.sh <preview-url>`
4. 아래 수동 점검 항목 확인
5. 승인 후에만 `main`에서 `./scripts/deploy_production.sh`

## 수동 점검 항목

### 공개 화면

1. 홈 첫 화면
2. 메인 스토리 / 최신 소식 / 인기 소식 / 에디터 추천 레이아웃
3. Korea / APR / WOSM / Scout People 보드 헤더와 카드
4. 최신 기사 상세 1건
5. 검색 페이지
6. 용어집 페이지
7. 푸터 빌드 버전과 관리자 링크

### 관리자 화면

1. 로그인 화면
2. 최상단 헤더와 상위 그룹 버튼
3. 운영 개요 통계
4. 게시글 목록 타이포와 메타
5. 글 작성 폼
6. 사이트 설정 / 번역 / 기여자 / 기록 탭

### 모바일 점검

1. 홈 상단과 섹션 헤더
2. 기사 상세 상단
3. 관리자 첫 화면
4. 최근 수정 구간의 가로 깨짐 여부

## 우선 확인 포인트

- 날짜 규칙: `publish_at / created_at / updated_at`
- 최신 정렬: 홈 `최신 소식`
- 관리자 타이포 스케일
- 홈 헤더/보드 헤더 높이
- 검색, 토스트, 버튼 높이 통일
