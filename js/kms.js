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
      desc: 'Changelog 조회와 운영 대시보드, 릴리스 이력 확인.',
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

  // ── 탭 ↔ URL 매핑 ─────────────────────────────────────────────
  var TAB_PATHS = { docs: '/kms/function', api: '/kms/api', changelog: '/kms/version', design: '/kms/design' };

  function _tabFromPath(pathname) {
    var map = { '/kms/function': 'docs', '/kms/api': 'api', '/kms/version': 'changelog', '/kms/design': 'design' };
    return map[pathname] || 'docs';
  }

  // ── 탭 시스템 ─────────────────────────────────────────────────
  function setTab(tab, skipPush) {
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
  }

  function updateVersionDisplay() {
    var siteVer = 'V' + (GW.APP_VERSION || '—');
    var adminVer = 'V' + (GW.ADMIN_VERSION || '—');
    document.querySelectorAll('.site-build-version').forEach(function (el) { el.textContent = siteVer; });
    document.querySelectorAll('.admin-build-version').forEach(function (el) { el.textContent = adminVer; });
    setText('kms-ver-site', siteVer);
    setText('kms-build-version', siteVer);
    setText('kms-release-note-version', 'Admin ' + adminVer + ' · 본문 서식 렌더 보정 반영본');
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
  function renderDesignSystem() {
    var container = document.getElementById('kms-tab-design');
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';

    var bodyEl = container.querySelector('.kms-ds-body');
    if (!bodyEl) return;
    var overview = {
      kinds: [
        { title: 'Foundation', desc: '색상, 타이포, 간격처럼 모든 화면이 공유하는 기본 토큰입니다.' },
        { title: 'Component', desc: '버튼, 칩, 카드, 폼처럼 재사용 가능한 UI 블록입니다.' },
        { title: 'Pattern', desc: '헤더, 히어로, 섹션 레일처럼 여러 모듈을 묶어 쓰는 조합입니다.' },
        { title: 'Responsive', desc: '데스크톱과 모바일에서 같은 구조를 무리 없이 보여주는 기준입니다.' }
      ],
      rules: [
        { title: '모듈 단위로 본다', desc: '각 카드에 종류, 토큰/클래스, 코드, 미리보기를 함께 둡니다.' },
        { title: '코드를 바로 읽는다', desc: 'HTML 구조와 핵심 클래스가 보이도록 코드 블록을 항상 노출합니다.' },
        { title: '같은 정보를 두 번 검증한다', desc: '코드로 확인하고, 오른쪽 미리보기로 즉시 시각 검증합니다.' }
      ],
      breakpoints: ['Desktop 1180+', 'Tablet 900+', 'Mobile 768-', 'Compact 480-']
    };

    var layers = [
      {
        title: 'FOUNDATION',
        sub: '디자인의 종류와 기본 토큰부터 먼저 파악합니다.',
        sections: [
          {
            title: '01 · 디자인 종류 맵',
            note: '이 탭에서 다루는 디자인 범위 자체를 먼저 분류합니다. 새 컴포넌트를 만들 때는 이 4개 분류 중 어디에 속하는지부터 정리합니다.',
            modules: [
              {
                kind: 'Foundation',
                title: '브랜드 팔레트 & 태그 토큰',
                summary: '색상은 독립적인 장식이 아니라 태그, 섹션 헤더, CTA 강조에 재사용되는 토큰 집합으로 관리합니다.',
                meta: [
                  { label: '토큰', values: ['--scouting-purple', '--midnight-purple', '--ink', '--border'] },
                  { label: '연결 클래스', values: ['.category-tag', '.post-kicker', '.home-section-title'] }
                ],
                code: [
                  '<span class="category-tag tag-korea">Korea</span>',
                  '<span class="post-kicker tag-wosm-kicker">WOSM</span>',
                  '<div class="home-section-title home-section-title-latest">',
                  '  <span>최신 소식</span>',
                  '  <div class="rule"></div>',
                  '</div>'
                ].join('\n'),
                preview: [
                  '<div class="kms-ds-preview-stack">',
                  '  <div class="kms-ds-token-grid">',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#622599"></span><strong>Brand Purple</strong><code>#622599</code></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#4d006e"></span><strong>Midnight</strong><code>#4d006e</code></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip" style="background:#1f1f1f"></span><strong>Ink</strong><code>#1f1f1f</code></div>',
                  '    <div class="kms-ds-token-card"><span class="kms-ds-token-chip kms-ds-token-chip-light" style="background:#ffffff"></span><strong>Surface</strong><code>#ffffff</code></div>',
                  '  </div>',
                  '  <div class="kms-ds-row">',
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
              }
            ]
          },
          {
            title: '02 · 모듈 계약서',
            note: '이제 모든 디자인은 섹션 설명이 아니라 모듈 계약으로 봅니다. 어떤 종류인지, 무엇을 쓰는지, 코드가 어떤지, 상태가 어떻게 변하는지가 한 카드 안에 있어야 합니다.',
            modules: [
              {
                kind: 'Module',
                title: '컴포넌트 모듈 기본 구조',
                summary: '재사용 가능한 디자인은 토큰, 구조, 상태 이름이 분리되어 있어야 합니다. 코드와 미리보기가 1:1로 대응돼야 수정이 쉬워집니다.',
                meta: [
                  { label: '필수 정보', values: ['kind', 'summary', 'tokens', 'code', 'preview'] },
                  { label: '상태', values: ['default', 'active', 'disabled', 'danger'] }
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
                  { label: '대상', values: ['.write-btn', '.filter-btn', '.tag-pill'] },
                  { label: '검토 포인트', values: ['명도 대비', '터치 크기', '비활성 피드백'] }
                ],
                code: [
                  '<button class="write-btn">새 게시글 작성</button>',
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
            title: '03 · 액션 컴포넌트',
            note: '행동을 만드는 UI는 크기와 우선순위가 바로 보여야 합니다. Primary / Secondary / Chip 계층이 섞이지 않도록 정리합니다.',
            modules: [
              {
                kind: 'Component',
                title: '버튼 패밀리',
                summary: '저장과 작성은 Primary, 취소는 Outline, 목록 토글은 Secondary, 필터는 Chip 레벨로 분리합니다.',
                meta: [
                  { label: '높이 기준', values: ['44px primary', '36px secondary', '26px chip'] },
                  { label: '대표 클래스', values: ['.write-btn', '.submit-btn', '.cancel-btn', '.board-page-btn'] }
                ],
                code: [
                  '<div class="kms-action-row">',
                  '  <button class="write-btn">새 게시글 작성</button>',
                  '  <button class="submit-btn">저장하기</button>',
                  '  <button class="cancel-btn visible">취소</button>',
                  '  <button class="board-page-btn active">2</button>',
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
            title: '04 · 콘텐츠 표면',
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
            title: '05 · 페이지 패턴',
            note: '헤더와 히어로, 섹션 레일은 한 개 컴포넌트보다 더 큰 구조입니다. 배치 규칙과 정보 우선순위를 같이 읽어야 합니다.',
            modules: [
              {
                kind: 'Pattern',
                title: '마스트헤드 + 히어로 조합',
                summary: '로고, 언어, 검색, 히어로 메시지가 한 화면에 모일 때도 정보 계층이 무너지지 않도록 간격과 폭을 관리합니다.',
                meta: [
                  { label: '대표 클래스', values: ['.masthead', '.nav', '.site-hero', '.hero-controls'] },
                  { label: '핵심 원칙', values: ['header는 가볍게', 'hero는 큰 메시지', 'CTA는 2개 이내'] }
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
                  '  <div class="kms-ds-shell-hero">',
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
            title: '06 · 피드백 패턴',
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
                  '  <div class="kms-ds-feedback-card"><div class="kms-ds-toast-demo is-success">저장되었습니다</div><small>Toast</small></div>',
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
            title: '07 · 반응형 블루프린트',
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
    return '<article class="kms-ds-module" data-kms-ds-view="code">' +
      '<div class="kms-ds-module-head">' +
        '<div class="kms-ds-module-title-block">' +
          '<span class="kms-ds-module-kicker">' + GW.escapeHtml(module.kind) + '</span>' +
          '<h4 class="kms-ds-module-title">' + GW.escapeHtml(module.title) + '</h4>' +
        '</div>' +
        '<div class="kms-ds-module-switch" role="tablist" aria-label="디자인 모듈 보기 전환">' +
          '<button type="button" class="kms-ds-view-btn is-active" data-kms-ds-view-btn="code" aria-pressed="true">코드 보기</button>' +
          '<button type="button" class="kms-ds-view-btn" data-kms-ds-view-btn="preview" aria-pressed="false">미리보기</button>' +
        '</div>' +
      '</div>' +
      '<p class="kms-ds-module-summary">' + GW.escapeHtml(module.summary) + '</p>' +
      '<div class="kms-ds-module-meta">' + renderDesignMeta(module.meta) + '</div>' +
      '<div class="kms-ds-module-stage">' +
        '<div class="kms-ds-module-pane kms-ds-module-pane-code" data-kms-ds-pane="code">' +
          '<span class="kms-ds-pane-label">Code</span>' +
          '<pre class="kms-ds-code-pane"><code>' + GW.escapeHtml(module.code || '') + '</code></pre>' +
        '</div>' +
        '<div class="kms-ds-module-pane kms-ds-module-pane-preview" data-kms-ds-pane="preview">' +
          '<span class="kms-ds-pane-label">Preview</span>' +
          '<div class="kms-ds-preview-canvas">' + (module.preview || '') + '</div>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function initDesignSystemInteractions(root) {
    if (!root || root.dataset.kmsDsBound === '1') return;
    root.dataset.kmsDsBound = '1';
    root.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-kms-ds-view-btn]') : null;
      if (!btn) return;
      var moduleEl = btn.closest('.kms-ds-module');
      if (!moduleEl) return;
      var nextView = btn.getAttribute('data-kms-ds-view-btn');
      if (nextView !== 'code' && nextView !== 'preview') return;
      moduleEl.setAttribute('data-kms-ds-view', nextView);
      moduleEl.querySelectorAll('[data-kms-ds-view-btn]').forEach(function (item) {
        var active = item.getAttribute('data-kms-ds-view-btn') === nextView;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
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

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

})();
