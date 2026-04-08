# Homepage Runtime

## 역할

- 홈페이지 전용 데이터 로딩과 렌더링을 담당합니다.
- 홈 히어로, 메인 스토리, latest/popular/picks, 카테고리 컬럼을 조립합니다.

## Code Entry

- `js/home.js`
- 페이지 엔트리: `index.html`

## 핵심 정의

- `GW.HomePage`
- 홈 전용 렌더 함수들
- 홈 새로고침 라이프사이클

## 주 책임

- `/api/home` 데이터 수신
- 히어로 슬라이더 렌더
- 메인 스토리 렌더
- 미니 리스트 렌더
- 홈 pull-to-refresh와 탭 복귀 갱신

## 선행 의존

- [[GW Foundation]]
- [[Public Site Chrome]]

## 같이 보면 좋은 코드

- `index.html`
- `functions/api/home.js`

## 관련 템플릿

- [[Homepage Template]]

## 관련 API

- [[Home and Stats API]]
- [[Settings API]]

## 분리 후보

- hero renderer
- section rail renderer
- home refresh lifecycle
