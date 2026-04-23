/**
 * BP미디어 KMS (Knowledge Management System)
 * 기능정의서 · API 가이드 · 버전기록 통합 문서 포털
 */
(function () {
  'use strict';

  // ── 상태 ──────────────────────────────────────────────────────
  var _state = {
    loaded: false,
    mode: 'read',          // 'read' | 'edit'
    tab: 'docs',           // 'docs' | 'api' | 'changelog'
    changelogPage: 1,      // 1-indexed, 30 items per page
    docUpdatedAt: '',      // settings_history.saved_at (UTC)
    sidebarOpen: false,
    searchQuery: '',
    changelogScope: 'all',
    changelogItems: null,
    saveBusy: false,
    docContent: '',
  };

  // ── API 가이드 데이터 ──────────────────────────────────────────
  var API_GROUPS = [
    {
      id: 'auth',
      label: '인증 (Authentication)',
      desc: '서명된 관리자 세션 쿠키 발급 및 세션 검증.',
      endpoints: [
        {
          method: 'POST', path: '/api/admin/login', auth: false,
          summary: '관리자 비밀번호로 서명된 세션 쿠키 발급',
          request: '{ "password": "string" }',
          response: '{ "token": "string", "role": "full" }',
          notes: '유효기간 24시간. 브라우저는 HttpOnly 세션 쿠키를 받고, 클라이언트는 sessionStorage에 lightweight 상태만 보조 저장한다.',
        },
        {
          method: 'GET', path: '/api/admin/session', auth: 'optional',
          summary: '현재 세션 유효성 및 역할 반환',
          response: '{ "authenticated": true, "role": "full" }',
          notes: 'same-origin cookie 기반 로그인 상태 확인에 사용한다.',
        },
      ],
    },
    {
      id: 'posts',
      label: '게시글 (Posts)',
      desc: '게시글 CRUD, 정렬, 이미지, 편집 이력, 공감 관리.',
      endpoints: [
        {
          method: 'GET', path: '/api/posts', auth: false,
          summary: '게시글 목록 조회 (페이지네이션)',
          params: [
            { name: 'category', desc: 'korea | apr | wosm | people | latest — 카테고리 필터' },
            { name: 'page', desc: '페이지 번호 (기본 1)' },
            { name: 'limit', desc: '한 페이지 개수 (기본 20)' },
            { name: 'sort', desc: 'latest | oldest | views | manual | relevance' },
            { name: 'q', desc: '검색어 (전문검색, sort=relevance 자동 적용)' },
            { name: 'tag', desc: '태그 필터 (tag 또는 meta_tags 필드에 LIKE 매치). 태그 인사이트 패널의 노드 클릭 모달이 이 파라미터를 사용해 관련 기사를 페이지네이션으로 가져옵니다.' },
            { name: 'start_date / end_date', desc: 'YYYY-MM-DD 날짜 범위 필터' },
            { name: 'days', desc: '최근 N일 이내 필터' },
            { name: 'featured', desc: 'true — 특집 기사만 조회' },
            { name: 'published', desc: 'true=공개만(기본), false=전체(admin 전용)' },
          ],
          response: '{ "posts": Post[], "total": number, "page": number, "pageSize": number }',
          notes: '공개 요청: max-age 120s + stale-while-revalidate 600s 캐시. admin 토큰 포함 시 no-cache.',
        },
        {
          method: 'POST', path: '/api/posts', auth: true,
          summary: '게시글 생성 (관리자 전용)',
          request: '{ title*, content*, category*, subtitle, image_url, image_caption,\n  gallery_images[], youtube_url, location_name, location_address,\n  tag, meta_tags[], special_feature, ai_assisted, publish_at }',
          response: '생성된 Post 객체',
          notes: '* 필수 항목. gallery_images 최대 10장. content는 Editor.js JSON 문자열.',
        },
        {
          method: 'GET', path: '/api/posts/:id', auth: false,
          summary: '게시글 상세 조회 (본문 포함)',
          response: 'Post 객체 — content(Editor.js JSON), related_posts[], gallery_images[] 포함',
        },
        {
          method: 'PUT', path: '/api/posts/:id', auth: true,
          summary: '게시글 수정 (관리자 전용)',
          request: 'POST와 동일 필드 (부분 업데이트 가능)',
          response: '수정된 Post 객체',
          notes: '수정 시 자동으로 post_history에 이전 버전을 저장합니다.',
        },
        {
          method: 'DELETE', path: '/api/posts/:id', auth: true,
          summary: '게시글 삭제 — 이미지·조회·공감·이력 연관 정리 포함',
          response: '{ "success": true }',
          notes: '게시글 row만 삭제하지 않습니다. 연관 데이터 일괄 정리 필수.',
        },
        {
          method: 'GET', path: '/api/posts/popular', auth: false,
          summary: '인기 게시글 목록 (조회수 기준)',
          response: 'Post[] — views 내림차순',
        },
        {
          method: 'PUT', path: '/api/posts/reorder', auth: true,
          summary: '게시글 수동 정렬 순서 변경',
          request: '{ "ids": [1, 2, 3] }  — 정렬 순서로 나열된 ID 배열',
          response: '{ "success": true }',
        },
        {
          method: 'GET', path: '/api/posts/special-features', auth: false,
          summary: '특집 기사 묶음명 목록',
          params: [{ name: 'category', desc: '카테고리 필터 (선택)' }],
          response: '{ "items": ["묶음명1", "묶음명2"] }',
        },
        {
          method: 'GET', path: '/api/posts/tags', auth: false,
          summary: '카테고리별 사용 가능한 태그 목록',
          params: [{ name: 'category', desc: 'korea | apr | wosm | people' }],
          response: '{ "items": ["태그1", "태그2"] }',
        },
        {
          method: 'GET', path: '/api/posts/:id/history', auth: true,
          summary: '게시글 편집 이력 조회',
          response: '{ "items": PostHistory[] }',
        },
        {
          method: 'GET', path: '/api/posts/:id/image', auth: false,
          summary: '게시글 대표 이미지 (og:image 용도)',
          response: '이미지 바이너리 또는 리다이렉트',
        },
        {
          method: 'POST', path: '/api/posts/:id/like', auth: false,
          summary: '게시글 공감/취소 토글',
          request: '{ "liked": true }',
          response: '{ "likes": number }',
        },
      ],
    },
    {
      id: 'settings',
      label: '사이트 설정 (Settings)',
      desc: '사이트 운영 설정 전반. GET은 공개, PUT은 관리자 전용.',
      endpoints: [
        {
          method: 'GET|PUT', path: '/api/settings/author', auth: 'PUT only',
          summary: '기본 작성자 이름',
          response: '{ "value": "편집부" }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/ticker', auth: 'PUT only',
          summary: '마퀴 티커 항목 목록',
          response: '{ "items": ["공지1", "공지2"] }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/hero', auth: 'PUT only',
          summary: '홈 히어로 슬라이드 (최대 5개 + 전환 간격)',
          response: '{ "items": HeroItem[], "interval": 3000 }',
          notes: 'HeroItem: { post_id, image_position_pc, image_position_mobile, zoom_pc, zoom_mobile }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/tags', auth: 'PUT only',
          summary: '카테고리별 태그 목록',
          response: '{ "common": [], "korea": [], "apr": [], "wosm": [], "people": [] }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/contributors', auth: 'PUT only',
          summary: '도움을 주신 분들 목록',
          response: '{ "items": [{ "name": "홍길동", "role": "기자" }] }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/editors', auth: 'PUT only',
          summary: '편집자 이름 (A / B / C)',
          response: '{ "A": "편집자A", "B": "편집자B", "C": "편집자C" }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/site-meta', auth: 'PUT only',
          summary: '사이트 메타 정보 (제목, 설명, OG 이미지)',
          response: '{ "title": "BP미디어", "description": "…", "image_url": "…" }',
        },
        {
          method: 'POST', path: '/api/settings/site-meta/image', auth: true,
          summary: '사이트 메타 대표 이미지 업로드',
          request: '{ "image": "data:image/jpeg;base64,…" }',
          response: '{ "image_url": "https://…" }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/ai-disclaimer', auth: 'PUT only',
          summary: 'AI 보조 작성 고지 텍스트',
          response: '{ "content": "이 기사는 AI의 보조로 작성되었습니다." }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/home-lead', auth: 'PUT only',
          summary: '홈 메인 스토리 이미지 및 프레이밍 설정',
          response: '{ "image_url": "…", "framing": { "x": 50, "y": 30 } }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/board-banner', auth: 'PUT only',
          summary: '카테고리 게시판 커스텀 배너',
          response: '{ "banners": { "korea": { "image_url": "…", "title": "…" } } }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/board-layout', auth: 'PUT only',
          summary: '게시판 레이아웃 및 페이지 사이즈 설정',
          response: '{ "layout": "grid", "pageSize": 20 }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/calendar-copy', auth: 'PUT only',
          summary: '캘린더 페이지 UI 텍스트 (키-값 쌍)',
          response: '{ "page_title": "일정 캘린더", "map_title": "캘린더 지도", … }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/calendar-tags', auth: 'PUT only',
          summary: '캘린더 이벤트 태그 목록',
          response: '{ "items": ["훈련", "대회", "세미나"] }',
        },
        {
          method: 'GET|PUT', path: '/api/settings/feature-definition', auth: 'PUT only',
          summary: 'KMS 기능 정의서 Markdown 원문 저장소',
          response: '{ "content": "# BP미디어 기능정의서…" }',
          notes: '이 엔드포인트가 KMS의 단일 진실 원본(single source of truth)입니다.',
        },
        {
          method: 'GET|PUT', path: '/api/settings/translations', auth: 'PUT only',
          summary: 'UI 다국어 번역 오버라이드 (ko / en)',
          response: '{ "ko": { "nav.home": "홈" }, "en": { "nav.home": "Home" } }',
        },
      ],
    },
    {
      id: 'calendar',
      label: '캘린더 (Calendar)',
      desc: '스카우트 행사 일정 조회 및 관리. DB 테이블: calendar_events.',
      endpoints: [
        {
          method: 'GET', path: '/api/calendar', auth: false,
          summary: '전체 캘린더 이벤트 목록 조회',
          response: '{ "items": CalendarEvent[] }',
          notes: 'CalendarEvent: { id, title, title_original, event_category, start_at, end_at, location_name, latitude, longitude, country_name, description, link_url, event_tags[], target_groups[], related_posts[] }',
        },
        {
          method: 'PUT', path: '/api/calendar/:id', auth: true,
          summary: '캘린더 이벤트 수정 (관리자 전용)',
          request: '{ title, title_original, event_category, start_at, end_at,\n  location_name, location_address, latitude, longitude, country_name,\n  description, link_url, event_tags[], target_groups[], related_posts[] }',
          response: '수정된 CalendarEvent 객체',
          notes: 'event_category: KOR | APR | EUR | AFR | ARB | IAR | WOSM\ntarget_groups (KOR 전용): 비버|컵|스카우트|벤처|로버|지도자|범스카우트|훈련교수회',
        },
      ],
    },
    {
      id: 'glossary',
      label: '용어집 (Glossary)',
      desc: '스카우트 관련 용어 조회 및 관리. 한국어 가나다 버킷으로 분류.',
      endpoints: [
        {
          method: 'GET', path: '/api/glossary', auth: false,
          summary: '전체 용어 목록 (가나다 버킷 분류)',
          params: [{ name: 'q', desc: '검색어 필터 (선택)' }],
          response: '{ "items": GlossaryTerm[], "buckets": { "가": [], "나": [], … } }',
          notes: 'GlossaryTerm: { id, ko, en, fr, description }. 숫자 시작→기타, 한국어 없음→국문 미확정.',
        },
        {
          method: 'PUT', path: '/api/glossary/:id', auth: true,
          summary: '용어 수정 (관리자 전용)',
          request: '{ "ko": "스카우트", "en": "Scout", "fr": "Scout", "description": "…" }',
          response: '수정된 GlossaryTerm 객체',
          notes: '한국어 없이 영어/프랑스어만 있는 용어도 저장 허용 (국문 미확정 버킷으로 분류됨).',
        },
        {
          method: 'GET', path: '/api/glossary/bot', auth: false,
          summary: 'AI · 봇용 용어 전체 Export',
          params: [{ name: 'format', desc: 'json | plaintext (기본 json)' }],
          response: '용어 전체 목록 (JSON 또는 plaintext)',
        },
      ],
    },
    {
      id: 'analytics',
      label: '분석 (Analytics)',
      desc: '방문 기록, 조회·공감 트래킹, 관리자 대시보드 데이터.',
      endpoints: [
        {
          method: 'POST', path: '/api/analytics/visit', auth: false,
          summary: '사이트 방문 기록 (페이지 로드 시 자동 호출)',
          request: '{ "path": "/korea", "referrer": "https://…",\n  "utm_source": "…", "utm_medium": "…", "utm_campaign": "…" }',
          response: '{ "ok": true }',
          notes: '운영 분석 기준은 site_visits 테이블입니다. UTM 파라미터는 마케팅 채널 분석에 사용됩니다.',
        },
        {
          method: 'POST', path: '/api/analytics/post-engagement', auth: false,
          summary: '게시글 조회·공감 이벤트 기록',
          request: '{ "post_id": 123, "event": "view", "duration_ms": 4500 }',
          response: '{ "ok": true }',
          notes: 'event: view | like | unlike. 관리자 세션은 체류시간 집계에서 제외됩니다.',
        },
        {
          method: 'GET', path: '/api/analytics/today', auth: false,
          summary: '오늘 방문자 수 / 조회수',
          response: '{ "visitors": 42, "views": 158 }',
        },
        {
          method: 'GET', path: '/api/admin/analytics', auth: true,
          summary: '관리자 방문 분석 (panel-analytics-visits 전용)',
          params: [
            { name: 'days', desc: '최근 N일 (1~90, 기본 30)' },
            { name: 'start / end', desc: 'YYYY-MM-DD 커스텀 범위 (days 대체)' },
            { name: 'tag_days / tag_start / tag_end', desc: '(deprecated, tag-insights API 권장)' },
            { name: 'heatmap_days / heatmap_start / heatmap_end / heatmap_all', desc: '히트맵 기간 독립 조절 (1주·1개월·직접 지정·전체)' },
          ],
          response: '{ today, summary, visitors, views, article_top_posts, sources, heatmap, tags, tracking_note }',
          notes: '2026-04-19 사이드바 2메뉴 분리 이후 방문 분석 전용 엔드포인트. 오늘 방문·조회, 기간 합계, 인기 기사, 유입 경로, 평균 체류, 요일×시간 방문 히트맵(셀 우상단에 같은 시간대의 공개 게시글 발행 수), 유입 해석 노트(UTM+리퍼러 기반 카카오톡/페이스북/검색/직접 세분화)를 반환합니다. 태그 인사이트는 전용 /api/admin/tag-insights를 사용합니다.',
        },
        {
          method: 'GET', path: '/api/admin/tag-insights', auth: true,
          summary: '태그 인사이트 종합 분석 (panel-analytics-tags, 2026-04-19 신설)',
          params: [
            { name: 'days', desc: '최근 N일 (1~365)' },
            { name: 'start / end', desc: 'YYYY-MM-DD 커스텀 범위' },
            { name: 'all', desc: '1이면 전체 기간' },
          ],
          response: '{\n  statistics: { total_posts, tag_missing, meta_missing, unique_header_tags, unique_meta_tags, avg_meta_per_post, category_avg[], missing_posts[] },\n  header_ranking: [{ tag, count, pct }],\n  meta_ranking: [{ tag, count, top_category, top_header }],\n  graph: { nodes: [{ id, label, count, top_header, top_category }], links: [{ source, target, count }] },\n  health: { isolated_tags[], isolated_tags_count, overly_common_threshold, overly_common[], duplicate_suspects[], isolated_clusters[], total_components },\n  coverage: { by_header[], monthly[], gaps[], empty_or_thin_header_count },\n  suggestions: { hub_clusters[], thin_headers[], suggestions[], human_review_required: true }\n}',
          notes: 'functions/_shared/tag-insights.js buildTagInsights() 공용 모듈이 published=1 posts에서 tag/meta_tags 쉼표 토큰화 후 계산. 태그 원문 보존, 자동 통합/삭제 금지(모든 health/suggestions 항목 human_review_required). 같은 모듈이 scripts/tag-analysis/*.mjs에서 오프라인 .md 산출물(01_statistics/02_graph.html D3.js/03_health_check/04_coverage_map/05_next_actions)을 생성합니다. 관계도 노드는 KMS 브랜드 10색, 링크는 count 기반 흑백 그라데이션, 약한 연결(하위 15%)은 점선.',
        },
        {
          method: 'GET', path: '/api/admin/geo-audience', auth: true,
          summary: '관리자 접속 국가/도시 지도 및 테이블 집계',
          params: [
            { name: 'days', desc: '최근 N일 (1~180, 기본 30)' },
            { name: 'start / end', desc: 'YYYY-MM-DD 커스텀 범위 (2026-04-19 추가 — v3-period-bar 규약)' },
          ],
          response: '{ summary: { countries, cities, visits, pageviews }, countries: [], cities: [], warmup_note }',
          notes: 'Cloudflare 요청 메타의 국가/도시/좌표를 기반으로 집계합니다. IP 원문은 저장하지 않으며, 초기 데이터는 기능 배포 이후 새 방문부터 누적됩니다.',
        },
        {
          method: 'GET', path: '/api/admin/marketing', auth: true,
          summary: '마케팅 · 유입 채널 분석',
          response: '{ "funnel": [], "utm_campaigns": [], "referrers": [] }',
        },
        {
          method: 'GET', path: '/api/admin/homepage-issues', auth: true,
          summary: '사이트 오류/이슈 기록 조회',
          response: '{ "items": HomepageIssue[] }',
          notes: 'HomepageIssue: { id, title, issue_type, status, severity, area, summary, impact, cause, action_items, source_path, reporter, occurred_at, last_seen_at, occurrence_count } · 공개 홈 자동 오류 보고와 사이트/관리자 전역 API 오류 로그를 함께 읽기 전용으로 확인합니다.',
        },
        {
          method: 'POST', path: '/api/homepage-issues/report', auth: false,
          summary: '홈 공개 화면 자동 오류 보고',
          response: '{ "ok": true, "item": HomepageIssue }',
          notes: '홈 초기 로드 실패, 백그라운드 최신 소식 새로고침 실패, 런타임 오류와 관리자 클라이언트 API 실패를 같은 이슈 기준으로 자동 누적하며, 관리자 패널에서는 전역 API 오류 로그와 함께 봅니다.',
        },
      ],
    },
    {
      id: 'admin',
      label: '관리자 전용 (Admin)',
      desc: '버전기록, 운영 대시보드, 사이트 히스토리, 이슈 기록 관리.',
      endpoints: [
        {
          method: 'GET', path: '/api/admin/changelog', auth: true,
          summary: '버전기록 조회',
          response: '{ "items": ChangelogItem[] }',
          notes: 'ChangelogItem: { version, date, summary, type, scope, items[] }. scope: site | admin | both',
        },
        {
          method: 'GET', path: '/api/admin/operations', auth: true,
          summary: '운영 대시보드 및 릴리스 이력 조회',
          response: '{ "scheduled_posts": [], "draft_posts": [], "recent_errors": [], "recent_logins": [], "recent_settings": [], "deployments": [] }',
        },
        {
          method: 'GET', path: '/api/admin/site-history', auth: true,
          summary: '사이트 히스토리 — 설정 변경·게시글 이력·배포 로그를 통합 집계',
          params: [
            { name: 'days / start / end', desc: '기간 범위 (v3-period-bar 규약)' },
            { name: 'group_by', desc: 'day | week | month' },
          ],
          response: '{ "items": HistoryEntry[], "groups": [{ label, count }] }',
          notes: '관리자 site-history 패널이 단일 소스로 사용. 설정 스냅샷(settings_history), 게시글 변경, 배포 이력을 시간 순으로 합칩니다.',
        },
        {
          method: 'PATCH', path: '/api/admin/homepage-issues/:id', auth: true,
          summary: '사이트 오류/이슈 기록 상태 변경',
          request: '{ status?: "open"|"monitoring"|"resolved", severity?: "low"|"medium"|"high"|"critical", action_items?: string }',
          response: '수정된 HomepageIssue 객체',
          notes: 'KMS 0.2.2 P0 규칙에 따라 open + high/critical 이슈는 신규 작업보다 우선 해결. 해결 시 action_items에 근인/해결 경로 기록 권장.',
        },
      ],
    },
    {
      id: 'util',
      label: '유틸리티 (Utilities)',
      desc: '홈 메타, 이미지 서빙, 공개 통계.',
      endpoints: [
        {
          method: 'GET', path: '/api/home', auth: false,
          summary: '홈 페이지 메타 및 주요 콘텐츠',
          response: '{ "hero": HeroItem[], "ticker": string[], "main_story": Post }',
        },
        {
          method: 'GET', path: '/api/images/:key', auth: false,
          summary: 'R2 또는 DB 저장 이미지 서빙',
          params: [{ name: 'key', desc: '이미지 키 (URL 인코딩됨)' }],
          response: '이미지 바이너리 (Content-Type: image/*)',
        },
        {
          method: 'GET', path: '/api/stats', auth: false,
          summary: '공개 게시글 수 통계',
          response: '{ "total": 120, "by_category": { "korea": 60, "apr": 30, "wosm": 20, "people": 10 } }',
        },
      ],
    },
  ];

  // ── DOMContentLoaded ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    bindLoginEvents();
    bindUiEvents();
    bootAccess();
  });

  // ── 인증 ──────────────────────────────────────────────────────
  function bootAccess() {
    if (!GW.getToken()) { showLogin(''); return; }
    GW.apiFetch('/api/admin/session')
      .then(function (data) {
        if (!data || data.authenticated !== true) { showLogin('관리자 로그인이 필요합니다.'); return; }
        showKms();
      })
      .catch(function () { showLogin('관리자 세션을 다시 확인해주세요.'); });
  }

  function doLogin() {
    var userEl = document.getElementById('kms-username-input');
    var username = userEl ? String(userEl.value || '').trim().toLowerCase() : '';
    
    var pw = String((document.getElementById('kms-pw-input') || {}).value || '').trim();
    var errEl = document.getElementById('kms-login-error');
    var btn = document.getElementById('kms-login-btn');
    if (!pw) { showLoginError('비밀번호를 입력해주세요.'); return; }
    btn.disabled = true;
    btn.textContent = '확인 중…';
    hideLoginError();
    GW.apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: username, password: pw }) })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
        if (data && data.user && data.user.must_change_password && GW.showToast) {
          GW.showToast('임시 비밀번호입니다. 관리자 페이지에서 변경해주세요.', 'warn', 8000);
        }
        showKms();
      })
      .catch(function (err) {
        showLoginError(err.message || '비밀번호가 올바르지 않습니다.');
        var pwEl = document.getElementById('kms-pw-input');
        if (pwEl) pwEl.value = '';
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'KMS 열기';
      });
  }

  function showKms() {
    var loginEl = document.getElementById('kms-login-screen');
    var screenEl = document.getElementById('kms-screen');
    if (loginEl) loginEl.style.display = 'none';
    if (screenEl) { screenEl.hidden = false; screenEl.setAttribute('aria-hidden', 'false'); }
    if (!_state.loaded) {
      _state.loaded = true;
      loadDefinition();
      renderApiGuide();
      loadChangelog();
    }
    updateVersionDisplay();
    setMode('read');
    var pathTab = _tabFromPath(window.location.pathname);
    // 초기 URL을 표준화 — /kms 접근 시 /kms/function 으로 교체
    var canonPath = TAB_PATHS[pathTab] || '/kms/function';
    if (window.location.pathname !== canonPath) {
      history.replaceState({ tab: pathTab }, '', canonPath);
    } else {
      history.replaceState({ tab: pathTab }, '', window.location.href);
    }
    setTab(pathTab, true);
  }

  function showLogin(message) {
    GW.clearToken();
    var loginEl = document.getElementById('kms-login-screen');
    var screenEl = document.getElementById('kms-screen');
    if (loginEl) loginEl.style.display = 'flex';
    if (screenEl) { screenEl.hidden = true; screenEl.setAttribute('aria-hidden', 'true'); }
    if (message) showLoginError(message); else hideLoginError();
  }

  function showLoginError(msg) {
    var el = document.getElementById('kms-login-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function hideLoginError() {
    var el = document.getElementById('kms-login-error');
    if (el) el.hidden = true;
  }

  // ── 이벤트 바인딩 ─────────────────────────────────────────────
  function bindLoginEvents() {
    var loginBtn = document.getElementById('kms-login-btn');
    var pwInput = document.getElementById('kms-pw-input');
    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    if (pwInput) pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  }

  function bindUiEvents() {
    // 탭 전환
    document.querySelectorAll('[data-kms-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTab(btn.getAttribute('data-kms-tab')); });
    });

    // 모드 전환 (보기/편집)
    document.querySelectorAll('[data-kms-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-kms-mode')); });
    });

    // 저장
    var saveBtn = document.getElementById('kms-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveDefinition);

    // 사이드바 토글
    var sidebarToggle = document.getElementById('kms-sidebar-toggle');
    var overlay = document.getElementById('kms-overlay');
    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // 맨 위로 버튼 — 스크롤 300px 이상 내려가면 노출, 클릭 시 최상단으로.
    var backToTop = document.getElementById('kms-back-to-top');
    if (backToTop) {
      backToTop.addEventListener('click', function () {
        var main = document.getElementById('kms-main');
        (main || window).scrollTo({ top: 0, behavior: 'smooth' });
      });
      var toggleBackToTop = function () {
        var main = document.getElementById('kms-main');
        var y = main ? main.scrollTop : (window.scrollY || window.pageYOffset || 0);
        backToTop.hidden = y < 300;
      };
      (document.getElementById('kms-main') || window).addEventListener('scroll', toggleBackToTop, { passive: true });
      window.addEventListener('resize', toggleBackToTop, { passive: true });
    }

    // 검색
    var searchInput = document.getElementById('kms-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        _state.searchQuery = searchInput.value.trim();
        handleSearch(_state.searchQuery);
      });
    }

    // 검색 초기화
    var clearBtn = document.getElementById('kms-search-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var si = document.getElementById('kms-search-input');
        if (si) si.value = '';
        _state.searchQuery = '';
        handleSearch('');
      });
    }

    // 편집기 실시간 미리보기
    var editorInput = document.getElementById('kms-editor-input');
    if (editorInput) {
      editorInput.addEventListener('input', function () {
        renderDocument(editorInput.value || '');
        renderSectionList(editorInput.value || '');
        updateDocMeta(editorInput.value || '');
      });
    }

    // 브라우저 뒤로/앞으로 버튼
    window.addEventListener('popstate', function (e) {
      var tab = (e.state && e.state.tab) ? e.state.tab : _tabFromPath(window.location.pathname);
      setTab(tab, true);
    });

    // Changelog 범위 필터
    // 페이지네이션 버튼 (delegation — 페이지 변경 시 동적 렌더되는 버튼들).
    document.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-kms-cl-page]') : null;
      if (!btn) return;
      event.preventDefault();
      var raw = btn.getAttribute('data-kms-cl-page');
      var next = parseInt(raw, 10);
      if (!Number.isFinite(next) || next < 1) return;
      _state.changelogPage = next;
      renderChangelog(_state.changelogItems, _state.changelogScope);
      var container = document.getElementById('kms-changelog');
      if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.querySelectorAll('[data-cl-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _state.changelogScope = btn.getAttribute('data-cl-scope') || 'all';
        _state.changelogPage = 1; // 범위 바꾸면 1페이지부터 다시.
        document.querySelectorAll('[data-cl-scope]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderChangelog(_state.changelogItems, _state.changelogScope);
      });
    });
  }

  // ── 탭 ↔ URL 매핑 ─────────────────────────────────────────────
  var TAB_PATHS = { docs: '/kms/function', api: '/kms/api', changelog: '/kms/version', design: '/kms/design', editorial: '/kms/editorial' };

  function _tabFromPath(pathname) {
    var map = { '/kms/function': 'docs', '/kms/api': 'api', '/kms/version': 'changelog', '/kms/design': 'design', '/kms/editorial': 'editorial' };
    return map[pathname] || 'docs';
  }

  // ── 탭 시스템 ─────────────────────────────────────────────────
  function setTab(tab, skipPush) {
    _state.tab = tab;
    var panels = ['docs', 'api', 'changelog', 'design', 'editorial'];
    panels.forEach(function (id) {
      var panel = document.getElementById('kms-tab-' + id);
      if (panel) panel.hidden = id !== tab;
    });
    document.querySelectorAll('[data-kms-tab]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-kms-tab') === tab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    // URL 동기화
    if (!skipPush) {
      var newPath = TAB_PATHS[tab] || '/kms/function';
      if (window.location.pathname !== newPath) {
        history.pushState({ tab: tab }, '', newPath);
      }
    }
    // 모드 스위치 / 저장 버튼: 기능정의서 탭에서만 표시
    var modeSwitchEl = document.getElementById('kms-mode-switch');
    var saveBtn = document.getElementById('kms-save-btn');
    var showEdit = tab === 'docs';
    if (modeSwitchEl) modeSwitchEl.style.display = showEdit ? '' : 'none';
    if (saveBtn) saveBtn.style.display = showEdit ? '' : 'none';
    // 탭 전환 시 사이드바 섹션 목록을 해당 탭에 맞게 업데이트
    if (tab === 'api') renderApiSectionList();
    else if (tab === 'changelog') clearSectionList();
    else if (tab === 'design') { renderDesignSystem(); renderDesignSectionList(); }
    else if (tab === 'editorial') renderEditorialSectionList();
    else renderSectionList(_state.docContent);
  }

  // ── 사이드바 ──────────────────────────────────────────────────
  function toggleSidebar() {
    _state.sidebarOpen = !_state.sidebarOpen;
    var sidebar = document.getElementById('kms-sidebar');
    var overlay = document.getElementById('kms-overlay');
    if (sidebar) sidebar.classList.toggle('is-open', _state.sidebarOpen);
    if (overlay) overlay.classList.toggle('is-visible', _state.sidebarOpen);
  }

  function closeSidebar() {
    _state.sidebarOpen = false;
    var sidebar = document.getElementById('kms-sidebar');
    var overlay = document.getElementById('kms-overlay');
    if (sidebar) sidebar.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-visible');
  }

  // ── 검색 ──────────────────────────────────────────────────────
  function handleSearch(query) {
    var banner = document.getElementById('kms-search-result-banner');
    var countEl = document.getElementById('kms-search-result-count');
    if (!query) {
      if (banner) banner.hidden = true;
      renderDocument(_state.docContent);
      renderSectionList(_state.docContent);
      return;
    }
    var q = query.toLowerCase();
    var sections = extractSections(_state.docContent);
    var matched = sections.filter(function (s) {
      return s.title.toLowerCase().indexOf(q) >= 0 || (s.body || '').toLowerCase().indexOf(q) >= 0;
    });
    if (banner) banner.hidden = false;
    if (countEl) countEl.textContent = '"' + query + '" 검색 결과: ' + matched.length + '개 섹션';
    renderFilteredSections(matched, q);
    renderSectionList(_state.docContent, q);
  }

  function renderFilteredSections(sections, q) {
    var body = document.getElementById('kms-document-body');
    if (!body) return;
    if (!sections.length) {
      body.innerHTML = '<div class="kms-list-empty">일치하는 섹션이 없습니다.</div>';
      return;
    }
    body.innerHTML = sections.map(function (s) {
      var levelClass = 'kms-search-section kms-search-section-l' + s.level;
      var titleHighlighted = highlightText(GW.escapeHtml(s.title), q);
      var bodyRendered = s.body ? '<div class="kms-search-section-body">' + renderKmsText(s.body, function () { return ''; }) + '</div>' : '';
      return '<div class="' + levelClass + '"><h3 class="kms-search-section-title">' + titleHighlighted + '</h3>' + bodyRendered + '</div>';
    }).join('');
  }

  function highlightText(html, q) {
    if (!q) return html;
    var escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark class="kms-highlight">$1</mark>');
  }

  // ── 기능정의서 ────────────────────────────────────────────────
  function loadDefinition() {
    var body = document.getElementById('kms-document-body');
    var list = document.getElementById('kms-section-list');
    if (body) body.innerHTML = '<div class="kms-list-empty">불러오는 중…</div>';
    GW.apiFetch('/api/settings/feature-definition')
      .then(function (data) {
        var content = normalizeFeatureDefinitionContent(data && typeof data.content === 'string' ? data.content : '');
        _state.docContent = content;
        _state.docUpdatedAt = data && data.updated_at ? String(data.updated_at) : '';
        var editorInput = document.getElementById('kms-editor-input');
        if (editorInput) editorInput.value = content;
        renderDocument(content);
        renderSectionList(content);
        updateDocMeta(content);
        _bindScrollSpy();
      })
      .catch(function (err) {
        if (body) body.innerHTML = '<div class="kms-list-empty">' + GW.escapeHtml(err.message || '기능 정의서를 불러오지 못했습니다.') + '</div>';
        if (list) list.innerHTML = '<div class="kms-list-empty">목차를 불러오지 못했습니다.</div>';
      });
  }

  function saveDefinition() {
    if (_state.saveBusy) return;
    var editorInput = document.getElementById('kms-editor-input');
    var content = normalizeFeatureDefinitionContent(editorInput && editorInput.value || '').trim();
    if (!content) { GW.showToast('기능 정의서 내용이 비어 있습니다.', 'error'); return; }
    var btn = document.getElementById('kms-save-btn');
    _state.saveBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    GW.apiFetch('/api/settings/feature-definition', {
      method: 'PUT',
      body: JSON.stringify({ content: content }),
    })
      .then(function () {
        _state.docContent = content;
        GW.showToast('기능 정의서가 저장됐습니다.', 'success');
        renderDocument(content);
        renderSectionList(content);
        updateDocMeta(content);
        setMode('read');
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      })
      .finally(function () {
        _state.saveBusy = false;
        if (btn) { btn.disabled = false; btn.textContent = '저장'; }
      });
  }

  function setMode(mode) {
    _state.mode = mode === 'edit' ? 'edit' : 'read';
    var editorPanel = document.getElementById('kms-editor-panel');
    if (editorPanel) editorPanel.hidden = _state.mode !== 'edit';
    document.querySelectorAll('[data-kms-mode]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-kms-mode') === _state.mode);
    });
  }

  function normalizeFeatureDefinitionContent(value) {
    var text = String(value || '').replace(/\r\n/g, '\n');
    if (!text) return '';
    if (text.indexOf('\n') === -1 && /\\n/.test(text)) {
      text = text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    }
    return text;
  }

  // ── 문서 렌더링 ───────────────────────────────────────────────
  function renderDocument(content) {
    var preview = document.getElementById('kms-document-body');
    if (!preview) return;
    var text = String(content || '').replace(/\r\n/g, '\n');
    if (!text.trim()) {
      preview.innerHTML = '<div class="kms-list-empty">정의서를 입력하면 여기에 미리보기가 표시됩니다.</div>';
      return;
    }
    var sectionIndex = 0;
    var parts = text.split(/```/);
    var rawHtml = parts.map(function (part, index) {
      if (index % 2 === 1) {
        var lines = part.replace(/^\n+|\n+$/g, '').split('\n');
        var language = '';
        if (lines.length && /^[A-Za-z0-9_-]+$/.test((lines[0] || '').trim())) {
          language = lines.shift().trim();
        }
        return '<div class="kms-code-wrap">' +
          (language ? '<div class="kms-code-label">' + GW.escapeHtml(language) + '</div>' : '') +
          '<pre class="kms-code"><code>' + GW.escapeHtml(lines.join('\n')) + '</code></pre>' +
          '</div>';
      }
      return renderKmsText(part, function (title) {
        sectionIndex += 1;
        return 'kms-s-' + sectionIndex + '-' + slugify(title);
      });
    }).join('');
    preview.innerHTML = wrapDocSectionsIntoCards(rawHtml);
  }

  // 대목차(##=kms-h3) 단위로 HTML을 카드(.kms-doc-card)로 래핑한다.
  // Why: 다른 탭(API/버전기록/디자인)처럼 목차 단위로 가시적 경계를 주기 위함.
  function wrapDocSectionsIntoCards(html) {
    if (!html) return html;
    var pattern = /<h3\b[^>]*class="kms-h3"[^>]*>[\s\S]*?<\/h3>/g;
    var marks = [];
    var m;
    while ((m = pattern.exec(html)) !== null) {
      marks.push({ start: m.index, end: pattern.lastIndex });
    }
    if (!marks.length) {
      return html.replace(/^\s+|\s+$/g, '')
        ? '<section class="kms-doc-card kms-doc-card--intro">' + html + '</section>'
        : html;
    }
    var out = [];
    var intro = html.slice(0, marks[0].start);
    if (intro.replace(/^\s+|\s+$/g, '')) {
      out.push('<section class="kms-doc-card kms-doc-card--intro">' + intro + '</section>');
    }
    for (var i = 0; i < marks.length; i++) {
      var endOfSection = i + 1 < marks.length ? marks[i + 1].start : html.length;
      var section = html.slice(marks[i].start, endOfSection);
      var idMatch = section.match(/<h3\b[^>]*\bid="([^"]+)"/);
      var aria = idMatch ? ' aria-labelledby="' + idMatch[1] + '"' : '';
      out.push('<section class="kms-doc-card"' + aria + '>' + section + '</section>');
    }
    return out.join('');
  }

  function renderKmsText(text, idBuilder) {
    var lines = String(text || '').split('\n');
    var html = [];
    var listMode = '';
    function closeList() {
      if (!listMode) return;
      html.push(listMode === 'ol' ? '</ol>' : '</ul>');
      listMode = '';
    }
    function isTableSeparator(s) {
      // | --- | :---: | ---: | 형식
      return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
    }
    function parseTableRow(s) {
      var trimmed = s.replace(/^\|/, '').replace(/\|$/, '');
      // GFM: `\|` 는 리터럴 파이프이므로 분할 대상에서 제외
      var PH = '\u0001'; // 임시 placeholder (본문에 등장하지 않는 제어문자)
      var withPh = trimmed.replace(/\\\|/g, PH);
      return withPh.split('|').map(function (cell) {
        return cell.replace(new RegExp(PH, 'g'), '|').trim();
      });
    }
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].trim();
      if (!raw) {
        closeList();
        continue;
      }
      // Frontmatter skip (Obsidian 호환)
      if (raw === '---') continue;
      // 테이블: 헤더 줄 + 구분선 줄 패턴
      if (/^\|.*\|$/.test(raw) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
        closeList();
        var headerCells = parseTableRow(raw);
        var headerCount = headerCells.length;
        i += 2; // skip header + separator
        var rows = [];
        while (i < lines.length) {
          var rowLine = lines[i].trim();
          if (!/^\|.*\|$/.test(rowLine)) break;
          var rowCells = parseTableRow(rowLine);
          // Robustness: 셀 내부 미이스케이프 `|` (예: |Lc| 절대값 표기)로 인해 과분할된 경우,
          // 초과 셀은 원래 `|` 구분자를 보존해 마지막 컬럼으로 병합한다.
          if (headerCount > 0 && rowCells.length > headerCount) {
            var head = rowCells.slice(0, headerCount - 1);
            var tail = rowCells.slice(headerCount - 1).join(' | ');
            rowCells = head.concat([tail]);
          }
          // 부족하면 빈 셀로 패딩
          while (headerCount > 0 && rowCells.length < headerCount) rowCells.push('');
          rows.push(rowCells);
          i++;
        }
        i--; // step back so outer loop re-evaluates the non-table line
        var tableHtml = '<div class="kms-table-wrap"><table class="kms-table"><thead><tr>';
        headerCells.forEach(function (h) {
          tableHtml += '<th>' + formatInline(h) + '</th>';
        });
        tableHtml += '</tr></thead><tbody>';
        rows.forEach(function (row) {
          tableHtml += '<tr>';
          row.forEach(function (cell) {
            tableHtml += '<td>' + formatInline(cell) + '</td>';
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        html.push(tableHtml);
        continue;
      }
      if (/^>\s+/.test(raw)) {
        closeList();
        html.push('<blockquote class="kms-quote">' + formatInline(raw.replace(/^>\s+/, '')) + '</blockquote>');
        continue;
      }
      if (/^(-{3,}|\*{3,})$/.test(raw)) {
        closeList();
        html.push('<hr class="kms-divider">');
        continue;
      }
      if (/^####\s+/.test(raw)) {
        closeList();
        var t4 = raw.replace(/^####\s+/, '');
        var h5cls = 'kms-h5';
        if (/^\s*각주\s*$/.test(t4)) h5cls += ' kms-h5-footnote';
        else if (/^\s*(코드\s*예시|Code\s*Example)\s*$/.test(t4)) h5cls += ' kms-h5-code';
        html.push('<h5 id="' + GW.escapeHtml(idBuilder(t4)) + '" class="' + h5cls + '">' + formatInline(t4) + '</h5>');
        continue;
      }
      if (/^###\s+/.test(raw)) {
        closeList();
        var t3 = raw.replace(/^###\s+/, '');
        html.push('<h4 id="' + GW.escapeHtml(idBuilder(t3)) + '" class="kms-h4">' + formatInline(t3) + '</h4>');
        continue;
      }
      if (/^##\s+/.test(raw)) {
        closeList();
        var t2 = raw.replace(/^##\s+/, '');
        html.push('<h3 id="' + GW.escapeHtml(idBuilder(t2)) + '" class="kms-h3">' + formatInline(t2) + '</h3>');
        continue;
      }
      if (/^#\s+/.test(raw)) {
        closeList();
        html.push('<h2 class="kms-h2">' + formatInline(raw.replace(/^#\s+/, '')) + '</h2>');
        continue;
      }
      if (/^-\s+/.test(raw)) {
        if (listMode !== 'ul') {
          closeList();
          html.push('<ul class="kms-list">');
          listMode = 'ul';
        }
        html.push('<li>' + formatInline(raw.replace(/^-\s+/, '')) + '</li>');
        continue;
      }
      if (/^\d+\.\s+/.test(raw)) {
        if (listMode !== 'ol') {
          closeList();
          html.push('<ol class="kms-list kms-list-ordered">');
          listMode = 'ol';
        }
        html.push('<li>' + formatInline(raw.replace(/^\d+\.\s+/, '')) + '</li>');
        continue;
      }
      closeList();
      html.push('<p class="kms-p">' + formatInline(raw) + '</p>');
    }
    closeList();
    return html.join('');
  }

  function formatInline(text) {
    var escaped = GW.escapeHtml(String(text || ''));
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="kms-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // 위키링크 [[항목명]] → 볼드 처리 (Obsidian 호환)
    escaped = escaped.replace(/\[\[([^\]]+)\]\]/g, '<span class="kms-wikilink">$1</span>');
    // 인라인 코드 `…`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="kms-inline-code">$1</code>');
    // 볼드 **…**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return escaped;
  }

  // ── 목차 트리 ─────────────────────────────────────────────────
  function renderSectionList(content, highlightQ) {
    var list = document.getElementById('kms-section-list');
    if (!list) return;
    var sections = extractSections(content).filter(function (s) { return s.level <= 3; });
    if (!sections.length) {
      list.innerHTML = '<div class="kms-list-empty">목차를 만들 수 있는 제목이 없습니다.</div>';
      return;
    }
    var filtered = highlightQ
      ? sections.filter(function (s) { return s.title.toLowerCase().indexOf(highlightQ.toLowerCase()) >= 0; })
      : sections;
    if (!filtered.length) {
      list.innerHTML = '<div class="kms-list-empty">일치하는 목차가 없습니다.</div>';
      return;
    }
    // 디자인 탭과 동일한 스타일: 대목차(h2)는 group label, 소목차(h3)는 section link
    var html = [];
    filtered.forEach(function (s) {
      var titleHtml = highlightQ ? highlightText(GW.escapeHtml(s.title), highlightQ) : GW.escapeHtml(s.title);
      if (s.level === 2) {
        html.push('<div class="kms-section-group-label">' + titleHtml + '</div>');
      } else {
        html.push(
          '<button type="button" class="kms-section-link" data-kms-target="' + GW.escapeHtml(s.id) + '">' +
            '<span class="kms-section-title">' + titleHtml + '</span>' +
          '</button>'
        );
      }
    });
    list.innerHTML = html.join('');
    list.querySelectorAll('[data-kms-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-kms-target');
        var target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          closeSidebar();
        }
      });
    });
  }

  // 스크롤 스파이 — 뷰포트에 보이는 섹션을 사이드바 링크에 is-current로 표시.
  var _scrollSpyObserver = null;
  var _scrollSpyActiveId = '';
  function _bindScrollSpy() {
    if (_scrollSpyObserver) { _scrollSpyObserver.disconnect(); _scrollSpyObserver = null; }
    var main = document.getElementById('kms-main');
    var targets = document.querySelectorAll('#kms-document-body [id^="kms-s-"]');
    if (!main || !targets.length || typeof IntersectionObserver === 'undefined') return;
    // 문서 상단이 뷰포트 상단에서 약간 아래(헤더 높이 고려)에 들어올 때를 '현재 섹션'으로 본다.
    var visible = new Set();
    _scrollSpyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });
      // 뷰포트에 여러 섹션이 동시에 보일 때는 가장 먼저(위쪽) 것을 현재로 취급.
      var list = Array.prototype.slice.call(targets).map(function (n) { return n.id; });
      var firstVisible = list.find(function (id) { return visible.has(id); });
      var currentId = firstVisible || _scrollSpyActiveId;
      if (currentId && currentId !== _scrollSpyActiveId) {
        _scrollSpyActiveId = currentId;
        document.querySelectorAll('#kms-section-list [data-kms-target]').forEach(function (btn) {
          btn.classList.toggle('is-current', btn.getAttribute('data-kms-target') === currentId);
        });
      }
    }, { root: main, rootMargin: '-80px 0px -60% 0px', threshold: 0 });
    targets.forEach(function (t) { _scrollSpyObserver.observe(t); });
  }

  function renderApiSectionList() {
    var list = document.getElementById('kms-section-list');
    if (!list) return;
    list.innerHTML = '<div class="kms-section-group-label">API 그룹</div>' + API_GROUPS.map(function (group) {
      return '<button type="button" class="kms-section-link" data-kms-target="kms-api-' + group.id + '">' +
        '<span class="kms-section-title">' + GW.escapeHtml(group.label) + '</span>' +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-kms-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-kms-target');
        var target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeSidebar();
      });
    });
  }

  function renderEditorialSectionList() {
    var list = document.getElementById('kms-section-list');
    if (!list) return;
    var container = document.getElementById('kms-tab-editorial');
    if (!container) return;
    var html = ['<div class="kms-section-group-label">BP미디어 v2.1</div>'];
    container.querySelectorAll('.kms-ed-section[id]').forEach(function (section) {
      var heading = section.querySelector('.kms-ed-heading');
      if (!heading) return;
      var text = heading.textContent.replace(/\s+/g, ' ').trim();
      html.push(
        '<button type="button" class="kms-section-link" data-kms-target="' + GW.escapeHtml(section.id) + '">' +
          '<span class="kms-section-title">' + GW.escapeHtml(text) + '</span>' +
        '</button>'
      );
    });
    list.innerHTML = html.join('');
    list.querySelectorAll('[data-kms-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.getAttribute('data-kms-target'));
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); closeSidebar(); }
      });
    });
  }

  function clearSectionList() {
    var list = document.getElementById('kms-section-list');
    if (list) list.innerHTML = '<div class="kms-list-empty">버전기록 탭에서는 목차가 제공되지 않습니다.</div>';
  }

  function renderDesignSectionList() {
    var list = document.getElementById('kms-section-list');
    if (!list) return;
    // sections 배열은 renderDesignSystem() 내부에 정의되어 있으므로
    // DOM에 렌더된 요소의 id를 직접 수집한다
    var container = document.getElementById('kms-tab-design');
    if (!container) return;
    var html = [];
    container.querySelectorAll('.kms-ds-layer-header, .kms-ds-section').forEach(function (el) {
      if (el.classList.contains('kms-ds-layer-header')) {
        var strong = el.querySelector('strong');
        html.push('<div class="kms-section-group-label">' + GW.escapeHtml(strong ? strong.textContent : '') + '</div>');
      } else {
        var titleEl = el.querySelector('.kms-ds-section-title');
        if (!titleEl || !el.id) return;
        html.push(
          '<button type="button" class="kms-section-link" data-kms-target="' + GW.escapeHtml(el.id) + '">' +
            '<span class="kms-section-title">' + GW.escapeHtml(titleEl.textContent) + '</span>' +
          '</button>'
        );
        // 섹션 내부 모듈을 들여쓰기된 하위 항목으로 추가
        el.querySelectorAll('.kms-ds-module').forEach(function (mod) {
          if (!mod.id) return;
          var modTitle = mod.querySelector('.kms-ds-module-title');
          if (!modTitle) return;
          html.push(
            '<button type="button" class="kms-section-link kms-tree-sub" data-kms-target="' + GW.escapeHtml(mod.id) + '">' +
              '<span class="kms-section-title">· ' + GW.escapeHtml(modTitle.textContent) + '</span>' +
            '</button>'
          );
        });
      }
    });
    list.innerHTML = html.join('');
    list.querySelectorAll('[data-kms-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.getAttribute('data-kms-target'));
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); closeSidebar(); }
      });
    });
  }

  function extractSections(content) {
    var lines = String(content || '').split('\n');
    var sections = [];
    var count = 0;
    var currentSection = null;
    lines.forEach(function (line) {
      var raw = String(line || '').trim();
      if (/^#{2,4}\s+/.test(raw)) {
        if (currentSection) sections.push(currentSection);
        count += 1;
        var level = raw.match(/^#+/)[0].length;
        var title = raw.replace(/^##+\s+/, '').trim();
        currentSection = { id: 'kms-s-' + count + '-' + slugify(title), title: title, level: level, body: '' };
      } else if (currentSection) {
        currentSection.body += line + '\n';
      }
    });
    if (currentSection) sections.push(currentSection);
    return sections;
  }

  function updateDocMeta(content) {
    var text = String(content || '');
    var lines = text.split('\n');
    var titleLine = lines.find(function (l) { return /^#\s+/.test(String(l || '').trim()); }) || '';
    var title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '기능 정의서 / 운영 기준 문서';
    var sections = extractSections(text);
    var h2Count = sections.filter(function (s) { return s.level === 2; }).length;
    var h4Count = sections.filter(function (s) { return s.level === 4; }).length;
    var ver = 'V' + (GW.APP_VERSION || '—');
    setText('kms-document-title', title);
    setText('kms-build-version', ver);
    setText('kms-ver-site', ver);
    setText('kms-section-count', String(h2Count));
    setText('kms-section-count-doc', String(h2Count));
    setText('kms-detail-count', String(h4Count));
    setText('kms-doc-updated', formatDocUpdatedAt(_state.docUpdatedAt));
  }

  // D1 `settings_history.saved_at`은 UTC(`datetime('now')`)로 저장되는데
  // 운영자는 KST 기준을 본다. "YYYY. M. D. 오전/오후 H시 M분 S초" 로 표기.
  function formatDocUpdatedAt(raw) {
    if (!raw) return '—';
    var s = String(raw).trim();
    if (!s) return '—';
    // D1 datetime('now') 포맷: "2026-04-23 23:38:04"
    var iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return s;
    try {
      return d.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
        hour12: true
      }) + ' KST';
    } catch (_) {
      return s;
    }
  }

  function updateVersionDisplay() {
    var siteVer = 'V' + (GW.APP_VERSION || '—');
    var adminVer = 'V' + (GW.ADMIN_VERSION || '—');
    document.querySelectorAll('.site-build-version').forEach(function (el) { el.textContent = siteVer; });
    document.querySelectorAll('.admin-build-version').forEach(function (el) { el.textContent = adminVer; });
    setText('kms-ver-site', siteVer);
    setText('kms-build-version', siteVer);
    setText('kms-release-note-version', 'Site ' + siteVer + ' · 정책/KMS 최신화 반영본');
  }

  // ── API 가이드 렌더링 ──────────────────────────────────────────
  function renderApiGuide() {
    var container = document.getElementById('kms-api-guide');
    if (!container) return;

    var methodColors = {
      'GET': '#22863a', 'POST': '#0069d9', 'PUT': '#b08800',
      'DELETE': '#cb2431', 'GET|PUT': '#6f42c1',
    };

    container.innerHTML = API_GROUPS.map(function (group) {
      var endpointsHtml = group.endpoints.map(function (ep) {
        var color = methodColors[ep.method] || '#555';
        var authBadge = ep.auth === false
          ? '<span class="kms-api-badge kms-api-badge-public">공개</span>'
          : ep.auth === 'optional'
          ? '<span class="kms-api-badge kms-api-badge-optional">토큰 선택</span>'
          : ep.auth === 'PUT only'
          ? '<span class="kms-api-badge kms-api-badge-admin">PUT 시 admin 필요</span>'
          : '<span class="kms-api-badge kms-api-badge-admin">admin 전용</span>';

        var paramsHtml = ep.params && ep.params.length
          ? '<div class="kms-api-section-label">Query Parameters</div>' +
            '<table class="kms-api-table"><thead><tr><th>이름</th><th>설명</th></tr></thead><tbody>' +
            ep.params.map(function (p) {
              return '<tr><td><code>' + GW.escapeHtml(p.name) + '</code></td><td>' + GW.escapeHtml(p.desc) + '</td></tr>';
            }).join('') +
            '</tbody></table>'
          : '';

        var requestHtml = ep.request
          ? '<div class="kms-api-section-label">Request Body</div><pre class="kms-api-pre"><code>' + GW.escapeHtml(ep.request) + '</code></pre>'
          : '';

        var responseHtml = ep.response
          ? '<div class="kms-api-section-label">Response</div><pre class="kms-api-pre"><code>' + GW.escapeHtml(ep.response) + '</code></pre>'
          : '';

        var notesHtml = ep.notes
          ? '<div class="kms-api-notes"><span class="kms-api-notes-icon">ℹ</span>' + GW.escapeHtml(ep.notes).replace(/\n/g, '<br>') + '</div>'
          : '';

        return '<div class="kms-api-endpoint">' +
          '<div class="kms-api-endpoint-head">' +
            '<span class="kms-api-method" style="background:' + color + '">' + GW.escapeHtml(ep.method) + '</span>' +
            '<code class="kms-api-path">' + GW.escapeHtml(ep.path) + '</code>' +
            authBadge +
          '</div>' +
          '<div class="kms-api-summary">' + GW.escapeHtml(ep.summary) + '</div>' +
          paramsHtml + requestHtml + responseHtml + notesHtml +
          '</div>';
      }).join('');

      return '<section class="kms-api-group" id="kms-api-' + group.id + '">' +
        '<div class="kms-api-group-head">' +
          '<h3 class="kms-api-group-title">' + GW.escapeHtml(group.label) + '</h3>' +
          '<p class="kms-api-group-desc">' + GW.escapeHtml(group.desc) + '</p>' +
        '</div>' +
        '<div class="kms-api-endpoints">' + endpointsHtml + '</div>' +
        '</section>';
    }).join('');
  }

  // ── 버전기록 ──────────────────────────────────────────────────
  function loadChangelog() {
    var container = document.getElementById('kms-changelog');
    fetch('/data/changelog.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('not ok'); return r.json(); })
      .then(function (data) {
        _state.changelogItems = Array.isArray(data) ? data : (Array.isArray(data && data.items) ? data.items : []);
        renderChangelog(_state.changelogItems, _state.changelogScope);
      })
      .catch(function () {
        if (container) container.innerHTML = '<div class="kms-list-empty">버전기록을 불러오지 못했습니다.</div>';
      });
  }

  function inferChangelogScope(item) {
    var raw = String(item && item.scope || '').trim().toLowerCase();
    if (raw === 'site' || raw === 'admin' || raw === 'both') return raw;
    var version = String(item && item.version || '').trim();
    if (/^03\./.test(version) || /^3\./.test(version)) return 'admin';
    if (/^00\./.test(version) || /^0\./.test(version)) return 'site';
    return 'both';
  }

  function inferChangelogType(item) {
    var raw = String(item && item.type || '').trim();
    if (raw) return raw;
    return 'Update';
  }

  function changelogScopeLabel(scope) {
    return scope === 'site' ? 'Site' : scope === 'admin' ? 'Admin' : 'Site + Admin';
  }

  function renderChangelog(items, scope) {
    var container = document.getElementById('kms-changelog');
    if (!container) return;
    if (!items || !items.length) {
      container.innerHTML = '<div class="kms-list-empty">버전기록이 없습니다.</div>';
      return;
    }

    var filtered = scope === 'all'
      ? items
      : items.filter(function (item) {
          var s = inferChangelogScope(item);
          if (scope === 'both') return s === 'both';
          if (scope === 'site') return s === 'site' || s === 'both';
          if (scope === 'admin') return s === 'admin' || s === 'both';
          return true;
        });

    if (!filtered.length) {
      container.innerHTML = '<div class="kms-list-empty">선택한 범위의 버전기록이 없습니다.</div>';
      return;
    }

    // 30개 단위 페이지네이션. 전체가 30 이하면 pagination UI는 숨김.
    var PAGE_SIZE = 30;
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    var page = Math.min(Math.max(1, _state.changelogPage || 1), totalPages);
    _state.changelogPage = page;
    var start = (page - 1) * PAGE_SIZE;
    var paged = filtered.slice(start, start + PAGE_SIZE);

    var typeColors = { Update: '#0069d9', Bugfix: '#cb2431', Hotfix: '#cb2431', Feature: '#22863a', Refactor: '#6f42c1' };

    var itemsHtml = paged.map(function (item) {
      var type = inferChangelogType(item);
      var typeColor = typeColors[type] || '#555';
      var releaseScope = inferChangelogScope(item);
      var scopeLabel = changelogScopeLabel(releaseScope);
      var releaseDateText = String(item.released_at || item.date || '');
      var changesList = (Array.isArray(item.items) ? item.items : Array.isArray(item.changes) ? item.changes : []);
      var issueList = Array.isArray(item.issues) ? item.issues : [];
      var changesHtml = changesList.length
        ? '<ul class="kms-cl-changes">' + changesList.map(function (c) {
            return '<li>' + GW.escapeHtml(String(c || '')) + '</li>';
          }).join('') + '</ul>'
        : '';
      var issueHtml = issueList.length
        ? '<div class="kms-cl-issues-wrap">' +
            '<div class="kms-cl-issues-title">정상이어야 했지만 실제로 작동하지 않았던 항목</div>' +
            '<ul class="kms-cl-issues">' + issueList.map(function (c) {
              return '<li>' + GW.escapeHtml(String(c || '')) + '</li>';
            }).join('') + '</ul>' +
          '</div>'
        : '';

      return '<article class="kms-cl-item">' +
        '<div class="kms-cl-item-head">' +
          '<div class="kms-cl-item-version">' +
            '<span class="kms-cl-scope kms-cl-scope-' + GW.escapeHtml(releaseScope) + '">' + GW.escapeHtml(scopeLabel) + '</span>' +
            '<span class="kms-cl-ver">v' + GW.escapeHtml(String(item.version || '')) + '</span>' +
            '<span class="kms-cl-type" style="background:' + typeColor + '">' + GW.escapeHtml(String(type || '')) + '</span>' +
          '</div>' +
          '<span class="kms-cl-date">' + GW.escapeHtml(releaseDateText) + '</span>' +
        '</div>' +
        '<p class="kms-cl-summary">' + GW.escapeHtml(String(item.summary || '')) + '</p>' +
        issueHtml +
        changesHtml +
        '</article>';
    }).join('');

    var paginationHtml = '';
    if (totalPages > 1) {
      var windowSize = 7; // 표시할 번호 버튼 최대 개수
      var half = Math.floor(windowSize / 2);
      var pStart = Math.max(1, page - half);
      var pEnd = Math.min(totalPages, pStart + windowSize - 1);
      pStart = Math.max(1, pEnd - windowSize + 1);
      var nums = [];
      for (var p = pStart; p <= pEnd; p += 1) nums.push(p);
      paginationHtml =
        '<nav class="kms-cl-pagination" aria-label="버전기록 페이지">' +
          '<button type="button" class="kms-cl-page-btn" data-kms-cl-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>이전</button>' +
          (pStart > 1 ? '<button type="button" class="kms-cl-page-btn" data-kms-cl-page="1">1</button>' + (pStart > 2 ? '<span class="kms-cl-page-gap">…</span>' : '') : '') +
          nums.map(function (n) {
            return '<button type="button" class="kms-cl-page-btn' + (n === page ? ' is-active' : '') + '" data-kms-cl-page="' + n + '">' + n + '</button>';
          }).join('') +
          (pEnd < totalPages ? (pEnd < totalPages - 1 ? '<span class="kms-cl-page-gap">…</span>' : '') + '<button type="button" class="kms-cl-page-btn" data-kms-cl-page="' + totalPages + '">' + totalPages + '</button>' : '') +
          '<button type="button" class="kms-cl-page-btn" data-kms-cl-page="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '>다음</button>' +
          '<span class="kms-cl-page-info">' + page + ' / ' + totalPages + ' 페이지 · 총 ' + filtered.length + '건</span>' +
        '</nav>';
    } else {
      paginationHtml = '<div class="kms-cl-page-info kms-cl-page-info-single">총 ' + filtered.length + '건</div>';
    }

    container.innerHTML = itemsHtml + paginationHtml;
  }

  // ── 디자인 시스템 탭 ──────────────────────────────────────────
  function renderDesignSystem() {
    var container = document.getElementById('kms-tab-design');
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';

    var bodyEl = container.querySelector('.kms-ds-body');
    if (!bodyEl) return;
    var overview = {
      kinds: [
        { title: 'Foundation', desc: '색상, 타이포, 간격, 명암비처럼 모든 화면이 공유하는 기본 토큰입니다.' },
        { title: 'Component', desc: '버튼, 칩, 카드, 폼처럼 재사용 가능한 UI 블록입니다.' },
        { title: 'Pattern', desc: '헤더, 히어로, 섹션 레일처럼 여러 모듈을 묶어 쓰는 조합입니다.' },
        { title: 'Responsive', desc: '데스크톱과 모바일에서 같은 구조를 무리 없이 보여주는 기준입니다.' }
      ],
      rules: [
        { title: '접근성을 먼저 본다', desc: 'WCAG 3.0(Silver draft) APCA Lc를 기준으로 색과 조합을 선택합니다(본문 |Lc| 75+, 콘텐츠 60+, 대형·헤더 45+, UI 30+). 새 UI는 이 원칙부터 통과해야 합니다.' },
        { title: '색상만으로 정보 전달 금지', desc: '에러·성공·링크는 색 + 아이콘 + 텍스트의 3중 신호로 표시합니다. 색각이상자와 그레이스케일에서도 구분되어야 합니다.' },
        { title: '모듈 단위로 본다', desc: '각 카드에 종류, 토큰/클래스, 코드, 미리보기를 함께 둡니다. 코드와 미리보기는 1:1로 대응합니다.' },
        { title: '리터럴 HEX 금지', desc: '모든 색은 CSS 변수로만 참조합니다 (var(--color-*)). 새 색 추가 시 KMS + 토큰 + 문서를 동시에 갱신합니다.' }
      ],
      breakpoints: ['Desktop 1180+', 'Tablet 900+', 'Mobile 768-', 'Compact 480-']
    };

    var layers = [
      {
        title: 'FOUNDATION',
        sub: '디자인의 종류와 기본 토큰부터 먼저 파악합니다.',
        sections: [
          {
            title: '01 · 기본 토큰 (컬러·타이포·여백)',
            note: '모든 화면이 공유하는 Foundation 레이어의 3대 토큰을 먼저 잡습니다. 색·타이포·간격은 어느 UI에서도 일관된 언어로 쓰여야 하므로 이 섹션이 다른 모든 섹션의 전제입니다.',
            modules: [
              {
                kind: 'Foundation',
                title: '브랜드 팔레트 (10색) & 태그 토큰',
                summary: '공개 사이트와 관리자 콘솔이 공유하는 10색 기본 팔레트입니다. 각 색 옆의 Lc 값은 Canvas White 배경 기준 APCA(WCAG 3.0) 실측치이며, 본문·대형·장식 용도로 분류됩니다. 상세 규칙은 아래 02 · 웹 접근성 & 컬러 규칙 섹션 참조.',
                meta: [
                  { label: '본문 텍스트 OK (Lc 75~100+)', values: ['Midnight Purple Lc 100.2', 'Scouting Purple Lc 92.4', 'Forest Green Lc 73.0'] },
                  { label: '콘텐츠 / 헤더·UI만 (Lc 45~65)', values: ['Ocean Blue Lc 64.3', 'Fire Red Lc 58.9'] },
                  { label: '장식·UI spot 전용 (Lc < 45)', values: ['Blossom Pink Lc 40.0', 'Ember Orange Lc 35.1', 'River Blue Lc 23.6', 'Leaf Green Lc 21.0'] },
                  { label: '연결 클래스', values: ['.category-tag', '.post-kicker', '.home-section-title'] }
                ],
                code: [
                  '/* css/style.css :root 토큰 */',
                  ':root {',
                  '  --color-scouting-purple: #622599;',
                  '  --color-midnight-purple: #4D006E;',
                  '  --color-canvas-white:    #FFFFFF;',
                  '  --color-forest-green:    #248737;',
                  '  --color-fire-red:        #FF5655;',
                  '  --color-ocean-blue:      #0094B4;',
                  '  --color-blossom-pink:    #FF8DFF;',
                  '  --color-ember-orange:    #FFAE80;',
                  '  --color-river-blue:      #82E6DE;',
                  '  --color-leaf-green:      #9FED8F;',
                  '',
                  '  /* 진검정 + 5단계 그레이스케일 */',
                  '  --black:      #030303;',
                  '  --ink:        #1F1F1F;  /* 본문 텍스트용 soft black */',
                  '  --gray-900:   #030303;  /* = --black */',
                  '  --gray-700:   #3F3F3F;',
                  '  --gray-500:   #8F8F8F;',
                  '  --gray-300:   #C4C4C4;',
                  '  --gray-100:   #EBEBEB;',
                  '}'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="kms-ds-token-grid">',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#4D006E"></span><strong>Midnight Purple</strong><code>#4D006E</code><small style="color:#146E7A;font-weight:600">Lc 100.2 · 본문 OK</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#622599"></span><strong>Scouting Purple</strong><code>#622599</code><small style="color:#146E7A;font-weight:600">Lc 92.4 · 본문 OK</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#248737"></span><strong>Forest Green</strong><code>#248737</code><small style="color:#146E7A;font-weight:600">Lc 73.0 · 콘텐츠 OK</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#0094B4"></span><strong>Ocean Blue</strong><code>#0094B4</code><small style="color:#B8651F;font-weight:600">Lc 64.3 · 콘텐츠·UI</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#FF5655"></span><strong>Fire Red</strong><code>#FF5655</code><small style="color:#B8651F;font-weight:600">Lc 58.9 · 대형·헤더</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip kms-ds-token-chip-light" style="background:#FFFFFF"></span><strong>Canvas White</strong><code>#FFFFFF</code><small style="color:#5a5048">배경</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#FF8DFF"></span><strong>Blossom Pink</strong><code>#FF8DFF</code><small style="color:#B02A2A;font-weight:600">Lc 40.0 · UI·spot만</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#FFAE80"></span><strong>Ember Orange</strong><code>#FFAE80</code><small style="color:#B02A2A;font-weight:600">Lc 35.1 · UI·spot만</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#82E6DE"></span><strong>River Blue</strong><code>#82E6DE</code><small style="color:#B02A2A;font-weight:600">Lc 23.6 · spot만</small></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#9FED8F"></span><strong>Leaf Green</strong><code>#9FED8F</code><small style="color:#B02A2A;font-weight:600">Lc 21.0 · spot만</small></div>',
                  '  </div>',
                  // 그레이스케일 5단계 칩셋 (#030303 기반)
                  '  <div style="margin-top:10px;padding-top:12px;border-top:1px dashed rgba(31,31,31,0.15)">',
                  '    <div style="font-size:11px;font-weight:700;color:#4D006E;letter-spacing:0.08em;margin-bottom:8px">그레이스케일 5단계 (Black = <code>#030303</code> 기반)</div>',
                  '    <div class="kms-ds-token-grid">',
                  '      <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#030303"></span><strong>Gray 900 · Black</strong><code>#030303</code><small style="color:#146E7A;font-weight:600">Lc 107.7 · 본문 OK</small></div>',
                  '      <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#3f3f3f"></span><strong>Gray 700</strong><code>#3F3F3F</code><small style="color:#146E7A;font-weight:600">Lc 96.2 · 본문 OK</small></div>',
                  '      <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#8f8f8f"></span><strong>Gray 500</strong><code>#8F8F8F</code><small style="color:#146E7A;font-weight:600">Lc 61.3 · 콘텐츠 OK</small></div>',
                  '      <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#c4c4c4"></span><strong>Gray 300</strong><code>#C4C4C4</code><small style="color:#B8651F;font-weight:600">Lc 33.5 · UI만</small></div>',
                  '      <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#ebebeb"></span><strong>Gray 100</strong><code>#EBEBEB</code><small style="color:#B02A2A;font-weight:600">Lc 11.1 · 배경만</small></div>',
                  '    </div>',
                  '    <div style="margin-top:8px;font-size:12px;color:#5a5048;line-height:1.5">',
                  '      용도: <strong>Gray 900</strong> = 최대 대비 emphasis, <strong>Gray 700</strong> = 보조 텍스트·아이콘, <strong>Gray 500</strong> = disabled 텍스트·UI 테두리, <strong>Gray 300</strong> = 구분선·보조 border, <strong>Gray 100</strong> = 섹션 배경·tint. 본문 텍스트는 <code>--ink</code>(#1F1F1F, soft black)를 기본으로 사용.',
                  '    </div>',
                  '  </div>',
                  '  <div class="kms-ds-row" style="margin-top:8px">',
                  '    <span class="category-tag tag-korea">Korea</span>',
                  '    <span class="post-kicker tag-apr-kicker">APR</span>',
                  '    <span class="post-kicker tag-wosm-kicker">WOSM</span>',
                  '    <span class="post-kicker tag-people-kicker">사람들</span>',
                  '  </div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Foundation',
                title: '타이포 스케일 & 읽기 리듬',
                summary: '제목, 본문, 메타는 크기보다 역할로 구분합니다. 같은 모듈 안에서도 읽기 순서가 바로 느껴져야 합니다.',
                meta: [
                  { label: '타이포', values: ['--fs-display', '--fs-title', '--fs-body', '--fs-meta'] },
                  { label: '간격', values: ['--home-title-gap', '--home-grid-gap', '--chip-height'] }
                ],
                code: [
                  '<article class="post-card-body">',
                  '  <h3>세계 스카우트 연맹 총회 2026 결과 보고</h3>',
                  '  <p class="post-card-excerpt">핵심 내용은 2~3줄 안에서 바로 이해되도록 정리합니다.</p>',
                  '  <div class="post-card-meta">2026.04.04 · 조회 1,204</div>',
                  '</article>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-type-scale">',
                  '  <div class="kms-ds-scale-item"><span class="kms-ds-scale-meta">Display · 32 / 700</span><strong>BP미디어 디자인 시스템</strong></div>',
                  '  <div class="kms-ds-scale-item"><span class="kms-ds-scale-meta">Title · 18 / 600</span><span class="kms-ds-scale-title">기사 카드 제목은 빠르게 스캔되어야 합니다.</span></div>',
                  '  <div class="kms-ds-scale-item"><span class="kms-ds-scale-meta">Body · 14 / 300</span><p>본문은 1.65 전후의 줄높이로 읽기 리듬을 확보하고, 메타 정보는 더 작고 옅게 분리합니다.</p></div>',
                  '  <div class="kms-ds-scale-item"><span class="kms-ds-scale-meta">Meta · 11 / uppercase</span><code>2026.04.04 · design review</code></div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Foundation',
                title: '간격(Spacing) 시스템 — 상하·좌우·페이지 거터',
                summary: '간격은 4px 그리드 기반의 9개 의미 토큰으로 관리합니다. padding·margin·gap 속성은 이 토큰 중 하나를 사용하며, 리터럴(8px/16px/24px 등) 직접 사용은 점진적으로 제거합니다.',
                meta: [
                  { label: '수직·일반 간격', values: ['--gap-micro 4px', '--gap-tight 8px', '--gap-element 12px', '--gap-card 16px', '--gap-section 24px', '--gap-section-out 32px'] },
                  { label: '페이지 거터 (좌우)', values: ['--pad-page-desktop 48px', '--pad-page-tablet 32px', '--pad-page-mobile 16px'] },
                  { label: '적용 속성', values: ['padding', 'margin', 'gap', 'row-gap', 'column-gap'] },
                  { label: '용도', values: ['토큰 우선 사용', '엣지 케이스(3px·6px 등)만 리터럴 허용'] }
                ],
                code: [
                  '/* ✅ 토큰 사용 */',
                  '.article-card        { padding: var(--gap-card); gap: var(--gap-element); }',
                  '.home-section        { padding: var(--gap-section); margin-bottom: var(--gap-section-out); }',
                  '.page-container      { padding-inline: var(--pad-page-desktop); }',
                  '@media (max-width:768px) {',
                  '  .page-container    { padding-inline: var(--pad-page-mobile); }',
                  '}',
                  '',
                  '/* ❌ 금지 (점진적 제거 대상) */',
                  '.article-card-bad    { padding: 16px; gap: 12px; }'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  // Vertical scale ruler
                  '  <div style="border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:14px;background:#fff">',
                  '    <div style="font-size:11px;font-weight:700;color:#4D006E;letter-spacing:0.08em;margin-bottom:10px">수직·일반 간격 (stack gap, padding, margin)</div>',
                  '    <div style="display:grid;grid-template-columns:180px 1fr;gap:6px;align-items:center;font-size:12px">',
                  '      <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:4px;height:12px;background:#4D006E"></span><code>--gap-micro</code></div>',
                  '      <div style="color:#5a5048"><strong style="color:#4D006E">4px</strong> · 아이콘-글자 간격, 얇은 구분선</div>',
                  '      <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:8px;height:12px;background:#4D006E"></span><code>--gap-tight</code></div>',
                  '      <div style="color:#5a5048"><strong style="color:#4D006E">8px</strong> · 칩 안 padding, 인라인 요소 간격</div>',
                  '      <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:12px;height:12px;background:#4D006E"></span><code>--gap-element</code></div>',
                  '      <div style="color:#5a5048"><strong style="color:#4D006E">12px</strong> · 컴포넌트 내부 요소 간격</div>',
                  '      <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:16px;height:12px;background:#4D006E"></span><code>--gap-card</code></div>',
                  '      <div style="color:#5a5048"><strong style="color:#4D006E">16px</strong> · 카드 내부 padding, 리스트 항목</div>',
                  '      <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:24px;height:12px;background:#4D006E"></span><code>--gap-section</code></div>',
                  '      <div style="color:#5a5048"><strong style="color:#4D006E">24px</strong> · 섹션 내부 블록 간격</div>',
                  '      <div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:32px;height:12px;background:#4D006E"></span><code>--gap-section-out</code></div>',
                  '      <div style="color:#5a5048"><strong style="color:#4D006E">32px</strong> · 섹션과 섹션 사이</div>',
                  '    </div>',
                  '  </div>',
                  // Horizontal page gutter
                  '  <div style="border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:14px;background:#fff">',
                  '    <div style="font-size:11px;font-weight:700;color:#4D006E;letter-spacing:0.08em;margin-bottom:10px">페이지 좌우 거터 (padding-inline / responsive)</div>',
                  '    <div style="display:grid;gap:8px;font-size:12px">',
                  '      <div style="position:relative;padding:10px 48px;background:#f5f3ef;border-radius:6px">',
                  '        <span style="position:absolute;left:0;top:0;bottom:0;width:48px;background:rgba(98,37,153,0.12);border-right:1px dashed #622599"></span>',
                  '        <span style="position:absolute;right:0;top:0;bottom:0;width:48px;background:rgba(98,37,153,0.12);border-left:1px dashed #622599"></span>',
                  '        <strong style="color:#4D006E">Desktop 48px</strong> <code style="color:#5a5048">--pad-page-desktop</code>',
                  '      </div>',
                  '      <div style="position:relative;padding:10px 32px;background:#f5f3ef;border-radius:6px">',
                  '        <span style="position:absolute;left:0;top:0;bottom:0;width:32px;background:rgba(98,37,153,0.12);border-right:1px dashed #622599"></span>',
                  '        <span style="position:absolute;right:0;top:0;bottom:0;width:32px;background:rgba(98,37,153,0.12);border-left:1px dashed #622599"></span>',
                  '        <strong style="color:#4D006E">Tablet 32px</strong> <code style="color:#5a5048">--pad-page-tablet</code>',
                  '      </div>',
                  '      <div style="position:relative;padding:10px 16px;background:#f5f3ef;border-radius:6px">',
                  '        <span style="position:absolute;left:0;top:0;bottom:0;width:16px;background:rgba(98,37,153,0.12);border-right:1px dashed #622599"></span>',
                  '        <span style="position:absolute;right:0;top:0;bottom:0;width:16px;background:rgba(98,37,153,0.12);border-left:1px dashed #622599"></span>',
                  '        <strong style="color:#4D006E">Mobile 16px</strong> <code style="color:#5a5048">--pad-page-mobile</code>',
                  '      </div>',
                  '    </div>',
                  '  </div>',
                  '</div>'
                ].join(''),
              }
            ]
          },
          {
            title: '02 · 웹 접근성 & 컬러 규칙',
            note: '색 선택의 출발점은 브랜드가 아니라 접근성입니다. WCAG 3.0(Silver draft) APCA 알고리즘 기준 Lc 값으로 10색 팔레트의 사용 범위가 결정됩니다. 새 UI·색 조합을 만들 때는 이 섹션부터 통과시킵니다.',
            modules: [
              {
                kind: 'Foundation',
                title: 'WCAG 3.0 APCA Lc 기준표',
                summary: 'APCA(Accessible Perceptual Contrast Algorithm)는 WCAG 3.0의 공식 명암비 계산 방식으로, 기존 2.1의 4.5:1·3:1 비율 대신 Lc(-108~+108) 지각 기반 값으로 용도를 결정합니다. 양수는 어두운 텍스트/밝은 배경, 음수는 밝은 텍스트/어두운 배경이며 절대값 |Lc|로 판단합니다.',
                meta: [
                  { label: '본문 텍스트 (15px+ / 400wt)', values: ['|Lc| 75 이상 필수', '90 이상 권장'] },
                  { label: '콘텐츠 텍스트 (14px+ medium)', values: ['|Lc| 60 이상'] },
                  { label: '대형·헤더 텍스트 (18px bold / 24px+)', values: ['|Lc| 45 이상'] },
                  { label: 'UI 요소·아이콘·테두리·포커스', values: ['|Lc| 30 이상'] },
                  { label: '검증 도구', values: ['apcacontrast.com', 'DevTools Emulate vision deficiencies', 'APCA polyfill(JS)'] }
                ],
                code: [
                  '/* 이 프로젝트 기본 목표 (APCA Lc 절대값) */',
                  '/* - 본문 텍스트: |Lc| 75+ 필수, 핵심 표면은 90+ 권장 */',
                  '/* - 콘텐츠 텍스트(14px medium): |Lc| 60+ */',
                  '/* - 대형·헤더(18 bold / 24+): |Lc| 45+ */',
                  '/* - UI·아이콘·테두리·포커스: |Lc| 30+ */',
                  '',
                  '/* APCA 공식(요약) */',
                  '/* Y = 0.2126729*R^2.4 + 0.7151522*G^2.4 + 0.0721750*B^2.4 */',
                  '/* Lc = (Y_bg^0.56 - Y_txt^0.57) * 1.14 * 100  (dark text) */',
                  '/* Lc = (Y_bg^0.65 - Y_txt^0.62) * 1.14 * 100  (light text, 음수) */',
                  '',
                  '/* 실무 체크리스트 */',
                  '/* 1. apcacontrast.com 으로 텍스트-배경 조합 확인 */',
                  '/* 2. Chrome DevTools → Rendering → Emulate vision deficiencies */',
                  '/* 3. 그레이스케일 모드에서 상태·링크가 구분되는지 확인 */',
                  '/* 4. 키보드 Tab 이동 시 포커스가 항상 보이는지 확인 */'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div style="display:grid;grid-template-columns:2fr 1fr 2fr;gap:0;border:1px solid rgba(31,31,31,0.12);border-radius:10px;overflow:hidden;font-size:13px">',
                  '    <div style="padding:10px 12px;background:#f5f3ef;font-weight:700;border-bottom:1px solid rgba(31,31,31,0.1)">용도</div>',
                  '    <div style="padding:10px 12px;background:#f5f3ef;font-weight:700;border-bottom:1px solid rgba(31,31,31,0.1);text-align:center">|Lc| 최소</div>',
                  '    <div style="padding:10px 12px;background:#f5f3ef;font-weight:700;border-bottom:1px solid rgba(31,31,31,0.1)">비고</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06)">본문 텍스트 (15px+ / 400wt)</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06);text-align:center;font-weight:700;color:#146E7A">75</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06);color:#5a5048">핵심 표면은 90+ 권장</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06)">콘텐츠 텍스트 (14px medium)</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06);text-align:center;font-weight:700;color:#146E7A">60</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06);color:#5a5048">메타 · 보조 설명</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06)">대형·헤더 (18 bold / 24+)</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06);text-align:center;font-weight:700;color:#B8651F">45</div>',
                  '    <div style="padding:10px 12px;border-bottom:1px solid rgba(31,31,31,0.06);color:#5a5048">본문 크기에선 부족</div>',
                  '    <div style="padding:10px 12px">UI 요소·테두리·아이콘·포커스</div>',
                  '    <div style="padding:10px 12px;text-align:center;font-weight:700;color:#B8651F">30</div>',
                  '    <div style="padding:10px 12px;color:#5a5048">spot 전용, 본문 금지</div>',
                  '  </div>',
                  '  <div style="font-size:12px;color:#5a5048;margin-top:6px">',
                  '    <strong style="color:#4D006E">참고:</strong> APCA는 WCAG 2.1의 4.5:1 비율 체계를 대체합니다. Lc는 <strong>지각 기반</strong>이라 같은 산술 비율이라도 실제 가독성을 더 정확히 반영합니다. 현재 프로젝트는 WCAG 3.0 Silver draft를 준용합니다.',
                  '  </div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Foundation',
                title: '안전한 조합 vs 위반 조합',
                summary: '같은 10색이라도 배경-텍스트 조합에 따라 읽기 가능 여부가 달라집니다. 왼쪽은 본문으로 써도 되는 조합(✅ |Lc| 75+), 오른쪽은 절대 텍스트로 쓰면 안 되는 조합(❌ |Lc| < 30)입니다. APCA Lc 값은 음수(밝은 텍스트/어두운 배경)도 절대값으로 판단.',
                meta: [
                  { label: '✅ 본문 가능 (|Lc| 75+)', values: ['White + Midnight (Lc 100.2)', 'White + Scouting (Lc 92.4)', 'Midnight + White (|Lc| 103.6)', 'Midnight + Leaf Green (|Lc| 79.8)'] },
                  { label: '❌ 텍스트 금지 (|Lc| < 30)', values: ['White + Blossom Pink (Lc 40.0, spot만)', 'White + Ember Orange (Lc 35.1, spot만)', 'White + River Blue (Lc 23.6)', 'White + Leaf Green (Lc 21.0)'] },
                  { label: '파스텔 위에 텍스트를 얹어야 할 때', values: ['반드시 Midnight Purple 또는 Black'] }
                ],
                code: [
                  '<!-- ✅ 안전: 본문으로 써도 OK (|Lc| 75 이상) -->',
                  '<p style="background:#fff;color:#4D006E">Midnight on White — Lc 100.2</p>',
                  '<p style="background:#fff;color:#622599">Scouting on White — Lc 92.4</p>',
                  '<p style="background:#fff;color:#248737">Forest on White — Lc 73.0 (콘텐츠)</p>',
                  '',
                  '<!-- ❌ 위반: 읽히지 않는다 (|Lc| < 45) -->',
                  '<p style="background:#fff;color:#FF8DFF">Blossom on White — Lc 40.0 (UI만)</p>',
                  '<p style="background:#fff;color:#FFAE80">Ember on White — Lc 35.1 (UI만)</p>',
                  '',
                  '<!-- ✅ 파스텔은 Midnight 배경과 조합 (음수 Lc, 절대값 판단) -->',
                  '<p style="background:#4D006E;color:#FF8DFF">Blossom on Midnight — |Lc| 60.2</p>',
                  '<p style="background:#4D006E;color:#9FED8F">Leaf on Midnight — |Lc| 79.8</p>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">',
                  '    <div style="border:2px solid #248737;border-radius:10px;padding:14px;background:#fff">',
                  '      <div style="font-size:11px;font-weight:700;color:#248737;margin-bottom:8px;letter-spacing:0.08em">✅ 본문 가능 (|Lc| 75+)</div>',
                  '      <div style="background:#fff;color:#4D006E;padding:6px 10px;border-radius:6px;margin-bottom:6px;font-weight:500">Midnight on White · Lc 100.2</div>',
                  '      <div style="background:#fff;color:#622599;padding:6px 10px;border-radius:6px;margin-bottom:6px;font-weight:500">Scouting on White · Lc 92.4</div>',
                  '      <div style="background:#fff;color:#248737;padding:6px 10px;border-radius:6px;margin-bottom:6px;font-weight:500">Forest on White · Lc 73.0</div>',
                  '      <div style="background:#4D006E;color:#9FED8F;padding:6px 10px;border-radius:6px;font-weight:500">Leaf on Midnight · |Lc| 79.8</div>',
                  '    </div>',
                  '    <div style="border:2px solid #B02A2A;border-radius:10px;padding:14px;background:#fff">',
                  '      <div style="font-size:11px;font-weight:700;color:#B02A2A;margin-bottom:8px;letter-spacing:0.08em">❌ 본문 금지 (|Lc| < 45)</div>',
                  '      <div style="background:#fff;color:#FF8DFF;padding:6px 10px;border-radius:6px;margin-bottom:6px;font-weight:500">Blossom on White · Lc 40.0</div>',
                  '      <div style="background:#fff;color:#FFAE80;padding:6px 10px;border-radius:6px;margin-bottom:6px;font-weight:500">Ember on White · Lc 35.1</div>',
                  '      <div style="background:#fff;color:#82E6DE;padding:6px 10px;border-radius:6px;margin-bottom:6px;font-weight:500">River on White · Lc 23.6</div>',
                  '      <div style="background:#fff;color:#9FED8F;padding:6px 10px;border-radius:6px;font-weight:500">Leaf on White · Lc 21.0</div>',
                  '    </div>',
                  '  </div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Pattern',
                title: '색상만으로 정보 전달 금지',
                summary: '에러·성공·경고·링크 같은 상태는 색 + 아이콘 + 텍스트의 3중 신호로 표기합니다. 색각이상자(남성 8%) 또는 그레이스케일 인쇄 환경에서도 구분되어야 합니다.',
                meta: [
                  { label: '원칙', values: ['색 + 아이콘 + 텍스트 3중 표기', '그레이스케일에서도 구분'] },
                  { label: '대상', values: ['에러', '성공', '경고', '링크'] },
                  { label: 'ARIA', values: ['role="status"', 'aria-live="polite"', 'aria-invalid="true"'] }
                ],
                code: [
                  '<!-- ❌ 위반: 빨간색만으로 에러 표시 -->',
                  '<span style="color:#FF5655">저장에 실패했습니다.</span>',
                  '',
                  '<!-- ✅ 준수: 색 + 아이콘 + 텍스트 라벨 -->',
                  '<span role="status" aria-live="polite">',
                  '  <svg aria-hidden="true">⚠</svg>',
                  '  <strong>오류</strong>',
                  '  저장에 실패했습니다. 네트워크를 확인하세요.',
                  '</span>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">',
                  '    <div style="border:2px solid #B02A2A;border-radius:10px;padding:14px;background:#fff">',
                  '      <div style="font-size:11px;font-weight:700;color:#B02A2A;margin-bottom:10px;letter-spacing:0.08em">❌ 색만 사용 (위반)</div>',
                  '      <div style="color:#FF5655;font-size:14px;padding:6px 0">저장에 실패했습니다.</div>',
                  '      <div style="color:#248737;font-size:14px;padding:6px 0">저장되었습니다.</div>',
                  '      <div style="color:#5a5048;font-size:11px;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(31,31,31,0.15)">그레이스케일에서 둘 다 회색 — 구분 불가</div>',
                  '    </div>',
                  '    <div style="border:2px solid #248737;border-radius:10px;padding:14px;background:#fff">',
                  '      <div style="font-size:11px;font-weight:700;color:#248737;margin-bottom:10px;letter-spacing:0.08em">✅ 색 + 아이콘 + 라벨 (준수)</div>',
                  '      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff5f5;border-left:3px solid #FF5655;border-radius:4px;margin-bottom:6px">',
                  '        <span aria-hidden="true" style="font-weight:700;color:#B02A2A">⚠</span>',
                  '        <strong style="color:#4D006E;font-size:13px">오류</strong>',
                  '        <span style="color:#4D006E;font-size:13px">저장에 실패했습니다.</span>',
                  '      </div>',
                  '      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f3faf5;border-left:3px solid #248737;border-radius:4px">',
                  '        <span aria-hidden="true" style="font-weight:700;color:#248737">✓</span>',
                  '        <strong style="color:#4D006E;font-size:13px">성공</strong>',
                  '        <span style="color:#4D006E;font-size:13px">저장되었습니다.</span>',
                  '      </div>',
                  '    </div>',
                  '  </div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Component',
                title: '키보드 포커스 인디케이터',
                summary: '키보드 Tab 탐색 중 현재 포커스된 요소는 항상 배경과 |Lc| 30 이상 대비로 표시합니다. outline: none을 쓸 때는 box-shadow 또는 outline-offset으로 대체 표시를 반드시 제공합니다.',
                meta: [
                  { label: '필수', values: ['outline |Lc| 30 이상', 'focus-visible 우선 사용', '마우스 클릭 시엔 굳이 안 보여도 됨'] },
                  { label: '금지', values: ['outline: none (대체 없이)', '투명도만 낮춘 outline'] },
                  { label: '권장 구현', values: [':focus-visible { outline: 2px solid; outline-offset: 2px; }'] }
                ],
                code: [
                  '/* ✅ 권장: focus-visible + outline-offset, |Lc| 30+ 보장 */',
                  '.btn:focus-visible {',
                  '  outline: 2px solid var(--color-scouting-purple);',
                  '  outline-offset: 2px;',
                  '}',
                  '',
                  '/* ✅ 어두운 배경에선 밝은 색으로 (|Lc| 음수) */',
                  '.btn-dark:focus-visible {',
                  '  outline: 2px solid #FFFFFF;',
                  '  outline-offset: 2px;',
                  '}',
                  '',
                  '/* ❌ 금지: outline 제거 (대체 없이) */',
                  '.btn-bad:focus { outline: none; }'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">',
                  '    <button type="button" style="padding:10px 16px;background:#622599;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;outline:2px solid #622599;outline-offset:3px;cursor:pointer">✅ 포커스 보임 (|Lc| 30+)</button>',
                  '    <button type="button" style="padding:10px 16px;background:#4D006E;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;outline:2px solid #FFFFFF;outline-offset:3px;cursor:pointer">✅ 다크 배경 → 흰 outline</button>',
                  '    <button type="button" style="padding:10px 16px;background:#fff;color:#4D006E;border:1px solid #4D006E;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;opacity:0.6">❌ 포커스 없음</button>',
                  '  </div>',
                  '  <div style="font-size:11px;color:#5a5048;margin-top:8px">Tab 키로 버튼을 순회할 때 각 버튼에 실제로 표시될 포커스 링을 상시 노출한 상태입니다.</div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Foundation',
                title: '색상 선택 6가지 원칙',
                summary: 'KMS가 기준으로 삼는 색 선택 규칙입니다. 새 색 추가·조합 검토 시 이 원칙부터 통과시킵니다. 하나라도 깨지면 색을 바꾸거나 용도를 재분류합니다.',
                meta: [
                  { label: '문서', values: ['KMS 3.4', 'CLAUDE.md 2 Site Color Palette'] },
                  { label: '검증', values: ['WebAIM Contrast Checker', 'DevTools Emulate vision deficiencies'] }
                ],
                code: [
                  '/* 1. 색상만으로 정보 전달 금지 → 색 + 아이콘 + 텍스트 */',
                  '/* 2. 파스텔 4색 텍스트 금지 → Blossom/Ember/River/Leaf는 장식 전용 */',
                  '/* 3. Fire Red·Ocean Blue 본문 금지 → 18px bold+ 헤딩·버튼·아이콘·테두리만 */',
                  '/* 4. 리터럴 HEX 금지 → var(--color-*) 로만 참조 */',
                  '/* 5. 포커스 인디케이터 필수 → 3:1 이상, focus-visible */',
                  '/* 6. 다크·고대비 모드 대응 → prefers-color-scheme, prefers-contrast */'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <ol style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;padding:0;margin:0;list-style:none;counter-reset:principle">',
                  '    <li style="counter-increment:principle;border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:12px 14px;background:#fff;position:relative;padding-left:44px">',
                  '      <span style="position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;background:#4D006E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">1</span>',
                  '      <strong style="display:block;color:#4D006E;font-size:13px;margin-bottom:4px">색상만으로 정보 전달 금지</strong>',
                  '      <span style="color:#5a5048;font-size:12px">색 + 아이콘 + 텍스트 3중 신호. 색각이상·그레이스케일에서도 구분.</span>',
                  '    </li>',
                  '    <li style="counter-increment:principle;border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:12px 14px;background:#fff;position:relative;padding-left:44px">',
                  '      <span style="position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;background:#4D006E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">2</span>',
                  '      <strong style="display:block;color:#4D006E;font-size:13px;margin-bottom:4px">파스텔 4색은 텍스트 금지</strong>',
                  '      <span style="color:#5a5048;font-size:12px">Blossom Pink, Ember Orange, River Blue, Leaf Green은 장식·배경 전용.</span>',
                  '    </li>',
                  '    <li style="counter-increment:principle;border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:12px 14px;background:#fff;position:relative;padding-left:44px">',
                  '      <span style="position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;background:#4D006E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">3</span>',
                  '      <strong style="display:block;color:#4D006E;font-size:13px;margin-bottom:4px">Fire Red·Ocean Blue 본문 금지</strong>',
                  '      <span style="color:#5a5048;font-size:12px">18px bold+ 헤딩·버튼 라벨·아이콘·테두리에만 사용.</span>',
                  '    </li>',
                  '    <li style="counter-increment:principle;border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:12px 14px;background:#fff;position:relative;padding-left:44px">',
                  '      <span style="position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;background:#4D006E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">4</span>',
                  '      <strong style="display:block;color:#4D006E;font-size:13px;margin-bottom:4px">리터럴 HEX 금지</strong>',
                  '      <span style="color:#5a5048;font-size:12px">모든 색은 <code style="font-size:11px">var(--color-*)</code> CSS 변수로만 참조.</span>',
                  '    </li>',
                  '    <li style="counter-increment:principle;border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:12px 14px;background:#fff;position:relative;padding-left:44px">',
                  '      <span style="position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;background:#4D006E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">5</span>',
                  '      <strong style="display:block;color:#4D006E;font-size:13px;margin-bottom:4px">포커스 인디케이터 필수</strong>',
                  '      <span style="color:#5a5048;font-size:12px">키보드 포커스는 배경 대비 |Lc| 30 이상(APCA). <code style="font-size:11px">:focus-visible</code> 우선.</span>',
                  '    </li>',
                  '    <li style="counter-increment:principle;border:1px solid rgba(31,31,31,0.12);border-radius:10px;padding:12px 14px;background:#fff;position:relative;padding-left:44px">',
                  '      <span style="position:absolute;left:12px;top:12px;width:24px;height:24px;border-radius:50%;background:#4D006E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">6</span>',
                  '      <strong style="display:block;color:#4D006E;font-size:13px;margin-bottom:4px">다크·고대비 모드 대응</strong>',
                  '      <span style="color:#5a5048;font-size:12px"><code style="font-size:11px">prefers-color-scheme</code>, <code style="font-size:11px">prefers-contrast</code>에서 명암비 유지.</span>',
                  '    </li>',
                  '  </ol>',
                  '</div>'
                ].join(''),
              }
            ]
          },
          {
            title: '03 · 모듈 계약서',
            note: '이제 모든 디자인은 섹션 설명이 아니라 모듈 계약으로 봅니다. 어떤 종류인지, 무엇을 쓰는지, 코드가 어떤지, 상태가 어떻게 변하는지가 한 카드 안에 있어야 합니다.',
            modules: [
              {
                kind: 'Module',
                title: '컴포넌트 모듈 기본 구조',
                summary: '재사용 가능한 디자인은 토큰, 구조, 상태 이름이 분리되어 있어야 합니다. 코드와 미리보기가 1:1로 대응돼야 수정이 쉬워집니다.',
                meta: [
                  { label: '필수 정보', values: ['kind', 'summary', 'tokens', 'code', 'preview'] },
                  { label: '상태', values: ['default', 'active', 'disabled', 'danger'] },
                  { label: '구현 파일', values: ['css/style.css', 'css/admin-v3.css', 'css/admin.css'] }
                ],
                code: [
                  '<article class="design-module">',
                  '  <header class="design-module-head">...</header>',
                  '  <div class="design-module-meta">토큰 / 클래스 / 상태</div>',
                  '  <pre class="design-module-code"><code>HTML snippet</code></pre>',
                  '  <div class="design-module-preview">실제 렌더</div>',
                  '</article>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-contract-card">',
                  '  <div class="kms-ds-contract-top">',
                  '    <span class="kms-ds-contract-kind">Module</span>',
                  '    <strong>Action Button Set</strong>',
                  '  </div>',
                  '  <div class="kms-ds-contract-meta">',
                  '    <span>토큰 4개</span><span>상태 3개</span><span>구조 2줄</span>',
                  '  </div>',
                  '  <div class="kms-ds-contract-bars">',
                  '    <span></span><span></span><span></span>',
                  '  </div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'State',
                title: '상태 모듈은 나란히 비교한다',
                summary: '버튼, 칩, 배지는 반드시 기본/활성/위험 상태가 한 화면에서 같이 보이도록 정리해야 상태 설계가 흔들리지 않습니다.',
                meta: [
                  { label: '대상', values: ['.write-btn', '.v3-btn', '.v3-more-btn', '.tag-pill'] },
                  { label: '검토 포인트', values: ['명도 대비', '터치 크기', '비활성 피드백'] }
                ],
                code: [
                  '<button class="write-btn">새 게시글 작성</button>',
                  '<button class="v3-btn v3-btn-primary">저장</button>',
                  '<button class="v3-more-btn">더보기 (2개)</button>',
                  '<button class="filter-btn active">전체</button>',
                  '<span class="tag-pill">잼버리</span>',
                  '<button class="btn-delete-soft visible">삭제</button>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="kms-ds-row"><button class="write-btn">새 게시글 작성</button><button class="cancel-btn visible">취소</button></div>',
                  '  <div class="kms-ds-row"><button class="filter-btn active">전체</button><button class="filter-btn">훈련</button><span class="tag-pill active">NEW</span><span class="tag-pill">Jamboree</span></div>',
                  '  <div class="kms-ds-row"><button class="btn-delete-soft visible">삭제</button></div>',
                  '</div>'
                ].join(''),
              }
            ]
          }
        ]
      },
      {
        title: 'COMPONENTS',
        sub: '실제 운영에서 자주 손대는 버튼, 칩, 카드, 폼 모듈입니다.',
        sections: [
          {
            title: '04 · 액션 컴포넌트',
            note: '행동을 만드는 UI는 크기와 우선순위가 바로 보여야 합니다. Primary / Secondary / Chip 계층이 섞이지 않도록 정리합니다.',
            modules: [
              {
                kind: 'Component',
                title: '버튼 패밀리',
                summary: '저장과 작성은 Primary, 취소는 Outline, 목록 토글은 Secondary, 필터는 Chip 레벨로 분리합니다. 공개와 관리자에서 기능이 겹치면 같은 위계와 상태를 유지하고 구현 파일만 분리합니다.',
                meta: [
                  { label: '높이 기준', values: ['44px primary', '36px secondary', '26px chip'] },
                  { label: '공개 클래스', values: ['.write-btn', '.submit-btn', '.cancel-btn', '.board-page-btn'] },
                  { label: '관리 클래스', values: ['.v3-btn', '.v3-more-btn', '.v3-page-btn', '.mkt-preset-btn'] },
                  { label: '구현 파일', values: ['css/style.css', 'css/admin-v3.css'] }
                ],
                code: [
                  '<div class="kms-action-row">',
                  '  <button class="write-btn">새 게시글 작성</button>',
                  '  <button class="submit-btn">저장하기</button>',
                  '  <button class="cancel-btn visible">취소</button>',
                  '  <button class="board-page-btn active">2</button>',
                  '  <button class="v3-btn v3-btn-primary">저장</button>',
                  '  <button class="v3-more-btn">더보기 (2개)</button>',
                  '  <button class="v3-page-btn active">2</button>',
                  '</div>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="kms-ds-row"><button class="write-btn">새 게시글 작성</button><button class="submit-btn">저장하기</button></div>',
                  '  <div class="kms-ds-row"><button class="cancel-btn visible">취소</button><button class="board-page-btn active">2</button><button class="board-page-btn">3</button></div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Component',
                title: '칩 & 배지 패밀리',
                summary: '카테고리, 태그, 상태, 대상 배지는 모두 작은 정보 단위지만 색과 상태 규칙은 명확히 분리해야 합니다.',
                meta: [
                  { label: '대표 클래스', values: ['.post-kicker', '.tag-pill', '.calendar-status-badge', '.calendar-target-chip'] },
                  { label: '사용 맥락', values: ['기사 카드', '검색 결과', '캘린더 상태', '대상 필터'] }
                ],
                code: [
                  '<span class="post-kicker tag-korea-kicker">한국스카우트</span>',
                  '<span class="tag-pill active">훈련</span>',
                  '<span class="calendar-status-badge is-upcoming">예정</span>',
                  '<span class="calendar-target-chip">지도자</span>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="kms-ds-row"><span class="post-kicker tag-korea-kicker">한국스카우트</span><span class="post-kicker tag-wosm-kicker">WOSM</span><span class="post-kicker post-kicker-new">NEW</span></div>',
                  '  <div class="kms-ds-row"><span class="tag-pill active">훈련</span><span class="tag-pill">잼버리</span><span class="calendar-status-badge is-upcoming">예정</span><span class="calendar-target-chip">지도자</span></div>',
                  '</div>'
                ].join(''),
              }
            ]
          },
          {
            title: '05 · 콘텐츠 표면',
            note: '정보량이 많은 카드와 폼은 시각적 밀도 조절이 중요합니다. 코드 블록은 가볍고, 미리보기는 실제 사용 맥락을 보여주도록 구성합니다.',
            modules: [
              {
                kind: 'Component',
                title: '게시글 카드',
                summary: '썸네일, 카테고리, 제목, 요약, 메타가 고정된 순서로 배치되어야 스캔 속도가 유지됩니다.',
                meta: [
                  { label: '대표 클래스', values: ['.post-card', '.post-card-thumb', '.post-card-body', '.post-card-meta'] },
                  { label: '레이아웃', values: ['16:9 thumb', '24px body padding', '1px border'] }
                ],
                code: [
                  '<article class="post-card">',
                  '  <img class="post-card-thumb" src="/img/logo.png" alt="">',
                  '  <div class="post-card-body">',
                  '    <div class="post-card-labels"><span class="post-kicker tag-korea-kicker">한국스카우트</span></div>',
                  '    <h3>세계잼버리 2026 한국 개최 확정</h3>',
                  '    <p class="post-card-excerpt">핵심 요약은 2~3줄 안으로 유지합니다.</p>',
                  '    <div class="post-card-meta">2026.04.04 · 조회 1,204</div>',
                  '  </div>',
                  '</article>'
                ].join('\n'),
                preview: [
                  '<article class="post-card kms-ds-card-preview">',
                  '  <img class="post-card-thumb" src="/img/logo.png" alt="BP미디어 로고" style="background:#f5f3ef;object-fit:contain;padding:14px;">',
                  '  <div class="post-card-body">',
                  '    <div class="post-card-labels"><span class="post-kicker tag-korea-kicker">한국스카우트</span><span class="post-kicker post-kicker-new">NEW</span></div>',
                  '    <h3>세계잼버리 2026 한국 개최 확정</h3>',
                  '    <p class="post-card-excerpt">핵심 요약은 두세 줄 안에서 읽히게 유지합니다.</p>',
                  '    <div class="post-card-meta">2026.04.04 · 조회 1,204</div>',
                  '  </div>',
                  '</article>'
                ].join(''),
              },
              {
                kind: 'Component',
                title: '관리자 폼 블록',
                summary: '폼은 라벨, 입력, 힌트가 한 덩어리로 보여야 하고 모바일에서도 터치 영역이 좁아지지 않아야 합니다.',
                meta: [
                  { label: '대표 클래스', values: ['.form-group', 'input', 'select', 'textarea'] },
                  { label: '검토 포인트', values: ['40px input height', '라벨 가독성', 'textarea 확장성'] }
                ],
                code: [
                  '<div class="form-group">',
                  '  <label>카테고리</label>',
                  '  <select><option>한국스카우트</option></select>',
                  '</div>',
                  '<div class="form-group">',
                  '  <label>본문 요약</label>',
                  '  <textarea></textarea>',
                  '</div>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-form-grid">',
                  '  <div class="form-group"><label>카테고리</label><select><option>한국스카우트</option><option>APR</option><option>WOSM</option></select></div>',
                  '  <div class="form-group"><label>게시일</label><input type="date"></div>',
                  '  <div class="form-group" style="grid-column:1 / -1;"><label>본문 요약</label><textarea placeholder="요약을 입력하세요"></textarea></div>',
                  '</div>'
                ].join(''),
              }
            ]
          }
        ]
      },
      {
        title: 'PATTERNS',
        sub: '여러 컴포넌트를 묶어서 실제 페이지 경험을 만드는 패턴입니다.',
        sections: [
          {
            title: '06 · 페이지 패턴',
            note: '헤더와 히어로, 섹션 레일은 한 개 컴포넌트보다 더 큰 구조입니다. 배치 규칙과 정보 우선순위를 같이 읽어야 합니다.',
            modules: [
              {
                kind: 'Pattern',
                title: '마스트헤드 + 히어로 조합',
                summary: '로고, 언어, 검색, 히어로 메시지가 한 화면에 모일 때도 정보 계층이 무너지지 않도록 간격과 폭을 관리합니다.',
                meta: [
                  { label: '대표 클래스', values: ['.masthead', '.nav', '.site-hero', '.hero-controls'] },
                  { label: '핵심 원칙', values: ['header는 가볍게', 'hero는 큰 메시지', 'CTA는 2개 이내'] },
                  { label: '접근성', values: ['dark surface는 고대비 텍스트', '보조 문구도 본문 대비 유지'] }
                ],
                code: [
                  '<header class="masthead">...</header>',
                  '<section class="site-hero site-hero-slide active">',
                  '  <div class="site-hero-content">',
                  '    <h2 class="site-hero-title">스카우트 운동의 소식을 기록합니다</h2>',
                  '    <p class="site-hero-sub">핵심 소개 문구는 짧고 명확하게 유지합니다.</p>',
                  '  </div>',
                  '</section>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-shell">',
                  '  <div class="kms-ds-shell-bar"><span>BP미디어</span><span>KOR · ENG</span><span>검색</span></div>',
                  '  <div class="kms-ds-shell-hero kms-ds-dark-surface">',
                  '    <span class="category-tag tag-korea">Korea</span>',
                  '    <strong>스카우트 운동의 소식을 기록합니다</strong>',
                  '    <p>큰 메시지와 짧은 설명, 그리고 1~2개의 CTA만 남깁니다.</p>',
                  '    <div class="kms-ds-row"><a class="home-subscribe-btn" href="#">기사 읽기</a><a class="home-subscribe-btn secondary" href="#">공유하기</a></div>',
                  '  </div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Pattern',
                title: '홈 섹션 레일',
                summary: '섹션 타이틀, 더보기 링크, 카드 그리드를 하나의 레일로 묶어 반복 사용하면 화면 전체의 리듬이 안정됩니다.',
                meta: [
                  { label: '대표 클래스', values: ['.home-section-title', '.home-col-header', '.home-lead-card'] },
                  { label: '레이아웃', values: ['lead + rail', '2col/3col 변형', '카테고리별 gradient'] }
                ],
                code: [
                  '<div class="home-section-title home-section-title-latest">',
                  '  <span>최신 소식</span>',
                  '  <a class="home-section-more" href="#">더보기 →</a>',
                  '</div>',
                  '<article class="home-lead-card">...</article>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="home-section-title home-section-title-latest"><span>최신 소식</span><a href="#" class="home-section-more">더보기 →</a><div class="rule"></div></div>',
                  '  <article class="home-lead-card kms-ds-rail-preview">',
                  '    <div class="home-lead-body">',
                  '      <div class="home-lead-copy">',
                  '        <div class="home-lead-labels"><span class="category-tag tag-wosm">WOSM</span><span class="home-lead-kicker">메인 스토리</span></div>',
                  '        <h3><a class="home-lead-link" href="#">세계 스카우트 총회 주요 결론 정리</a></h3>',
                  '        <p class="home-lead-excerpt">메인 카드와 서브 레일의 밀도를 분리해 읽기 우선순위를 만듭니다.</p>',
                  '      </div>',
                  '    </div>',
                  '  </article>',
                  '</div>'
                ].join(''),
              }
            ]
          },
          {
            title: '07 · 피드백 패턴',
            note: '로딩, 빈 상태, 토스트는 작아 보이지만 운영 품질에 직접 연결됩니다. 별도 패턴으로 분리해 보여주는 편이 안전합니다.',
            modules: [
              {
                kind: 'Pattern',
                title: '로딩 / 빈 상태 / 알림',
                summary: '데이터가 없거나 기다리는 순간에도 사용자가 길을 잃지 않도록 최소한의 피드백 모듈을 묶어서 검토합니다.',
                meta: [
                  { label: '대표 클래스', values: ['.loading-state', '.mini-empty', '.list-empty', '.toast'] },
                  { label: '검토 포인트', values: ['문구 길이', '가독성', '모바일 하단 노출'] }
                ],
                code: [
                  '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>',
                  '<div class="mini-empty">게시글이 없습니다</div>',
                  '<div class="toast show success">저장되었습니다</div>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-feedback-grid">',
                  '  <div class="kms-ds-feedback-card"><div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div><small>Loading</small></div>',
                  '  <div class="kms-ds-feedback-card"><div class="mini-empty">게시글이 없습니다</div><small>Empty</small></div>',
                  '  <div class="kms-ds-feedback-card"><div class="kms-ds-toast-demo kms-ds-dark-surface is-success">저장되었습니다</div><small>Toast</small></div>',
                  '</div>'
                ].join(''),
              }
            ]
          }
        ]
      },
      {
        title: 'RESPONSIVE',
        sub: '같은 디자인을 PC와 모바일 모두에서 편하게 보이게 하는 최종 규칙입니다.',
        sections: [
          {
            title: '08 · 반응형 블루프린트',
            note: '새 모듈을 추가할 때는 데스크톱 완성 후 모바일을 붙이는 방식이 아니라, 처음부터 두 환경에서 어떻게 접히는지 같이 설계합니다.',
            modules: [
              {
                kind: 'Responsive',
                title: '데스크톱 2패널 → 모바일 1열',
                summary: '이 KMS 디자인 탭 자체도 같은 원칙을 따릅니다. 데스크톱에서는 코드와 미리보기를 좌우로, 모바일에서는 위아래로 쌓습니다.',
                meta: [
                  { label: '데스크톱', values: ['code | preview split', 'wider reading lane', 'section rail'] },
                  { label: '모바일', values: ['single column', 'preview first scan', 'comfortable touch gap'] }
                ],
                code: [
                  '.kms-ds-module-stage {',
                  '  display: grid;',
                  '  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);',
                  '}',
                  '@media (max-width: 900px) {',
                  '  .kms-ds-module-stage { grid-template-columns: 1fr; }',
                  '}'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-device-grid">',
                  '  <div class="kms-ds-device-card"><span>Desktop</span><div class="kms-ds-device-frame kms-ds-device-frame-desktop"><div></div><div></div></div></div>',
                  '  <div class="kms-ds-device-card"><span>Mobile</span><div class="kms-ds-device-frame kms-ds-device-frame-mobile"><div></div><div></div><div></div></div></div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Responsive',
                title: '터치 친화 프리뷰 캔버스',
                summary: '모바일에서는 코드보다 미리보기를 먼저 훑게 되므로, 프리뷰 영역은 좁아져도 숨지 않고 터치 대상 간격이 유지되어야 합니다.',
                meta: [
                  { label: '기준', values: ['320px safe width', 'wrap allowed', '12~16px touch gaps'] },
                  { label: '주의', values: ['wide tables 금지', 'hidden code 금지', '미리보기 clipping 금지'] }
                ],
                code: [
                  '.kms-ds-preview-canvas {',
                  '  min-height: 220px;',
                  '  overflow: auto;',
                  '  padding: 18px;',
                  '}',
                  '.kms-ds-row { flex-wrap: wrap; gap: 10px; }'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-touch-stack">',
                  '  <div class="kms-ds-row"><button class="filter-btn active">전체</button><button class="filter-btn">훈련</button><button class="filter-btn">교육</button></div>',
                  '  <div class="kms-ds-row"><a class="home-subscribe-btn" href="#">RSS 구독</a><a class="home-subscribe-btn secondary" href="#">사이트 검색</a></div>',
                  '  <div class="kms-ds-mobile-note">좁은 화면에서도 버튼이 겹치지 않고 자연스럽게 줄바꿈되어야 합니다.</div>',
                  '</div>'
                ].join(''),
              }
            ]
          },
          {
            title: '09 · 데이터 시각화 (관계도·차트)',
            note: '태그 관계도 / 마케팅 funnel / Leaflet 지도처럼 SVG·Canvas API에 hex 문자열이 직접 전달되는 시각화는 CSS var()를 해석하지 못합니다. 이 섹션은 KMS 브랜드 팔레트를 그대로 유지하면서 예외를 구조적으로 관리하는 규약입니다.',
            modules: [
              {
                kind: 'Pattern',
                title: '노드 색 = KMS 브랜드 10색 hex (SVG 예외)',
                summary: '태그 관계도·마케팅 scatter·Leaflet 지도 polygon은 SVG presentation attribute 또는 JS data 구조에 색을 직접 주입합니다. CSS var()를 해석하지 못하므로 브랜드 토큰의 값(#622599 등)을 hex 리터럴로 복사해 사용하고, 주석으로 어느 토큰과 같은 값인지 명시합니다.',
                meta: [
                  { label: 'KMS 규칙', values: ['3.4 리터럴 HEX 금지', '3.10 gradient 중간 stop 예외', '3.12 태그 관계도 예외'] },
                  { label: '적용 파일', values: ['js/admin-v3.js _mountTagInsightsGraph PALETTE', '_getGeoRegionTone (Leaflet)', '_marketingStageColor (scatter)'] }
                ],
                code: [
                  '// functions/_shared/tag-insights.js + admin-v3.js 공통 규약',
                  '// SVG fill은 CSS var() 해석 불가 → hex 문자열 유지, --gw-* 토큰 값과 동일.',
                  'var PALETTE = [',
                  "  '#622599', // scouting-purple",
                  "  '#4d006e', // midnight-purple",
                  "  '#248737', // forest-green",
                  "  '#0094b4', // ocean-blue",
                  "  '#ff5655', // fire-red",
                  "  '#ff8dff', // blossom-pink",
                  "  '#ffae80', // ember-orange",
                  "  '#82e6de', // river-blue",
                  "  '#9fed8f', // leaf-green",
                  "  '#3f3f3f', // gray-700 fallback",
                  '];',
                  '// 노드 <circle fill="..."> 속성으로 직접 삽입.'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="kms-ds-row" style="gap:6px">',
                  '    <span class="kms-ds-token-chip" style="background:#622599;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#4d006e;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#248737;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#0094b4;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#ff5655;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#ff8dff;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#ffae80;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#82e6de;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#9fed8f;width:28px;height:28px"></span>',
                  '    <span class="kms-ds-token-chip" style="background:#3f3f3f;width:28px;height:28px"></span>',
                  '  </div>',
                  '  <div style="font-size:12px;color:#5a5048;margin-top:8px">브랜드 10색 hex 문자열(각 ` --gw-* ` 토큰 값 동일). 그 이상 카테고리는 palette[i % 10]로 반복.</div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Pattern',
                title: '연결선 = count 기반 흑백 연속 그라데이션',
                summary: '관계 강도(count/maxLinkCount)를 darkness로 표현. 약한 연결 = 밝은 회색(#C4C4C4 = --gray-300), 강한 연결 = --ink(#1F1F1F) 검정. 비선형(power 0.55)으로 중간 구간 대비 강조. 가장 약한 연결(하위 15% 또는 count=1)은 점선(stroke-dasharray="4 3").',
                meta: [
                  { label: '색 함수', values: ['v = 196 - (196-31) × r^0.55', 'opacity = 0.35 + r^0.55 × 0.45'] },
                  { label: '굵기 함수', values: ['0.6 + r^0.55 × 5 (0.6~5.6px)'] },
                  { label: '점선 기준', values: ['count ≤ percentile(counts, 0.15)', 'stroke-dasharray="4 3"'] }
                ],
                code: [
                  'function linkStroke(count) {',
                  '  var r = Math.max(0, Math.min(1, count / maxLinkCount));',
                  '  var v = Math.round(196 - (196 - 31) * Math.pow(r, 0.55));',
                  "  return 'rgb(' + v + ',' + v + ',' + v + ')';",
                  '}',
                  'function linkWidth(count) {',
                  '  var r = count / maxLinkCount;',
                  "  return (0.6 + Math.pow(r, 0.55) * 5).toFixed(2);",
                  '}',
                  '// weak tier는 추가로 stroke-dasharray="4 3"'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <svg viewBox="0 0 360 80" style="width:100%;height:80px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">',
                  '    <line x1="20" y1="40" x2="100" y2="40" stroke="rgb(196,196,196)" stroke-width="0.8" stroke-opacity="0.4" stroke-dasharray="4 3"/>',
                  '    <line x1="120" y1="40" x2="200" y2="40" stroke="rgb(140,140,140)" stroke-width="2" stroke-opacity="0.6"/>',
                  '    <line x1="220" y1="40" x2="340" y2="40" stroke="rgb(40,40,40)" stroke-width="5" stroke-opacity="0.8"/>',
                  '    <text x="60" y="20" text-anchor="middle" font-size="11" fill="#64748b">약 (점선)</text>',
                  '    <text x="160" y="20" text-anchor="middle" font-size="11" fill="#64748b">중</text>',
                  '    <text x="280" y="20" text-anchor="middle" font-size="11" fill="#64748b">강</text>',
                  '  </svg>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Pattern',
                title: '라벨 halo (배경 무관 가독성)',
                summary: '관계도·차트의 텍스트 라벨은 배경 색이 다양(흰/회색/브랜드)해서 대비가 깨지기 쉽습니다. paint-order로 stroke를 먼저 칠하고 그 위에 fill을 덮어 흰 halo 경계를 만들면 어떤 배경에서도 가독성이 확보됩니다.',
                meta: [
                  { label: '핵심 속성', values: ['paint-order: stroke fill', 'stroke: --v3-surface (white)', 'stroke-width: 3'] },
                  { label: '적용', values: ['.v3-ti-graph-label', '차트·지도 범례 전반'] }
                ],
                code: [
                  '.v3-ti-graph-label {',
                  '  font-size: var(--fs-meta);',
                  '  font-weight: 600;',
                  '  fill: var(--v3-text);',
                  '  stroke: var(--v3-surface);',
                  '  stroke-width: 3;',
                  '  paint-order: stroke fill;',
                  '  pointer-events: none;',
                  '}'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack" style="background:linear-gradient(90deg,#fff,#622599);padding:16px;border-radius:8px">',
                  '  <svg viewBox="0 0 240 60" style="width:100%;height:60px">',
                  '    <text x="60" y="35" text-anchor="middle" fill="#1f1f1f" stroke="#fff" stroke-width="3" paint-order="stroke fill" font-size="14" font-weight="700">세계스카우트연맹</text>',
                  '    <text x="180" y="35" text-anchor="middle" fill="#1f1f1f" stroke="#fff" stroke-width="3" paint-order="stroke fill" font-size="14" font-weight="700">청소년교육</text>',
                  '  </svg>',
                  '  <div style="font-size:11px;color:#fff;margin-top:6px">흰→보라 그라데이션 배경에서도 텍스트가 또렷</div>',
                  '</div>'
                ].join(''),
              },
              {
                kind: 'Pattern',
                title: '라벨 티어링 (primary 항상 / secondary on hover)',
                summary: '80개 노드 전체에 라벨을 표시하면 겹쳐서 읽을 수 없습니다. 상위 25개(primary)만 항상 보이고 나머지(secondary)는 hover 또는 검색 spotlight 시에만 opacity로 등장시킵니다.',
                meta: [
                  { label: '데스크톱', values: ['노드 80개', 'primary 라벨 25개'] },
                  { label: '모바일 (≤700px)', values: ['노드 50개', 'primary 라벨 15개', '라벨 폰트 키움'] }
                ],
                code: [
                  '/* 상위 25개만 항상 표시 */',
                  '.v3-ti-graph-node.is-primary .v3-ti-graph-label { opacity: 1; }',
                  '.v3-ti-graph-node.is-secondary .v3-ti-graph-label { opacity: 0; transition: opacity .15s; }',
                  '/* hover focus = 노드 + 이웃 라벨 노출 */',
                  '.v3-ti-graph-node.is-focused .v3-ti-graph-label,',
                  '.v3-ti-graph-node.is-neighbor .v3-ti-graph-label { opacity: 1; font-weight: 700; }',
                  '/* 비이웃 dim */',
                  '.v3-ti-graph-nodes.is-focusing .v3-ti-graph-node.is-dimmed { opacity: 0.2; }'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div style="display:flex;gap:16px;align-items:center">',
                  '    <span style="display:inline-block;width:36px;height:36px;border-radius:999px;background:#622599"></span>',
                  '    <span style="font-weight:700;font-size:13px">스카우트</span>',
                  '    <span style="color:#94a3b8;font-size:11px">primary (항상)</span>',
                  '  </div>',
                  '  <div style="display:flex;gap:16px;align-items:center;margin-top:8px">',
                  '    <span style="display:inline-block;width:22px;height:22px;border-radius:999px;background:#0094b4;opacity:0.85"></span>',
                  '    <span style="color:#94a3b8;font-size:12px">(라벨 숨김)</span>',
                  '    <span style="color:#94a3b8;font-size:11px">secondary (hover 시 노출)</span>',
                  '  </div>',
                  '</div>'
                ].join(''),
              }
            ]
          }
        ]
      }
    ];

    bodyEl.innerHTML = renderDesignOverview(overview) + layers.map(renderDesignLayer).join('');
    initDesignSystemInteractions(bodyEl);
  }

  function renderDesignOverview(overview) {
    return '<section class="kms-ds-overview">' +
      '<div class="kms-ds-overview-grid">' +
        '<div class="kms-ds-overview-block">' +
          '<span class="kms-ds-overview-kicker">Design Types</span>' +
          '<h3>디자인 종류를 먼저 구분합니다</h3>' +
          '<div class="kms-ds-kind-grid">' +
            overview.kinds.map(function (kind) {
              return '<article class="kms-ds-kind-card"><strong>' + GW.escapeHtml(kind.title) + '</strong><p>' + GW.escapeHtml(kind.desc) + '</p></article>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="kms-ds-overview-block">' +
          '<span class="kms-ds-overview-kicker">Module Rules</span>' +
          '<h3>모든 카드는 코드와 프리뷰를 같이 보여줍니다</h3>' +
          '<div class="kms-ds-guidance-grid">' +
            overview.rules.map(function (rule) {
              return '<article class="kms-ds-guidance-card"><strong>' + GW.escapeHtml(rule.title) + '</strong><p>' + GW.escapeHtml(rule.desc) + '</p></article>';
            }).join('') +
          '</div>' +
          '<div class="kms-ds-breakpoint-row">' +
            overview.breakpoints.map(function (bp) {
              return '<span class="kms-ds-bp-badge">' + GW.escapeHtml(bp) + '</span>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderDesignLayer(layer) {
    return '<div class="kms-ds-layer-header"><strong>' + GW.escapeHtml(layer.title) + '</strong><span>' + GW.escapeHtml(layer.sub) + '</span></div>' +
      layer.sections.map(renderDesignSection).join('');
  }

  function renderDesignSection(section) {
    var secId = 'kms-ds-' + slugify(section.title);
    return '<section class="kms-ds-section" id="' + GW.escapeHtml(secId) + '">' +
      '<div class="kms-ds-section-head">' +
        '<h3 class="kms-ds-section-title">' + GW.escapeHtml(section.title) + '</h3>' +
        (section.note ? '<p class="kms-ds-note kms-ds-note-top">' + GW.escapeHtml(section.note) + '</p>' : '') +
      '</div>' +
      '<div class="kms-ds-module-grid">' + section.modules.map(renderDesignModule).join('') + '</div>' +
      '</section>';
  }

  function renderDesignModule(module) {
    var runtimeSource = getDesignRuntimeSource(module);
    var moduleId = 'kms-ds-m-' + slugify(module.title);
    return '<article class="kms-ds-module" id="' + GW.escapeHtml(moduleId) + '" data-kms-ds-view="preview">' +
      '<div class="kms-ds-module-head">' +
        '<div class="kms-ds-module-title-block">' +
          '<span class="kms-ds-module-kicker">' + GW.escapeHtml(module.kind) + '</span>' +
          '<h4 class="kms-ds-module-title">' + GW.escapeHtml(module.title) + '</h4>' +
        '</div>' +
      '</div>' +
      '<p class="kms-ds-module-summary">' + GW.escapeHtml(module.summary) + '</p>' +
      '<div class="kms-ds-module-meta">' + renderDesignMeta(module.meta) + '</div>' +
      '<div class="kms-ds-module-display">' +
        '<span class="kms-ds-display-label">버튼 보기</span>' +
        '<div class="kms-ds-module-switch" role="tablist" aria-label="디자인 모듈 보기 전환">' +
          '<button type="button" class="kms-ds-view-btn is-active" data-kms-ds-view-btn="preview" aria-pressed="true">미리보기</button>' +
          '<button type="button" class="kms-ds-view-btn" data-kms-ds-view-btn="code" aria-pressed="false">코드</button>' +
        '</div>' +
      '</div>' +
      '<div class="kms-ds-module-stage kms-ds-surface-card">' +
        '<div class="kms-ds-module-pane kms-ds-module-pane-code" data-kms-ds-pane="code">' +
          '<span class="kms-ds-pane-label">코드</span>' +
          '<p class="kms-ds-editor-hint">여기서 코드의 텍스트나 클래스 한두 개를 직접 바꾼 뒤 미리보기로 바로 확인할 수 있습니다.</p>' +
          '<textarea class="kms-ds-code-editor" data-kms-ds-code-editor spellcheck="false">' + escapeHtmlForTextarea(runtimeSource) + '</textarea>' +
          '<div class="kms-ds-editor-actions">' +
            '<button type="button" class="kms-ds-editor-btn kms-ds-editor-btn-primary" data-kms-ds-editor-action="preview">미리보기 반영</button>' +
            '<button type="button" class="kms-ds-editor-btn" data-kms-ds-editor-action="reset">원본으로</button>' +
          '</div>' +
        '</div>' +
        '<div class="kms-ds-module-pane kms-ds-module-pane-preview" data-kms-ds-pane="preview">' +
          '<span class="kms-ds-pane-label">코드 혹은 미리보기 내용</span>' +
          '<div class="kms-ds-preview-canvas" data-kms-ds-preview-canvas>' + runtimeSource + '</div>' +
          '<template data-kms-ds-preview-template>' + runtimeSource + '</template>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function initDesignSystemInteractions(root) {
    if (!root || root.dataset.kmsDsBound === '1') return;
    root.dataset.kmsDsBound = '1';
    root.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-kms-ds-view-btn]') : null;
      if (!btn) {
        var actionBtn = event.target && event.target.closest ? event.target.closest('[data-kms-ds-editor-action]') : null;
        if (!actionBtn) return;
        var actionModule = actionBtn.closest('.kms-ds-module');
        if (!actionModule) return;
        handleDesignEditorAction(actionModule, actionBtn.getAttribute('data-kms-ds-editor-action'));
        return;
      }
      var moduleEl = btn.closest('.kms-ds-module');
      if (!moduleEl) return;
      var nextView = btn.getAttribute('data-kms-ds-view-btn');
      if (nextView !== 'code' && nextView !== 'preview') return;
      if (nextView === 'preview') hydrateDesignPreview(moduleEl);
      moduleEl.setAttribute('data-kms-ds-view', nextView);
      moduleEl.querySelectorAll('[data-kms-ds-view-btn]').forEach(function (item) {
        var active = item.getAttribute('data-kms-ds-view-btn') === nextView;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  }

  function hydrateDesignPreview(moduleEl) {
    if (!moduleEl) return;
    var canvas = moduleEl.querySelector('[data-kms-ds-preview-canvas]');
    var editor = moduleEl.querySelector('[data-kms-ds-code-editor]');
    var template = moduleEl.querySelector('[data-kms-ds-preview-template]');
    if (!canvas) return;
    var source = editor ? editor.value : '';
    if (!source && template) source = template.innerHTML;
    canvas.innerHTML = source;
    moduleEl.dataset.kmsDsHydrated = '1';
  }

  function handleDesignEditorAction(moduleEl, action) {
    if (!moduleEl) return;
    var editor = moduleEl.querySelector('[data-kms-ds-code-editor]');
    var template = moduleEl.querySelector('[data-kms-ds-preview-template]');
    if (!editor || !template) return;

    if (action === 'reset') {
      editor.value = template.innerHTML;
      if (moduleEl.getAttribute('data-kms-ds-view') === 'preview') hydrateDesignPreview(moduleEl);
      return;
    }

    if (action === 'preview') {
      hydrateDesignPreview(moduleEl);
      moduleEl.setAttribute('data-kms-ds-view', 'preview');
      moduleEl.querySelectorAll('[data-kms-ds-view-btn]').forEach(function (item) {
        var active = item.getAttribute('data-kms-ds-view-btn') === 'preview';
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function renderDesignMeta(groups) {
    if (!Array.isArray(groups) || !groups.length) return '';
    return groups.map(function (group) {
      return '<div class="kms-ds-meta-group">' +
        '<span class="kms-ds-meta-label">' + GW.escapeHtml(group.label || '') + '</span>' +
        '<div class="kms-ds-meta-pills">' +
          (Array.isArray(group.values) ? group.values : []).map(function (value) {
            return '<span class="kms-ds-meta-pill">' + GW.escapeHtml(String(value || '')) + '</span>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── 유틸리티 ──────────────────────────────────────────────────
  function slugify(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }

  function getDesignRuntimeSource(module) {
    return String((module && (module.renderCode || module.preview || module.code)) || '');
  }

  function escapeHtmlForTextarea(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

})();
