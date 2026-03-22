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
      desc: 'JWT 토큰 발급 및 세션 검증. 모든 관리자 전용 요청에 토큰이 필요합니다.',
      endpoints: [
        {
          method: 'POST', path: '/api/admin/login', auth: false,
          summary: '관리자 비밀번호로 JWT 토큰 발급',
          request: '{ "password": "string" }',
          response: '{ "token": "string", "role": "full" }',
          notes: '토큰 유효기간 24시간. 이후 요청에 Authorization: Bearer <token> 헤더 포함 필요.',
        },
        {
          method: 'GET', path: '/api/admin/session', auth: 'optional',
          summary: '현재 토큰 유효성 및 역할 반환',
          response: '{ "authenticated": true, "role": "full" }',
          notes: '토큰 없이 요청하면 authenticated: false 반환. 로그인 상태 확인에 사용.',
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
            { name: 'tag', desc: '글머리 태그 필터' },
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
          summary: '관리자 종합 분석 대시보드',
          response: '{ "daily": [], "top_posts": [], "total_visits": number, "avg_duration": number }',
        },
        {
          method: 'GET', path: '/api/admin/marketing', auth: true,
          summary: '마케팅 · 유입 채널 분석',
          response: '{ "funnel": [], "utm_campaigns": [], "referrers": [] }',
        },
      ],
    },
    {
      id: 'admin',
      label: '관리자 전용 (Admin)',
      desc: 'Changelog 조회, 프리뷰·배포 스냅샷 관리.',
      endpoints: [
        {
          method: 'GET', path: '/api/admin/changelog', auth: true,
          summary: '버전기록 조회',
          response: '{ "items": ChangelogItem[] }',
          notes: 'ChangelogItem: { version, date, summary, type, scope, items[] }. scope: site | admin | both',
        },
        {
          method: 'GET', path: '/api/preview/history', auth: true,
          summary: '배포 스냅샷 이력',
          response: '{ "releases": Release[] }',
        },
        {
          method: 'POST', path: '/api/preview/promote', auth: true,
          summary: '프리뷰 → 프로덕션 반영',
          request: '{ "version": "00.101.00" }',
          response: '{ "ok": true }',
        },
        {
          method: 'POST', path: '/api/preview/release', auth: true,
          summary: '현재 상태를 릴리스 스냅샷으로 저장',
          request: '{ "label": "v00.101.00", "notes": "KMS 재설계" }',
          response: '{ "release_id": "abc123" }',
        },
        {
          method: 'POST', path: '/api/preview/rollback', auth: true,
          summary: '이전 릴리스로 롤백',
          request: '{ "release_id": "abc123" }',
          response: '{ "ok": true }',
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
    var pw = String((document.getElementById('kms-pw-input') || {}).value || '').trim();
    var errEl = document.getElementById('kms-login-error');
    var btn = document.getElementById('kms-login-btn');
    if (!pw) { showLoginError('비밀번호를 입력해주세요.'); return; }
    btn.disabled = true;
    btn.textContent = '확인 중…';
    hideLoginError();
    GW.apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw }) })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
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
    setTab('docs');
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

    // Changelog 범위 필터
    document.querySelectorAll('[data-cl-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _state.changelogScope = btn.getAttribute('data-cl-scope') || 'all';
        document.querySelectorAll('[data-cl-scope]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderChangelog(_state.changelogItems, _state.changelogScope);
      });
    });
  }

  // ── 탭 시스템 ─────────────────────────────────────────────────
  function setTab(tab) {
    _state.tab = tab;
    var panels = ['docs', 'api', 'changelog', 'design'];
    panels.forEach(function (id) {
      var panel = document.getElementById('kms-tab-' + id);
      if (panel) panel.hidden = id !== tab;
    });
    document.querySelectorAll('[data-kms-tab]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-kms-tab') === tab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    // 모드 스위치 / 저장 버튼: 기능정의서 탭에서만 표시
    var modeSwitchEl = document.getElementById('kms-mode-switch');
    var saveBtn = document.getElementById('kms-save-btn');
    var showEdit = tab === 'docs';
    if (modeSwitchEl) modeSwitchEl.style.display = showEdit ? '' : 'none';
    if (saveBtn) saveBtn.style.display = showEdit ? '' : 'none';
    // 탭 전환 시 사이드바 섹션 목록을 해당 탭에 맞게 업데이트
    if (tab === 'api') renderApiSectionList();
    else if (tab === 'changelog') clearSectionList();
    else if (tab === 'design') { clearSectionList(); renderDesignSystem(); }
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
        var content = data && typeof data.content === 'string' ? data.content : '';
        _state.docContent = content;
        var editorInput = document.getElementById('kms-editor-input');
        if (editorInput) editorInput.value = content;
        renderDocument(content);
        renderSectionList(content);
        updateDocMeta(content);
      })
      .catch(function (err) {
        if (body) body.innerHTML = '<div class="kms-list-empty">' + GW.escapeHtml(err.message || '기능 정의서를 불러오지 못했습니다.') + '</div>';
        if (list) list.innerHTML = '<div class="kms-list-empty">목차를 불러오지 못했습니다.</div>';
      });
  }

  function saveDefinition() {
    if (_state.saveBusy) return;
    var editorInput = document.getElementById('kms-editor-input');
    var content = String(editorInput && editorInput.value || '').trim();
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
    preview.innerHTML = parts.map(function (part, index) {
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
  }

  function renderKmsText(text, idBuilder) {
    var lines = String(text || '').split('\n');
    var html = [];
    var inList = false;
    lines.forEach(function (line) {
      var raw = line.trim();
      if (!raw) {
        if (inList) { html.push('</ul>'); inList = false; }
        return;
      }
      // Frontmatter skip (Obsidian 호환)
      if (raw === '---') return;
      if (/^####\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var t = raw.replace(/^####\s+/, '');
        html.push('<h5 id="' + GW.escapeHtml(idBuilder(t)) + '" class="kms-h5">' + formatInline(t) + '</h5>');
        return;
      }
      if (/^###\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var t = raw.replace(/^###\s+/, '');
        html.push('<h4 id="' + GW.escapeHtml(idBuilder(t)) + '" class="kms-h4">' + formatInline(t) + '</h4>');
        return;
      }
      if (/^##\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var t = raw.replace(/^##\s+/, '');
        html.push('<h3 id="' + GW.escapeHtml(idBuilder(t)) + '" class="kms-h3">' + formatInline(t) + '</h3>');
        return;
      }
      if (/^#\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2 class="kms-h2">' + formatInline(raw.replace(/^#\s+/, '')) + '</h2>');
        return;
      }
      if (/^-\s+/.test(raw)) {
        if (!inList) { html.push('<ul class="kms-list">'); inList = true; }
        html.push('<li>' + formatInline(raw.replace(/^-\s+/, '')) + '</li>');
        return;
      }
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<p class="kms-p">' + formatInline(raw) + '</p>');
    });
    if (inList) html.push('</ul>');
    return html.join('');
  }

  function formatInline(text) {
    var escaped = GW.escapeHtml(String(text || ''));
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
    list.innerHTML = filtered.map(function (s) {
      var indent = s.level === 2 ? '' : s.level === 3 ? 'kms-tree-sub' : 'kms-tree-sub2';
      var label = s.level === 2 ? '대목차' : s.level === 3 ? '소목차' : '세부';
      var titleHtml = highlightQ ? highlightText(GW.escapeHtml(s.title), highlightQ) : GW.escapeHtml(s.title);
      return '<button type="button" class="kms-section-link ' + indent + '" data-kms-target="' + GW.escapeHtml(s.id) + '">' +
        '<span class="kms-section-label">' + label + '</span>' +
        '<span class="kms-section-title">' + titleHtml + '</span>' +
        '</button>';
    }).join('');
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

  function renderApiSectionList() {
    var list = document.getElementById('kms-section-list');
    if (!list) return;
    list.innerHTML = API_GROUPS.map(function (group) {
      return '<button type="button" class="kms-section-link" data-kms-target="kms-api-' + group.id + '">' +
        '<span class="kms-section-label">그룹</span>' +
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

  function clearSectionList() {
    var list = document.getElementById('kms-section-list');
    if (list) list.innerHTML = '<div class="kms-list-empty">버전기록 탭에서는 목차가 제공되지 않습니다.</div>';
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
  }

  function updateVersionDisplay() {
    var siteVer = 'V' + (GW.APP_VERSION || '—');
    var adminVer = 'V' + (GW.ADMIN_VERSION || '—');
    document.querySelectorAll('.site-build-version').forEach(function (el) { el.textContent = siteVer; });
    document.querySelectorAll('.admin-build-version').forEach(function (el) { el.textContent = adminVer; });
    setText('kms-ver-site', siteVer);
    setText('kms-build-version', siteVer);
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
          var s = String(item.scope || 'site');
          if (scope === 'both') return s === 'both';
          if (scope === 'site') return s === 'site' || s === 'both';
          if (scope === 'admin') return s === 'admin' || s === 'both';
          return true;
        });

    if (!filtered.length) {
      container.innerHTML = '<div class="kms-list-empty">선택한 범위의 버전기록이 없습니다.</div>';
      return;
    }

    var typeColors = { Update: '#0069d9', Bugfix: '#cb2431', Feature: '#22863a', Refactor: '#6f42c1' };
    var scopeLabels = { site: 'Site', admin: 'Admin', both: 'Site + Admin' };

    container.innerHTML = filtered.map(function (item) {
      var typeColor = typeColors[item.type] || '#555';
      var scopeLabel = scopeLabels[item.scope] || String(item.scope || 'Site');
      var changesList = (Array.isArray(item.items) ? item.items : Array.isArray(item.changes) ? item.changes : []);
      var changesHtml = changesList.length
        ? '<ul class="kms-cl-changes">' + changesList.map(function (c) {
            return '<li>' + GW.escapeHtml(String(c || '')) + '</li>';
          }).join('') + '</ul>'
        : '';

      return '<article class="kms-cl-item">' +
        '<div class="kms-cl-item-head">' +
          '<div class="kms-cl-item-version">' +
            '<span class="kms-cl-ver">v' + GW.escapeHtml(String(item.version || '')) + '</span>' +
            '<span class="kms-cl-type" style="background:' + typeColor + '">' + GW.escapeHtml(String(item.type || '')) + '</span>' +
            '<span class="kms-cl-scope">' + GW.escapeHtml(scopeLabel) + '</span>' +
          '</div>' +
          '<span class="kms-cl-date">' + GW.escapeHtml(String(item.date || '')) + '</span>' +
        '</div>' +
        '<p class="kms-cl-summary">' + GW.escapeHtml(String(item.summary || '')) + '</p>' +
        changesHtml +
        '</article>';
    }).join('');
  }

  // ── 디자인 시스템 탭 ──────────────────────────────────────────
  // 실제 홈페이지 style.css 기준으로 현행화 (2026-03-22)
  // 버튼은 카테고리 칩과 동일한 기본 형태: 1px 테두리, 직각, uppercase, letter-spacing
  function renderDesignSystem() {
    var container = document.getElementById('kms-tab-design');
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';

    var S = {
      // 실제 :root 변수값
      purple:  '#622599',
      purpleMid: '#4d006e',
      black:   '#1f1f1f',
      white:   '#ffffff',
      muted:   'rgba(31,31,31,0.58)',
      border:  'rgba(31,31,31,0.12)',
      bg:      '#ffffff',
      // 지역별 카테고리 색상 (style.css 기준)
      kor:  '#0094b4',
      apr:  '#ff5655',
      wosm: '#248737',
      people: '#622599',
      eur:  '#2f8f5b',
      afr:  '#b6761b',
      arb:  '#7b5cff',
      iar:  '#d44f94',
      success: '#248737',
      danger:  '#ff5655',
    };

    // ── 버튼 공통 베이스 스타일 (칩과 동일 원칙: 직각, 1px 테두리, uppercase)
    // Primary: 44px (--btn-height-primary) / Secondary: 36px (--btn-height-secondary)
    var btnBase    = 'display:inline-flex;align-items:center;justify-content:center;font-family:AliceDigitalLearning,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;border:1px solid;cursor:pointer;padding:0 18px;min-height:44px;';
    var btnSec     = 'display:inline-flex;align-items:center;justify-content:center;font-family:AliceDigitalLearning,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;border:1px solid;cursor:pointer;padding:0 12px;min-height:36px;';
    var btnFilled  = btnBase + 'background:' + S.black + ';color:#fff;border-color:' + S.black + ';';
    var btnAccent  = btnBase + 'background:' + S.purple + ';color:#fff;border-color:' + S.purple + ';';
    var btnOutline = btnBase + 'background:transparent;color:' + S.black + ';border-color:rgba(31,31,31,0.25);';
    var btnDanger  = btnBase + 'background:transparent;color:' + S.danger + ';border-color:' + S.danger + ';';
    var btnDisabled = btnBase + 'background:' + S.black + ';color:#fff;border-color:' + S.black + ';opacity:0.4;cursor:default;';

    var sections = [
      // ────────────────────────────────────────────────────────
      {
        title: '01 · 색상 토큰 (CSS Custom Properties)',
        note: ':root에 정의된 변수. 모든 컴포넌트는 이 값을 참조합니다.',
        html: [
          '<p class="kms-ds-note">브랜드 / 기본 색상</p>',
          '<div class="kms-ds-swatch-grid">',
          dsSwatchItem('--scouting-purple', '#622599', '스카우팅 퍼플 — 브랜드 Accent'),
          dsSwatchItem('--midnight-purple', '#4d006e', '미드나이트 퍼플 — Glossary / People'),
          dsSwatchItem('--black / --ink',   '#1f1f1f', '잉크 — 기본 텍스트'),
          dsSwatchItem('--muted',  'rgba(31,31,31,0.58)', '뮤트 — 보조 텍스트'),
          dsSwatchItem('--border', 'rgba(31,31,31,0.12)', '테두리'),
          dsSwatchItem('--bg / --card-bg',  '#ffffff', '배경 / 카드 배경'),
          '</div>',
          '<p class="kms-ds-note" style="margin-top:16px">지역 카테고리 색상</p>',
          '<div class="kms-ds-swatch-grid">',
          dsSwatchItem('--ocean-blue / --tag-korea', '#0094b4', 'KOR — 한국스카우트'),
          dsSwatchItem('--fire-red   / --tag-apr',   '#ff5655', 'APR — 아시아태평양'),
          dsSwatchItem('--forest-green / --tag-wosm','#248737', 'WOSM / EUR — 세계/유럽'),
          dsSwatchItem('--scouting-purple / --tag-people','#622599','People — 사람들'),
          dsSwatchItem('EUR 전용',  '#2f8f5b', 'EUR — 유럽 (지역 badge 전용)'),
          dsSwatchItem('AFR 전용',  '#b6761b', 'AFR — 아프리카'),
          dsSwatchItem('ARB 전용',  '#7b5cff', 'ARB — 아랍'),
          dsSwatchItem('IAR 전용',  '#d44f94', 'IAR — 인터-아메리카'),
          '</div>',
          '<p class="kms-ds-note" style="margin-top:16px">피드백 색상</p>',
          '<div class="kms-ds-swatch-grid">',
          dsSwatchItem('--success', '#248737', '성공 (forest-green)'),
          dsSwatchItem('--danger',  '#ff5655', '위험/삭제 (fire-red)'),
          dsSwatchItem('진행중',    '#1e9b60', '진행 중 상태 — calendar ongoing'),
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '02 · 타이포그래피 (Typography)',
        note: '폰트: AliceDigitalLearning (weight 300 / 700). 모든 크기는 :root 변수로 관리.',
        html: [
          '<div class="kms-ds-col">',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-display · 32px · w700</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:32px;font-weight:700;color:#1f1f1f;line-height:1.2">BP미디어 스카우트 뉴스</span></div>',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-section · 20px · w600</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:20px;font-weight:600;color:#1f1f1f;line-height:1.35">세계 스카우트 연맹 WOSM 공식 발표</span></div>',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-title / --fs-card-title · 18px · w600</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:18px;font-weight:600;color:#1f1f1f;line-height:1.35">잼버리 2026 한국 개최 확정</span></div>',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-body · 14px · w300 · lh 1.65</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:14px;font-weight:300;color:#1f1f1f;line-height:1.65">BP미디어는 스카우트 관련 소식을 빠르고 정확하게 전달합니다. 한국 스카우트연맹의 공식 활동부터 세계 스카우트 기구 WOSM의 국제 소식까지.</span></div>',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-nav · 12px · w300 · ls 0.08em</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:12px;font-weight:300;color:rgba(31,31,31,0.58);letter-spacing:0.08em">한국스카우트 · APR · WOSM · 사람들 · 최신소식</span></div>',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-meta · 11px · ls 0.12em · uppercase</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(31,31,31,0.58)">2026-03-22 · 조회 1,234</span></div>',
          '<div class="kms-ds-type-row"><span class="kms-ds-type-meta">--fs-micro · 10px · ls 0.12em · uppercase</span><span style="font-family:AliceDigitalLearning,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(31,31,31,0.58)">Korea Scout Association</span></div>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '03 · 버튼 (Buttons)',
        note: '버튼은 카테고리 칩과 동일 원칙: 직각(border-radius:0), 1px 테두리, uppercase, letter-spacing 0.1em+. 내부 채움 여부로 Primary / Outline / Danger를 구분.',
        html: [
          '<p class="kms-ds-note">Primary 44px — .submit-btn / .write-btn / .calendar-manage-btn 계열</p>',
          '<div class="kms-ds-row" style="margin-bottom:12px;flex-wrap:wrap">',
          '<button style="' + btnFilled + '">저장하기</button>',
          '<button style="' + btnAccent + '">새 게시글 작성</button>',
          '<button style="' + btnOutline + '">취소</button>',
          '<button style="' + btnDanger + '">삭제</button>',
          '<button style="' + btnDisabled + '" disabled>비활성화</button>',
          '</div>',
          '<p class="kms-ds-note">Secondary 36px — .filter-btn / .calendar-view-btn / .board-page-btn 계열</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap">',
          '<button style="' + btnSec + 'background:transparent;color:rgba(31,31,31,0.58);border-color:rgba(31,31,31,0.18)">달력</button>',
          '<button style="' + btnSec + 'background:transparent;color:rgba(31,31,31,0.58);border-color:rgba(31,31,31,0.18)">목록</button>',
          '<button style="' + btnSec + 'background:rgba(98,37,153,0.08);color:#622599;border-color:#622599">지도 (활성)</button>',
          '<button style="' + btnSec + 'background:transparent;color:rgba(31,31,31,0.58);border-color:rgba(31,31,31,0.18)">전체</button>',
          '<button style="' + btnSec + 'background:#1f1f1f;color:#fff;border-color:#1f1f1f">훈련 (활성)</button>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '04 · 게시글 카테고리 칩 (Post Kicker)',
        note: '.post-kicker 클래스 + 색상 modifier. 아웃라인 스타일(채움 없음), border-radius:0, uppercase, letter-spacing.',
        html: [
          '<p class="kms-ds-note">아웃라인 칩 (.post-kicker + .tag-*-kicker)</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap;margin-bottom:12px">',
          '<span class="post-kicker tag-korea-kicker">한국스카우트</span>',
          '<span class="post-kicker tag-apr-kicker">APR</span>',
          '<span class="post-kicker tag-wosm-kicker">WOSM</span>',
          '<span class="post-kicker tag-people-kicker">사람들</span>',
          '<span class="post-kicker tag-latest-kicker">최신소식</span>',
          '<span class="post-kicker tag-glossary-kicker">용어집</span>',
          '</div>',
          '<p class="kms-ds-note">NEW 칩 (.post-kicker-new) — 채움 검정</p>',
          '<div class="kms-ds-row">',
          '<span class="post-kicker post-kicker-new">NEW</span>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '05 · 캘린더 지역 배지 (Calendar Category Badge)',
        note: '.calendar-category-badge + .is-* 모디파이어. 아웃라인, border: 1px solid currentColor, 직각.',
        html: [
          '<div class="kms-ds-row" style="flex-wrap:wrap;margin-bottom:12px">',
          '<span class="calendar-category-badge is-kor">KOR</span>',
          '<span class="calendar-category-badge is-apr">APR</span>',
          '<span class="calendar-category-badge is-eur">EUR</span>',
          '<span class="calendar-category-badge is-afr">AFR</span>',
          '<span class="calendar-category-badge is-arb">ARB</span>',
          '<span class="calendar-category-badge is-iar">IAR</span>',
          '<span class="calendar-category-badge is-wosm">WOSM</span>',
          '</div>',
          '<p class="kms-ds-note">지도 마커 배지 (.calendar-map-badge + .is-*) — 채움, 원형</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap">',
          '<span class="calendar-map-badge is-kor">KOR</span>',
          '<span class="calendar-map-badge is-apr">APR</span>',
          '<span class="calendar-map-badge is-eur">EUR</span>',
          '<span class="calendar-map-badge is-afr">AFR</span>',
          '<span class="calendar-map-badge is-arb">ARB</span>',
          '<span class="calendar-map-badge is-iar">IAR</span>',
          '<span class="calendar-map-badge is-wosm">WOSM</span>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '06 · 캘린더 태그 & 대상 칩 (Calendar Tag / Target Chips)',
        note: '행사 카드 안에 인라인으로 표시되는 태그. 이벤트 태그(훈련, 잼버리 등)와 대상 분류(로버, 지도자 등)는 동일 행에 표시.',
        html: [
          '<p class="kms-ds-note">행사 태그 — 이벤트 유형</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap;margin-bottom:10px">',
          '<span style="display:inline-block;font-family:AliceDigitalLearning,sans-serif;font-size:10px;letter-spacing:0.08em;padding:2px 7px;border:1px solid rgba(31,31,31,0.25);color:rgba(31,31,31,0.7)">훈련</span>',
          '<span style="display:inline-block;font-family:AliceDigitalLearning,sans-serif;font-size:10px;letter-spacing:0.08em;padding:2px 7px;border:1px solid rgba(31,31,31,0.25);color:rgba(31,31,31,0.7)">잼버리</span>',
          '<span style="display:inline-block;font-family:AliceDigitalLearning,sans-serif;font-size:10px;letter-spacing:0.08em;padding:2px 7px;border:1px solid rgba(31,31,31,0.25);color:rgba(31,31,31,0.7)">세계행사</span>',
          '</div>',
          '<p class="kms-ds-note">대상 칩 (.calendar-target-chip) — KOR 전용, 파랑 테두리</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap">',
          '<span class="calendar-target-chip">비버</span>',
          '<span class="calendar-target-chip">컵스카우트</span>',
          '<span class="calendar-target-chip">스카우트</span>',
          '<span class="calendar-target-chip">벤처</span>',
          '<span class="calendar-target-chip">로버</span>',
          '<span class="calendar-target-chip">지도자</span>',
          '</div>',
          '<p class="kms-ds-note" style="margin-top:12px">행사 상태 배지 (.calendar-status-badge)</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap">',
          '<span class="calendar-status-badge is-upcoming">예정</span>',
          '<span class="calendar-status-badge is-ongoing">진행 중</span>',
          '<span class="calendar-status-badge is-finished">종료</span>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '07 · 게시글 카드 (Post Card)',
        note: '.post-card + .post-card-thumb / .post-card-body / .post-card-labels / .post-card-meta. border-radius:0, 1px 테두리, 16:9 썸네일.',
        html: [
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1px;border:1px solid rgba(31,31,31,0.12);max-width:560px">',
          // Card 1
          '<div class="post-card">',
          '<img class="post-card-thumb" src="" alt="" style="background:#e8e4de;aspect-ratio:16/9;display:block;width:100%;object-fit:cover" onerror="this.style.background=\'#e8e4de\'">',
          '<div class="post-card-body">',
          '<div class="post-card-labels"><span class="post-kicker tag-korea-kicker">한국스카우트</span></div>',
          '<h3>스카우트 잼버리 2026 한국 개최 확정 — 5만 명 참가 예상</h3>',
          '<p class="post-card-excerpt">제23회 세계 잼버리가 한국에서 개최될 예정으로, 약 5만 명의 스카우트가 참가할 것으로 예상됩니다.</p>',
          '<div class="post-card-footer"><div class="post-card-meta">2026-03-22 · 조회 1,234</div></div>',
          '</div></div>',
          // Card 2
          '<div class="post-card">',
          '<img class="post-card-thumb" src="" alt="" style="background:#dde6e4;aspect-ratio:16/9;display:block;width:100%;object-fit:cover" onerror="this.style.background=\'#dde6e4\'">',
          '<div class="post-card-body">',
          '<div class="post-card-labels"><span class="post-kicker tag-wosm-kicker">WOSM</span></div>',
          '<h3>세계 스카우트 연맹 총회 2025 결과 보고</h3>',
          '<p class="post-card-excerpt">WOSM 총회에서 새로운 글로벌 전략 방향이 채택되었습니다.</p>',
          '<div class="post-card-footer"><div class="post-card-meta">2026-02-10 · 조회 892</div></div>',
          '</div></div>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '08 · 캘린더 행사 카드 (Calendar Event Card)',
        note: '.calendar-event-card + .is-category-* (상단 3px 컬러 테두리로 지역 구분). 직각, 1px 테두리.',
        html: [
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;max-width:700px">',
          dsCalendarCard('is-category-kor', 'KOR', 'is-kor', '제22차 한국스카우트 대표자 대회', '2026-04-10 ~ 04-12', '수원 월드컵경기장', ['훈련'], ['지도자', '로버']),
          dsCalendarCard('is-category-apr', 'APR', 'is-apr', 'APR 지역 청소년 지도자 훈련', '2026-05-01 ~ 05-05', '말레이시아 쿠알라룸푸르', ['훈련', '교육'], []),
          dsCalendarCard('is-category-wosm', 'WOSM', 'is-wosm', '세계 스카우트 의회 2026', '2026-06-15 ~ 06-20', '스위스 제네바', ['세계행사'], []),
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '09 · 폼 요소 (Form Elements)',
        note: '.form-group 구조: label(10px uppercase) + input/select/textarea. 1px 테두리, border-radius:0, focus시 border-color:#1f1f1f.',
        html: [
          '<div class="kms-ds-form-grid">',
          '<div class="form-group"><label>제목 (TEXT INPUT)</label><input type="text" placeholder="게시글 제목을 입력하세요" /></div>',
          '<div class="form-group"><label>카테고리 (SELECT)</label><select><option>한국스카우트</option><option>APR</option><option>WOSM</option><option>사람들</option></select></div>',
          '<div class="form-group"><label>날짜 (DATE INPUT)</label><input type="date" /></div>',
          '<div class="form-group"><label>비활성화</label><input type="text" placeholder="비활성화 입력창" disabled /></div>',
          '</div>',
          '<div class="form-group" style="max-width:480px"><label>본문 요약 (TEXTAREA)</label><textarea placeholder="요약 내용을 입력하세요" style="min-height:80px"></textarea></div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '10 · 태그 필터 칩 (Tag / Filter Chips)',
        note: '.filter-btn / .tag-filter-btn — 카테고리 칩과 동일 원칙, 활성 시 배경 검정.',
        html: [
          '<p class="kms-ds-note">콘텐츠 필터 칩 (.filter-btn)</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap;margin-bottom:12px">',
          '<button class="filter-btn">전체</button>',
          '<button class="filter-btn">훈련</button>',
          '<button class="filter-btn active">잼버리</button>',
          '<button class="filter-btn">세계행사</button>',
          '<button class="filter-btn">교육</button>',
          '</div>',
          '<p class="kms-ds-note">글머리 태그 선택 (.tag-pill)</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap">',
          '<span class="tag-pill active">훈련</span>',
          '<span class="tag-pill">잼버리</span>',
          '<span class="tag-pill">국제행사</span>',
          '<span class="tag-pill">소식</span>',
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '11 · 그라디언트 토큰 (Gradients)',
        note: 'style.css에 정의된 주요 그라디언트. 홈 섹션 헤더, 히어로 오버레이 등에 사용.',
        html: [
          '<div class="kms-ds-gradient-grid">',
          dsGradient('--gradient-ink', 'linear-gradient(90deg,#111 0%,#191717 52%,#221d1c 100%)', 'Ink — 홈 섹션 타이틀 기본'),
          dsGradient('--gradient-purple', 'linear-gradient(90deg,#622599 0%,#562085 52%,#45186b 100%)', 'Purple — 스카우팅 퍼플'),
          dsGradient('--gradient-purple-deep', 'linear-gradient(135deg,#622599 0%,#4e1d7a 46%,#2a103f 100%)', 'Purple Deep — 히어로 오버레이'),
          dsGradient('Latest 섹션', 'linear-gradient(90deg,#4d006e 0%,#37004e 100%)', '최신소식 섹션 헤더'),
          dsGradient('Popular 섹션', 'linear-gradient(90deg,#d85b1f 0%,#a64016 100%)', '인기 섹션 헤더'),
          dsGradient('Picks 섹션', 'linear-gradient(90deg,#0d6c57 0%,#0a4f40 100%)', '특집 섹션 헤더'),
          '</div>',
        ].join(''),
      },

      // ────────────────────────────────────────────────────────
      {
        title: '12 · 레이아웃 & 간격 토큰 (Spacing)',
        note: ':root에 정의된 간격 변수. 반응형 레이아웃의 기준값.',
        html: [
          '<div class="kms-ds-spacing-grid">',
          dsSpacing('--board-card-gap', '6px', '보드 카드 간격'),
          dsSpacing('--home-section-gap', '18px', '홈 섹션 간격'),
          dsSpacing('--home-grid-gap', '24px', '홈 그리드 갭'),
          dsSpacing('--home-block-bottom', '36px', '홈 블록 하단 여백'),
          dsSpacing('--home-title-gap', '14px', '섹션 타이틀 아래 간격'),
          dsSpacing('카드 패딩', '24px', '.post-card-body padding'),
          dsSpacing('컨테이너 패딩', '20px–28px', '섹션 컨테이너'),
          dsSpacing('--btn-height-primary', '44px', '주요 버튼 높이'),
          dsSpacing('--btn-height-secondary', '36px', '보조 버튼 높이'),
          '</div>',
          '<p class="kms-ds-note" style="margin-top:14px">반응형 breakpoints</p>',
          '<div class="kms-ds-row" style="flex-wrap:wrap">',
          '<span class="kms-ds-bp-badge">1180px — 네비게이션 변경</span>',
          '<span class="kms-ds-bp-badge">900px — 태블릿</span>',
          '<span class="kms-ds-bp-badge">768px — 모바일 태블릿</span>',
          '<span class="kms-ds-bp-badge">480px — 모바일</span>',
          '</div>',
        ].join(''),
      },
    ];

    var bodyEl = container.querySelector('.kms-ds-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = sections.map(function (sec) {
      return '<section class="kms-ds-section">' +
        '<h3 class="kms-ds-section-title">' + GW.escapeHtml(sec.title) + '</h3>' +
        (sec.note ? '<p class="kms-ds-note kms-ds-note-top">' + GW.escapeHtml(sec.note) + '</p>' : '') +
        '<div class="kms-ds-preview">' + sec.html + '</div>' +
        '</section>';
    }).join('');
  }

  function dsSwatchItem(varName, color, label) {
    var isLight = (color.includes('0.58') || color.includes('0.12') || color === '#ffffff');
    return '<div class="kms-ds-swatch">' +
      '<div class="kms-ds-swatch-color" style="background:' + color + ';' + (isLight ? 'border:1px solid rgba(0,0,0,.12)' : '') + '"></div>' +
      '<div class="kms-ds-swatch-info">' +
        '<code class="kms-ds-swatch-var">' + GW.escapeHtml(varName) + '</code>' +
        '<span class="kms-ds-swatch-label">' + GW.escapeHtml(label) + '</span>' +
        '<span class="kms-ds-swatch-hex">' + GW.escapeHtml(color) + '</span>' +
      '</div>' +
      '</div>';
  }

  function dsCalendarCard(catClass, badgeClass, badgeMod, title, date, location, tags, targets) {
    var tagHtml = tags.map(function (t) {
      return '<span style="display:inline-block;font-family:AliceDigitalLearning,sans-serif;font-size:10px;letter-spacing:0.08em;padding:2px 6px;border:1px solid rgba(31,31,31,0.2);color:rgba(31,31,31,0.6)">' + t + '</span>';
    }).join('');
    var targetHtml = targets.map(function (t) {
      return '<span class="calendar-target-chip">' + t + '</span>';
    }).join('');
    return '<div class="calendar-event-card ' + catClass + '">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
        '<span class="calendar-category-badge ' + badgeMod + '">' + badgeClass + '</span>' +
        (tagHtml || targetHtml ? '<div class="calendar-event-badges" style="display:flex;flex-wrap:wrap;gap:4px">' + tagHtml + targetHtml + '</div>' : '') +
      '</div>' +
      '<h4>' + title + '</h4>' +
      '<div style="font-family:AliceDigitalLearning,sans-serif;font-size:12px;color:rgba(31,31,31,0.58);line-height:1.6">' +
        '<div>' + date + '</div>' +
        '<div>' + location + '</div>' +
      '</div>' +
      '</div>';
  }

  function dsGradient(name, value, label) {
    return '<div class="kms-ds-gradient-item">' +
      '<div class="kms-ds-gradient-bar" style="background:' + value + '"></div>' +
      '<div class="kms-ds-swatch-info">' +
        '<code class="kms-ds-swatch-var">' + GW.escapeHtml(name) + '</code>' +
        '<span class="kms-ds-swatch-label">' + GW.escapeHtml(label) + '</span>' +
      '</div>' +
      '</div>';
  }

  function dsSpacing(name, value, label) {
    return '<div class="kms-ds-spacing-item">' +
      '<code class="kms-ds-swatch-var">' + GW.escapeHtml(name) + '</code>' +
      '<strong class="kms-ds-spacing-val">' + GW.escapeHtml(value) + '</strong>' +
      '<span class="kms-ds-swatch-label">' + GW.escapeHtml(label) + '</span>' +
      '</div>';
  }

  // ── 유틸리티 ──────────────────────────────────────────────────
  function slugify(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

})();
