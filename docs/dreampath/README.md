---
tags: [hub, dreampath, api, entry-point]
aliases: [Dreampath Hub, 드림패스 허브]
scope: dreampath
---

# Dreampath Hub

## 이 문서의 목적

> [!abstract] Purpose & Scope
> **목적**: Dreampath 내부 협업 앱의 **기능, API, DB 구조**를 한눈에 파악하는 레퍼런스 허브
> **범위**: Dreampath 전용 (`dreampath.html`, `js/dreampath.js`, `functions/api/dreampath/*`)
> **제외**: 메인 홈페이지 (`index.html`, `js/main.js` 등) → [[CLAUDE]] §2 Site 참조
>
> 정식 Dev Rules는 `/dreampath` → 사이드바 "Dev Rules"에서 확인하십시오.
> 프로젝트 공통 규칙(아키텍처, DB, 배포)과 Dreampath 규칙은 [[CLAUDE]] §1·§5 참조.

## Architecture

```
dreampath.html          → 인라인 CSS + CDN imports
js/dreampath.js         → IIFE (window.DP), 모든 프론트엔드 로직
functions/api/dreampath/ → API Workers (D1 + R2)
```

## 기능 맵

| 기능 | 설명 | API |
|---|---|---|
| **인증** | HMAC-SHA256 세션, 1h TTL | `_middleware.js`, `login.js`, `session.js` |
| **게시판** | 동적 Board/Team Board 관리 | `boards.js` |
| **게시글** | CRUD, 접근 제어, 조회수 | `posts.js` |
| **댓글** | 게시글 댓글 스레드 | `comments.js` |
| **파일 업로드** | R2 저장, 확장자 차단 | `upload.js` |
| **회의록 승인** | 다중 승인자, 과반수 잠금 | `approvals.js` |
| **캘린더** | CRUD, 반복 일정 (daily~yearly) | `events.js` |
| **Tasks** | 할일 관리, 담당자 배정 | `tasks.js` |
| **Notes & Issues** | 메모/이슈/경고/제안, 누구나 작성 | `notes.js` |
| **홈** | 알림, 내 할일, 최근 변경 (접근 필터) | `home.js` |
| **검색** | 통합 검색 | `search.js` |
| **연락처** | 프로젝트 팀 연락처 | `contacts.js` |
| **사용자 관리** | 계정 CRUD, 부서, 아바타 | `users.js` |
| **버전** | 배포 버전 기록 | `versions.js` |
| **설정** | 색상 토큰, 게시판 관리 | `settings.js`, `boards.js` |

## API 엔드포인트 요약

### 게시판 (`/api/dreampath/boards`)

| Method | 설명 | 권한 |
|---|---|---|
| GET | 전체 게시판 목록 + 게시글 수 | 인증 |
| POST | 게시판 생성 | admin |
| DELETE | 게시판 삭제 (게시글 있으면 차단) | admin |

### 게시글 (`/api/dreampath/posts`)

| Method | 설명 | 권한 |
|---|---|---|
| GET `?board=X` | 게시글 목록 | 인증 (팀 보드 접근 제어) |
| GET `?id=N` | 단건 조회 (조회수 증가) | 인증 |
| POST | 게시글 작성 | admin / 자기 팀 보드 |
| PUT `?id=N` | 게시글 수정 | admin / 본인 글 |
| DELETE `?id=N` | 게시글 삭제 | admin |

### 캘린더 (`/api/dreampath/events`)

| Method | 설명 | 권한 |
|---|---|---|
| GET `?month=YYYY-MM` | 월별 일정 (반복 확장 포함) | 인증 |
| GET `?id=N` | 단건 + 수정 이력 | 인증 |
| POST | 일정 생성 (반복 설정 가능) | admin |
| PUT `?id=N` | 일정 수정 (edit_note 필수) | 인증 |
| DELETE `?id=N` | 일정 삭제 | admin |

### 승인 (`/api/dreampath/approvals`)

| Method | 설명 | 권한 |
|---|---|---|
| POST | 투표 / 승인자 추가·제거 | 인증 |

## DB 테이블

| 테이블 | 역할 |
|---|---|
| `dp_users` | 사용자 (username, role, department) |
| `dp_boards` | 게시판 정의 (slug, title, board_type) |
| `dp_board_posts` | 게시글 |
| `dp_post_files` | 게시글 첨부파일 |
| `dp_post_comments` | 게시글 댓글 |
| `dp_post_history` | 게시글 수정 이력 |
| `dp_post_approvals` | 회의록 승인 투표 |
| `dp_events` | 캘린더 이벤트 |
| `dp_event_history` | 이벤트 수정 이력 |
| `dp_tasks` | 할일 |
| `dp_notes` | 노트/이슈 |
| `dp_decisions` | PMO 의사결정 로그 |
| `dp_risks` | PMO 리스크/이슈 레지스터 |
| `dp_contacts` | 연락처 |
| `dp_versions` | 배포 버전 기록 |
| `dp_sessions` | 세션 |

## 관련 문서

### 프로젝트 공통
- [[CLAUDE]] — 프로젝트 전체 AI 규칙 (Dreampath 섹션 포함)

### 홈페이지 (별도 도메인)
- [[CLAUDE]] §2 Site — 메인 홈페이지 규칙
- [[docs/features/README|Homepage Features Hub]] — 홈페이지 기능 허브
- [[docs/modules/README|Homepage Modules Hub]] — 홈페이지 모듈 라이브러리

### 운영
- [[docs/release-playbook|Release Playbook]] — 배포 절차
- [[docs/stability-implementation-plan|Stability Plan]] — 안정성 계획

> [!tip] Obsidian 그래프 탐색
> `scope: dreampath` 태그로 필터링하면 Dreampath 관련 문서만 볼 수 있습니다.
> 홈페이지와의 경계는 `scope: homepage` vs `scope: dreampath`로 구분됩니다.
