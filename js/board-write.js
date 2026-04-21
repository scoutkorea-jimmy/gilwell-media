(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.GW || !window.GW.Board) return;

  var GW = window.GW;
  var Board = GW.Board;

  function syncBoardTagPills(sel, selectedTags) {
    sel.querySelectorAll('.tag-pill').forEach(function (b) {
      var t = b.dataset.tag || '';
      if (t === '') {
        b.classList.toggle('active', selectedTags.length === 0);
      } else {
        b.classList.toggle('active', selectedTags.indexOf(t) >= 0);
      }
    });
  }

  Board.prototype._setupWriteFeature = function () {
    var self = this;
    var cat = GW.CATEGORIES[this.category] || GW.CATEGORIES.korea;

    var textEl = document.querySelector('.board-banner-text');
    if (textEl) {
      var btn = document.createElement('button');
      btn.className = 'write-btn';
      btn.textContent = '✏ 글쓰기';
      btn.addEventListener('click', function () { self._showPasswordModal(); });
      textEl.appendChild(btn);
    }

    var pwOverlay = document.createElement('div');
    pwOverlay.id = 'board-pw-overlay';
    pwOverlay.className = 'board-pw-overlay';
    pwOverlay.innerHTML =
      '<div class="board-pw-box">' +
        '<div class="board-pw-header">글쓰기</div>' +
        '<p class="board-pw-desc">관리자 또는 부여된 계정으로 로그인하세요</p>' +
        '<input type="text" id="board-pw-username" placeholder="아이디 (예: owner)" autocomplete="username" value="owner" spellcheck="false" autocapitalize="off" />' +
        '<input type="password" id="board-pw-input" placeholder="비밀번호" autocomplete="current-password" />' +
        '<div id="board-pw-turnstile" style="margin:12px 0;"></div>' +
        '<div id="board-pw-error" class="board-pw-error">아이디 또는 비밀번호가 올바르지 않습니다</div>' +
        '<div class="board-pw-actions">' +
          '<button id="board-pw-submit">확인</button>' +
          '<button id="board-pw-cancel">취소</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pwOverlay);

    document.getElementById('board-pw-submit').addEventListener('click', function () { self._checkPassword(); });
    document.getElementById('board-pw-cancel').addEventListener('click', function () { self._closePasswordModal(); });
    document.getElementById('board-pw-username').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var pw = document.getElementById('board-pw-input');
        if (pw) pw.focus();
      }
      if (e.key === 'Escape') self._closePasswordModal();
    });
    document.getElementById('board-pw-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') self._checkPassword();
      if (e.key === 'Escape') self._closePasswordModal();
    });
    pwOverlay.addEventListener('click', function (e) {
      if (e.target === pwOverlay) self._closePasswordModal();
    });

    var writeOverlay = document.createElement('div');
    writeOverlay.id = 'board-write-overlay';
    writeOverlay.className = 'board-write-overlay bw-overlay';
    writeOverlay.innerHTML =
      '<div class="board-write-box bw-box" role="dialog" aria-modal="true" aria-labelledby="board-write-heading">' +

        // ── Header ──
        '<header class="bw-header">' +
          '<div class="bw-header-meta">' +
            '<span class="bw-cat-badge" style="background:' + cat.color + '">' + GW.escapeHtml(cat.label) + '</span>' +
            '<span class="bw-header-hint">BP미디어 표준 v2.1 · 공식 원고 작성 도구</span>' +
          '</div>' +
          '<h1 class="bw-title" id="board-write-heading">새 게시글 작성</h1>' +
          '<button class="bw-close" id="board-write-close" aria-label="닫기" type="button">' +
            '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>' +
          '</button>' +
        '</header>' +

        '<div class="bw-layout">' +

          // ══════════════════ MAIN COLUMN ══════════════════
          '<div class="bw-main">' +

            // ── 기본 정보 ──
            '<section class="bw-card">' +
              '<header class="bw-card-head"><h2 class="bw-card-title">기본 정보</h2></header>' +
              '<div class="bw-form-grid">' +
                '<div class="bw-form-group">' +
                  '<label class="bw-label" for="board-write-title-input">제목 <span class="bw-label-req">*</span></label>' +
                  '<input class="bw-input" type="text" id="board-write-title-input" placeholder="게시글 제목을 입력하세요" maxlength="200" />' +
                '</div>' +
                '<div class="bw-form-group">' +
                  '<label class="bw-label" for="board-write-subtitle-input">부제목 <span class="bw-label-opt">선택</span></label>' +
                  '<input class="bw-input" type="text" id="board-write-subtitle-input" placeholder="해석 방향 또는 구조 흐름" maxlength="300" />' +
                '</div>' +
                '<div class="bw-form-group bw-form-group-relative">' +
                  '<label class="bw-label" for="board-write-special-feature">특집 기사 묶음 <span class="bw-label-opt">선택</span></label>' +
                  '<input class="bw-input" type="text" id="board-write-special-feature" placeholder="예: 세계잼버리 리더십 특집" maxlength="120" autocomplete="off" />' +
                  '<div id="board-sf-dropdown" class="bw-sf-dropdown" style="display:none;"></div>' +
                  '<p class="bw-field-hint">클릭하면 기존 특집 목록을 검색·선택할 수 있습니다.</p>' +
                '</div>' +
              '</div>' +
            '</section>' +

            // ── 저자 · 게시 시각 ──
            '<section class="bw-card">' +
              '<header class="bw-card-head"><h2 class="bw-card-title">저자 · 게시 시각</h2></header>' +
              '<div class="bw-form-grid bw-form-2col">' +
                '<div class="bw-form-group">' +
                  '<label class="bw-label" for="board-write-author">저자</label>' +
                  '<select class="bw-select" id="board-write-author"><option>불러오는 중…</option></select>' +
                '</div>' +
                '<div class="bw-form-group">' +
                  '<label class="bw-label" for="board-write-date">퍼블리싱 시각</label>' +
                  '<input class="bw-input" type="datetime-local" id="board-write-date" />' +
                '</div>' +
              '</div>' +
            '</section>' +

            // ── 글머리 태그 ──
            '<section class="bw-card">' +
              '<header class="bw-card-head"><h2 class="bw-card-title">글머리 태그 <span class="bw-label-opt">복수 선택</span></h2></header>' +
              '<div id="board-tag-selector" class="bw-tag-pills"><span class="bw-field-hint">불러오는 중…</span></div>' +
              '<div class="bw-inline-row bw-inline-row-compact">' +
                '<input class="bw-input bw-input-sm" type="text" id="board-tag-new-input" maxlength="30" placeholder="현재 카테고리에 새 태그 추가" />' +
                '<button class="bw-btn bw-btn-outline bw-btn-sm" type="button" id="board-tag-new-btn">추가</button>' +
              '</div>' +
            '</section>' +

            // ── 대표 이미지 · 캡션 · YouTube ──
            '<section class="bw-card">' +
              '<header class="bw-card-head">' +
                '<h2 class="bw-card-title">대표 이미지 · 링크</h2>' +
                '<button class="bw-btn bw-btn-outline bw-btn-sm" type="button" id="board-cover-btn">📷 대표 이미지 선택</button>' +
              '</header>' +
              '<div id="board-cover-wrap" class="bw-cover-wrap">' +
                '<div id="board-cover-preview"></div>' +
              '</div>' +
              '<div class="bw-form-group">' +
                '<label class="bw-label" for="board-write-image-caption">캡션 <span class="bw-label-opt">선택 · 출처 또는 설명</span></label>' +
                '<input class="bw-input" type="text" id="board-write-image-caption" placeholder="사진 출처 또는 캡션" maxlength="300" />' +
              '</div>' +
              '<div class="bw-form-group">' +
                '<label class="bw-label" for="board-write-youtube-input">YouTube 링크 <span class="bw-label-opt">선택</span></label>' +
                '<input class="bw-input" type="url" id="board-write-youtube-input" placeholder="https://www.youtube.com/watch?v=..." maxlength="300" />' +
                '<p class="bw-field-hint">영상 링크를 넣으면 기사 페이지 상단 히어로 영역에 임베드됩니다.</p>' +
              '</div>' +
            '</section>' +

            // ── 본문 에디터 ──
            '<section class="bw-card bw-card-editor">' +
              '<header class="bw-card-head">' +
                '<h2 class="bw-card-title">본문 <span class="bw-label-req">*</span></h2>' +
                '<span class="bw-field-hint">본문 이미지는 기사 안에 그대로 표시됩니다</span>' +
              '</header>' +
              '<div id="board-editorjs" class="board-editorjs-wrap"></div>' +
            '</section>' +

            // ── 슬라이드 갤러리 ──
            '<section class="bw-card">' +
              '<header class="bw-card-head">' +
                '<h2 class="bw-card-title">슬라이드 이미지 <span class="bw-label-opt" id="board-gallery-count">0/10</span></h2>' +
                '<button class="bw-btn bw-btn-outline bw-btn-sm" type="button" id="board-gallery-btn">🖼 이미지 추가</button>' +
              '</header>' +
              '<div id="board-gallery-preview" class="bw-gallery-preview gallery-upload-preview">' +
                '<p class="gallery-upload-empty">슬라이드 전용 이미지를 올리면 기사 하단에 별도 슬라이드로 노출됩니다.</p>' +
              '</div>' +
              '<p class="bw-field-hint">2장 이상일 때만 슬라이드가 활성화됩니다.</p>' +
            '</section>' +

            // ── 위치 정보 (collapsible) ──
            '<section class="bw-card bw-card-collapsible">' +
              '<details class="bw-details" id="board-location-toggle">' +
                '<summary class="bw-card-head bw-card-head-summary">' +
                  '<h2 class="bw-card-title">위치 정보 <span class="bw-label-opt">선택 · OpenStreetMap</span></h2>' +
                  '<span class="bw-chevron" aria-hidden="true">▾</span>' +
                '</summary>' +
                '<div class="bw-card-body">' +
                  '<div class="bw-form-grid bw-form-2col">' +
                    '<div class="bw-form-group">' +
                      '<label class="bw-label" for="board-write-location-name">위치 이름</label>' +
                      '<input class="bw-input" type="text" id="board-write-location-name" placeholder="예: 강원특별자치도 세계잼버리수련장" maxlength="120" />' +
                    '</div>' +
                    '<div class="bw-form-group">' +
                      '<label class="bw-label" for="board-write-location-address">주소 <span class="bw-label-opt">OSM 실주소</span></label>' +
                      '<div class="bw-inline-row">' +
                        '<input class="bw-input" type="text" id="board-write-location-address" placeholder="예: 강원도 고성군 토성면 ..." maxlength="300" />' +
                        '<button class="bw-btn bw-btn-outline bw-btn-sm" type="button" id="board-location-check-btn">지도 확인</button>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                  '<p class="bw-field-hint">게재 전 반드시 지도 확인을 눌러 위치를 검증하세요.</p>' +
                  '<div id="board-location-map-preview" class="bw-map-preview" style="display:none;">' +
                    '<iframe id="board-location-map-frame" loading="lazy"></iframe>' +
                    '<div id="board-location-map-status" class="bw-map-status"></div>' +
                  '</div>' +
                '</div>' +
              '</details>' +
            '</section>' +

            // ── SEO · 옵션 ──
            '<section class="bw-card">' +
              '<header class="bw-card-head"><h2 class="bw-card-title">SEO · 옵션</h2></header>' +
              '<div class="bw-form-group">' +
                '<label class="bw-label" for="board-write-metatags-input">SEO 해시태그 <span class="bw-label-opt">쉼표로 구분</span></label>' +
                '<div class="board-metatag-ac-wrap">' +
                  '<input class="bw-input" type="text" id="board-write-metatags-input" placeholder="예: 스카우트, 잼버리, WOSM, 세계스카우트" maxlength="500" autocomplete="off" />' +
                  '<div class="board-metatag-suggestions" id="board-metatag-suggestions" hidden></div>' +
                '</div>' +
                '<p class="bw-field-hint">기존에 많이 쓴 태그를 입력하면 자동완성이 제안됩니다.</p>' +
              '</div>' +
              '<label class="bw-check-row">' +
                '<input type="checkbox" id="board-ai-assisted" />' +
                '<span>AI 지원으로 작성했습니다 (기사 하단에 자동 고지)</span>' +
              '</label>' +
            '</section>' +

          '</div>' +

          // ══════════════════ SIDE COLUMN ══════════════════
          '<aside class="bw-side">' +

            // ── 작성 현황 ──
            '<section class="bw-card bw-card-tight bw-card-stats">' +
              '<h2 class="bw-card-title bw-card-title-sm">작성 현황</h2>' +
              '<div class="bw-stats-grid">' +
                '<div class="bw-stat">' +
                  '<span class="bw-stat-label">제목</span>' +
                  '<span class="bw-stat-value" id="board-stat-title">0자</span>' +
                '</div>' +
                '<div class="bw-stat">' +
                  '<span class="bw-stat-label">부제목</span>' +
                  '<span class="bw-stat-value" id="board-stat-subtitle">0자</span>' +
                '</div>' +
                '<div class="bw-stat">' +
                  '<span class="bw-stat-label">본문</span>' +
                  '<span class="bw-stat-value" id="board-stat-body">0자</span>' +
                '</div>' +
                '<div class="bw-stat">' +
                  '<span class="bw-stat-label">문단</span>' +
                  '<span class="bw-stat-value" id="board-stat-paragraphs">0개</span>' +
                '</div>' +
              '</div>' +
              '<div class="bw-stats-meta" id="board-stat-reading">예상 읽기 시간 —</div>' +
              '<div class="board-write-draft-status bw-draft-line" id="board-draft-status">자동저장 대기…</div>' +
            '</section>' +

            // ── SEO 미리보기 ──
            '<section class="bw-card bw-card-tight bw-card-seo">' +
              '<h2 class="bw-card-title bw-card-title-sm">SEO · 공유 미리보기</h2>' +
              '<div class="board-write-seo bw-seo-preview">' +
                '<div class="board-write-seo-url bw-seo-url" id="board-seo-url">https://gilwell.media/post/—</div>' +
                '<div class="board-write-seo-title bw-seo-title" id="board-seo-title">기사 제목이 여기에 표시됩니다</div>' +
                '<div class="board-write-seo-desc bw-seo-desc" id="board-seo-desc">부제목이 없으면 본문 첫 문단이 사용됩니다.</div>' +
              '</div>' +
            '</section>' +

            // ── AI 채점 ──
            '<section class="bw-card bw-card-tight bw-card-scorer">' +
              '<div class="bw-scorer-head">' +
                '<h2 class="bw-card-title bw-card-title-sm">AI 채점</h2>' +
                '<button class="bw-btn bw-btn-primary bw-btn-sm board-write-scorer-btn" type="button" id="board-scorer-btn">✨ 채점</button>' +
              '</div>' +
              '<p class="bw-field-hint">BP미디어 표준 v2.1 기준 Title · Subtitle · Body · Tags · 문체를 자동 분석합니다.</p>' +
              '<div id="board-scorer-result" class="board-write-scorer-result bw-scorer-result" hidden></div>' +
            '</section>' +

            // ── Turnstile (if configured) ──
            '<div id="board-write-turnstile" class="bw-turnstile"></div>' +

            // ── 단축키 힌트 ──
            '<div class="bw-shortcut-hint">⌘/Ctrl + S 임시저장 · Esc 닫기</div>' +

          '</aside>' +

        '</div>' +

        // ══════════════════ STICKY FOOTER ══════════════════
        '<footer class="bw-footer">' +
          '<div class="bw-footer-left"><span class="bw-footer-hint">게재 전 반드시 미리보기를 확인하세요</span></div>' +
          '<div class="bw-footer-actions">' +
            '<button class="bw-btn bw-btn-ghost cancel-btn visible" type="button" id="board-write-cancel">취소</button>' +
            '<button class="bw-btn bw-btn-outline cancel-btn visible" type="button" id="board-write-savedraft">💾 임시저장</button>' +
            '<button class="bw-btn bw-btn-primary bw-btn-submit submit-btn" type="button" id="board-write-submit">게재하기</button>' +
          '</div>' +
        '</footer>' +

      '</div>';
    document.body.appendChild(writeOverlay);

    document.getElementById('board-write-close').addEventListener('click', function () { self._closeWriteForm(); });
    document.getElementById('board-write-cancel').addEventListener('click', function () { self._closeWriteForm(); });
    document.getElementById('board-write-submit').addEventListener('click', function () { self._submitPost(); });
    document.getElementById('board-cover-btn').addEventListener('click', function () { self._uploadCoverImage(); });
    document.getElementById('board-gallery-btn').addEventListener('click', function () { self._uploadGalleryImages(); });
    document.getElementById('board-tag-new-btn').addEventListener('click', function () { self._addWriteTag(); });
    document.getElementById('board-tag-new-input').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        self._addWriteTag();
      }
    });

    var sfInput = document.getElementById('board-write-special-feature');
    var sfDropdown = document.getElementById('board-sf-dropdown');
    var _sfItems = [];
    function _loadSfItems() {
      if (_sfItems.length) return;
      var currentCategory = self.apiCategory || self.category;
      fetch('/api/posts/special-features?category=' + encodeURIComponent(currentCategory), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (data) { _sfItems = data && Array.isArray(data.items) ? data.items : []; })
        .catch(function () {});
    }
    function _showSfDropdown(filter) {
      var filtered = filter ? _sfItems.filter(function (s) { return s.toLowerCase().indexOf(filter.toLowerCase()) >= 0; }) : _sfItems;
      if (!filtered.length) {
        sfDropdown.style.display = 'none';
        return;
      }
      sfDropdown.innerHTML = filtered.map(function (s) {
        return '<div class="sf-dropdown-item" style="padding:8px 12px;cursor:pointer;font-family:&#39;Google Sans Flex&#39;,NixgonFont,sans-serif;font-size:12px;border-bottom:1px solid var(--border);">' + GW.escapeHtml(s) + '</div>';
      }).join('');
      sfDropdown.querySelectorAll('.sf-dropdown-item').forEach(function (item) {
        item.addEventListener('click', function () {
          sfInput.value = item.textContent;
          sfDropdown.style.display = 'none';
        });
        item.addEventListener('mouseenter', function () { item.style.background = 'var(--surface)'; });
        item.addEventListener('mouseleave', function () { item.style.background = ''; });
      });
      sfDropdown.style.display = 'block';
    }
    if (sfInput) {
      sfInput.addEventListener('focus', function () {
        _loadSfItems();
        setTimeout(function () { _showSfDropdown(sfInput.value); }, 100);
      });
      sfInput.addEventListener('input', function () { _showSfDropdown(sfInput.value); });
      document.addEventListener('click', function (e) {
        if (!sfInput.contains(e.target) && !sfDropdown.contains(e.target)) {
          sfDropdown.style.display = 'none';
        }
      });
    }

    document.getElementById('board-location-check-btn').addEventListener('click', function () {
      self._checkLocationAddress();
    });
    document.getElementById('board-write-location-address').addEventListener('input', function () {
      var prev = document.getElementById('board-location-map-preview');
      if (prev) prev.style.display = 'none';
    });
    document.getElementById('board-write-savedraft').addEventListener('click', function () {
      self._saveDraft(true);
    });
    writeOverlay.addEventListener('click', function (e) {
      if (e.target === writeOverlay) self._closeWriteForm();
    });
  };

  Board.prototype._renderWriteTagSelector = function (tags) {
    var self = this;
    var sel = document.getElementById('board-tag-selector');
    if (!sel) return;
    var selected = (self._selectedTags || []).filter(function (tag) {
      return tags.indexOf(tag) >= 0;
    });
    self._selectedTags = selected;
    var html = '<button type="button" class="tag-pill' + (!selected.length ? ' active' : '') + '" data-tag="">없음</button>';
    tags.forEach(function (tag) {
      var active = selected.indexOf(tag) >= 0 ? ' active' : '';
      html += '<button type="button" class="tag-pill' + active + '" data-tag="' + GW.escapeHtml(tag) + '">' + GW.escapeHtml(tag) + '</button>';
    });
    sel.innerHTML = html;
    sel.querySelectorAll('.tag-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tagVal = btn.dataset.tag || '';
        if (tagVal === '') {
          self._selectedTags = [];
        } else {
          var idx = self._selectedTags.indexOf(tagVal);
          if (idx >= 0) self._selectedTags.splice(idx, 1);
          else self._selectedTags.push(tagVal);
        }
        syncBoardTagPills(sel, self._selectedTags);
      });
    });
    syncBoardTagPills(sel, self._selectedTags);
  };

  Board.prototype._loadWriteTagOptions = function () {
    var self = this;
    var sel = document.getElementById('board-tag-selector');
    if (sel) sel.innerHTML = '<span style="font-size:11px;color:var(--muted);">불러오는 중…</span>';
    return fetch('/api/settings/tags?category=' + encodeURIComponent(self.category), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        self._renderWriteTagSelector((data && data.items) || []);
      })
      .catch(function () {
        if (sel) sel.innerHTML = '<span style="font-size:11px;color:var(--muted);">태그를 불러오지 못했습니다</span>';
      });
  };

  Board.prototype._addWriteTag = function () {
    var self = this;
    var input = document.getElementById('board-tag-new-input');
    var value = (input && input.value || '').trim();
    if (!value) {
      GW.showToast('태그명을 입력해주세요', 'error');
      if (input) input.focus();
      return;
    }
    GW.addManagedTagToCategory(value, self.category)
      .then(function (result) {
        var selectedTag = result && result.selectedTag ? result.selectedTag : value;
        if (self._selectedTags.indexOf(selectedTag) < 0) self._selectedTags.push(selectedTag);
        return self._loadWriteTagOptions().then(function () {
          if (input) input.value = '';
          GW.showToast(result && result.created ? '태그를 추가하고 바로 선택했습니다' : '이미 있는 태그라서 바로 선택했습니다', 'success');
        });
      })
      .catch(function (err) {
        GW.showToast(err && err.message ? err.message : '태그를 추가하지 못했습니다', 'error');
      });
  };

  Board.prototype._checkLocationAddress = function () {
    var addr = (document.getElementById('board-write-location-address') || {}).value || '';
    addr = addr.trim();
    if (!addr) {
      GW.showToast('주소를 입력하세요', 'error');
      return;
    }
    var btn = document.getElementById('board-location-check-btn');
    var prev = document.getElementById('board-location-map-preview');
    var frame = document.getElementById('board-location-map-frame');
    var status = document.getElementById('board-location-map-status');
    btn.disabled = true;
    btn.textContent = '검색 중…';
    prev.style.display = 'none';
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addr) + '&format=json&limit=1', {
      headers: { 'Accept-Language': 'ko,en', 'User-Agent': 'GilwellMedia/1.0' }
    })
      .then(function (r) { return r.json(); })
      .then(function (results) {
        btn.disabled = false;
        btn.textContent = '지도 확인';
        if (!results || !results.length) {
          GW.showToast('주소를 지도에서 찾을 수 없습니다. 다른 주소를 사용해보세요.', 'error');
          return;
        }
        var loc = results[0];
        var lat = parseFloat(loc.lat);
        var lon = parseFloat(loc.lon);
        var d = 0.01;
        var bbox = (lon - d) + ',' + (lat - d) + ',' + (lon + d) + ',' + (lat + d);
        frame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat + ',' + lon;
        status.textContent = '✓ ' + (loc.display_name || addr);
        prev.style.display = 'block';
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = '지도 확인';
        GW.showToast('지도 검색 중 오류가 발생했습니다', 'error');
      });
  };

  // SRI hashes for every CDN resource loaded dynamically here.
  var _BOARD_WRITE_CDN_INTEGRITY = {
    'https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js':
      'sha384-3Qk35FaVNGtZ86D5asHJgGM7akscpKWK8qCTRKlW3/+E7JXMNMdXY435C6ZlBrJ4',
    'https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js':
      'sha384-mJYViA5YLmpq5x1Fj5reTmyAPkQLTzUK4w4kkj4dNADfMQ6Me8TxBBgcpVFZKx3l',
    'https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js':
      'sha384-pt2axkhrlqv09EbFmJffXfINJyTZxEnHXulBal/0IZoIT/DIjN9Q8pxYzvJmol8z',
    'https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js':
      'sha384-VXa5SbbQEZGzYpLCMMFm9tK9lOqrfbjMtFF3ajsJs3AVrG8KQJemVU/wYCVenOyX'
  };

  Board.prototype._loadEditorJs = function (callback) {
    if (window.EditorJS) {
      callback();
      return;
    }

    function loadScript(src, cb) {
      var integrity = Object.prototype.hasOwnProperty.call(_BOARD_WRITE_CDN_INTEGRITY, src) ? _BOARD_WRITE_CDN_INTEGRITY[src] : null;
      if (!integrity && /^https?:/i.test(src)) {
        console.error('[board-write] Refused to load unpinned CDN script (no SRI hash): ' + src);
        cb();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
      }
      s.onload = cb;
      document.head.appendChild(s);
    }

    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
      var pending = 3;
      function done() {
        pending -= 1;
        if (pending === 0) callback();
      }
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js', done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js', done);
    });
  };

  Board.prototype._initEditorJs = function () {
    if (this._editor) return;

    this._editor = new window.EditorJS({
      holder: 'board-editorjs',
      placeholder: '내용을 작성하세요...',
      tools: {
        paragraph: {
          inlineToolbar: true,
          config: { preserveBlank: true },
        },
        header: {
          class: window.Header,
          config: { levels: [2, 3, 4], defaultLevel: 2 },
        },
        list: {
          class: window.List,
          inlineToolbar: true,
        },
        quote: {
          class: window.Quote,
          inlineToolbar: true,
        },
        image: {
          class: GW.makeEditorImageTool(),
        },
      },
    });
  };

  Board.prototype._showPasswordModal = function () {
    var self = this;
    var overlay = document.getElementById('board-pw-overlay');
    if (!overlay) return;
    document.getElementById('board-pw-input').value = '';
    var userEl = document.getElementById('board-pw-username');
    if (userEl && !userEl.value) userEl.value = 'owner';
    document.getElementById('board-pw-error').style.display = 'none';
    this._loginTurnstileToken = '';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    GW.loadTurnstile(function () {
      if (window.turnstile && GW.TURNSTILE_SITE_KEY) {
        if (self._loginTurnstileWidgetId == null) {
          self._loginTurnstileWidgetId = window.turnstile.render('#board-pw-turnstile', {
            sitekey: GW.TURNSTILE_SITE_KEY,
            theme: 'light',
            callback: function (token) { self._loginTurnstileToken = token; },
            'expired-callback': function () { self._loginTurnstileToken = ''; },
          });
        } else {
          window.turnstile.reset(self._loginTurnstileWidgetId);
        }
      }
    });
    setTimeout(function () { document.getElementById('board-pw-input').focus(); }, 50);
  };

  Board.prototype._closePasswordModal = function () {
    var overlay = document.getElementById('board-pw-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    this._loginTurnstileToken = '';
    if (window.turnstile && this._loginTurnstileWidgetId != null) {
      window.turnstile.reset(this._loginTurnstileWidgetId);
    }
  };

  Board.prototype._checkPassword = function () {
    var self = this;
    var userEl = document.getElementById('board-pw-username');
    var input = document.getElementById('board-pw-input');
    var submitBtn = document.getElementById('board-pw-submit');
    var error = document.getElementById('board-pw-error');
    var username = userEl ? String(userEl.value || '').trim().toLowerCase() : 'owner';
    if (!username) username = 'owner';
    var pw = (input.value || '').trim();
    if (!pw) {
      error.textContent = '비밀번호를 입력해주세요';
      error.style.display = 'block';
      input.focus();
      return;
    }
    if (GW.TURNSTILE_SITE_KEY && !this._loginTurnstileToken) {
      error.textContent = 'CAPTCHA를 완료해주세요';
      error.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '확인 중…';
    error.style.display = 'none';

    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: username,
        password: pw,
        cf_turnstile_response: this._loginTurnstileToken || undefined,
      }),
    })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
        if (data && data.user && data.user.must_change_password) {
          if (GW.showToast) GW.showToast('임시 비밀번호입니다. 관리자 페이지 → 내 계정에서 변경해주세요.', 'warn', 8000);
        }
        self._closePasswordModal();
        self._showWriteForm();
      })
      .catch(function (err) {
        error.textContent = err && err.message ? err.message : '아이디 또는 비밀번호가 올바르지 않습니다';
        error.style.display = 'block';
        input.value = '';
        input.focus();
        self._loginTurnstileToken = '';
        if (window.turnstile && self._loginTurnstileWidgetId != null) {
          window.turnstile.reset(self._loginTurnstileWidgetId);
        }
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = '확인';
      });
  };

  Board.prototype._uploadCoverImage = function () {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      GW.optimizeImageFile(file, { maxW: 1600, maxH: 1600, quality: 0.82 })
        .then(function (result) {
          self._coverImage = result.dataUrl;
          self._renderCoverPreview();
        })
        .catch(function (err) {
          GW.showToast(err && err.message ? err.message : '이미지 최적화 실패', 'error');
        });
    };
    input.click();
  };

  Board.prototype._uploadGalleryImages = function () {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files || []);
      var remaining = Math.max(0, 10 - self._galleryImages.length);
      if (!files.length) return;
      if (!remaining) {
        GW.showToast('슬라이드 이미지는 최대 10장까지 추가할 수 있습니다', 'error');
        return;
      }
      files.slice(0, remaining).reduce(function (chain, file) {
        return chain.then(function () {
          return GW.optimizeImageFile(file, { maxW: 1800, maxH: 1800, quality: 0.84 }).then(function (result) {
            self._galleryImages.push({ url: result.dataUrl, caption: '' });
          });
        });
      }, Promise.resolve()).then(function () {
        self._renderGalleryPreview();
      }).catch(function (err) {
        GW.showToast(err && err.message ? err.message : '이미지 최적화 실패', 'error');
      });
    };
    input.click();
  };

  Board.prototype._showWriteForm = function () {
    var self = this;
    var overlay = document.getElementById('board-write-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    self._selectedTags = [];
    self._coverImage = null;
    self._galleryImages = [];
    self._turnstileToken = '';
    var coverCaptionEl = document.getElementById('board-write-image-caption');
    if (coverCaptionEl) coverCaptionEl.value = '';
    self._renderCoverPreview();
    self._renderGalleryPreview();
    var aiChk = document.getElementById('board-ai-assisted');
    if (aiChk) aiChk.checked = false;

    var _fillAuthorSelect = function (editors) {
      var sel = document.getElementById('board-write-author');
      if (!sel) return;
      var current = sel.value || 'Editor A';
      sel.innerHTML = GW.buildEditorOptions(editors);
      sel.value = current;
    };
    GW.apiFetch('/api/settings/editors')
      .then(function (data) { _fillAuthorSelect(data.editors || {}); })
      .catch(function () { _fillAuthorSelect({}); });

    var dateEl = document.getElementById('board-write-date');
    if (dateEl) dateEl.value = GW.getKstDateTimeInputValue();

    self._loadWriteTagOptions();

    this._loadEditorJs(function () {
      if (self._editor) {
        self._editor.destroy();
        self._editor = null;
        var holder = document.getElementById('board-editorjs');
        if (holder) holder.innerHTML = '';
      }
      self._initEditorJs();
      document.getElementById('board-write-title-input').value = '';
      var sub = document.getElementById('board-write-subtitle-input');
      if (sub) sub.value = '';
      var sf = document.getElementById('board-write-special-feature');
      if (sf) sf.value = '';
      var mt = document.getElementById('board-write-metatags-input');
      if (mt) mt.value = '';
      var yt = document.getElementById('board-write-youtube-input');
      if (yt) yt.value = '';
      var locationNameEl = document.getElementById('board-write-location-name');
      if (locationNameEl) locationNameEl.value = '';
      var locationAddressEl = document.getElementById('board-write-location-address');
      if (locationAddressEl) locationAddressEl.value = '';
      var locationToggle = document.getElementById('board-location-toggle');
      if (locationToggle) locationToggle.open = false;

      var draftKey = 'gw_draft_' + self.category;
      var draftStr = localStorage.getItem(draftKey);
      if (draftStr) {
        try {
          var draft = JSON.parse(draftStr);
          if (draft && (draft.title || draft.editorData) && confirm('저장된 임시 글이 있습니다. 불러올까요?')) {
            if (draft.title) document.getElementById('board-write-title-input').value = draft.title;
            var sub2 = document.getElementById('board-write-subtitle-input');
            if (sub2 && draft.subtitle) sub2.value = draft.subtitle;
            var sf2 = document.getElementById('board-write-special-feature');
            if (sf2 && draft.special_feature) sf2.value = draft.special_feature;
            var mt2 = document.getElementById('board-write-metatags-input');
            if (mt2 && draft.meta_tags) mt2.value = draft.meta_tags;
            var yt2 = document.getElementById('board-write-youtube-input');
            if (yt2 && draft.youtube_url) yt2.value = draft.youtube_url;
            var locationName2 = document.getElementById('board-write-location-name');
            if (locationName2 && draft.location_name) locationName2.value = draft.location_name;
            var locationAddress2 = document.getElementById('board-write-location-address');
            if (locationAddress2 && draft.location_address) locationAddress2.value = draft.location_address;
            var locationToggle2 = document.getElementById('board-location-toggle');
            if (locationToggle2) locationToggle2.open = !!(draft.location_name || draft.location_address);
            var cap2 = document.getElementById('board-write-image-caption');
            if (cap2) cap2.value = draft.image_caption || '';
            var author2 = document.getElementById('board-write-author');
            if (author2 && draft.author) author2.value = draft.author;
            var date2 = document.getElementById('board-write-date');
            if (date2) date2.value = GW.toDatetimeLocalValue(draft.publish_at || draft.publish_date || '') || GW.getKstDateTimeInputValue();
            var ai2 = document.getElementById('board-ai-assisted');
            if (ai2) ai2.checked = !!draft.ai_assisted;
            if (draft.tags && Array.isArray(draft.tags)) self._selectedTags = draft.tags;
            self._coverImage = draft.image_url || null;
            self._renderCoverPreview();
            self._galleryImages = self._parseGallerySeed(draft.gallery_images);
            self._renderGalleryPreview();
            var tagSel = document.getElementById('board-tag-selector');
            if (tagSel) syncBoardTagPills(tagSel, self._selectedTags);
            if (draft.editorData && self._editor) {
              self._editor.render(draft.editorData).catch(function () {});
            }
          }
        } catch (e) {
          localStorage.removeItem(draftKey);
        }
      }

      setTimeout(function () { document.getElementById('board-write-title-input').focus(); }, 100);

      // Write assist (stats · SEO · scoring · autocomplete · shortcuts)
      self._bindBoardWriteAssistEventsOnce();
      self._ensureBoardMetaTagPool();
      self._updateBoardWriteStats();
      self._updateBoardSeoPreview();
      self._boardDraftDirty = false;
      self._setBoardDraftStatus('idle');
      var scorerOut = document.getElementById('board-scorer-result');
      if (scorerOut) { scorerOut.hidden = true; scorerOut.innerHTML = ''; }
    });

    GW.loadTurnstile(function () {
      if (window.turnstile && GW.TURNSTILE_SITE_KEY) {
        if (self._turnstileWidgetId == null) {
          self._turnstileWidgetId = window.turnstile.render('#board-write-turnstile', {
            sitekey: GW.TURNSTILE_SITE_KEY,
            theme: 'light',
            callback: function (token) { self._turnstileToken = token; },
            'expired-callback': function () { self._turnstileToken = ''; },
          });
        } else {
          window.turnstile.reset(self._turnstileWidgetId);
          self._turnstileToken = '';
        }
      }
    });

    self._startDraftAutosave();
  };

  Board.prototype._closeWriteForm = function () {
    this._stopDraftAutosave();
    var overlay = document.getElementById('board-write-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    this._turnstileToken = '';
    if (window.turnstile && this._turnstileWidgetId != null) {
      window.turnstile.reset(this._turnstileWidgetId);
    }
  };

  Board.prototype._submitPost = function () {
    var self = this;
    var title = (document.getElementById('board-write-title-input').value || '').trim();
    var subEl = document.getElementById('board-write-subtitle-input');
    var subtitle = subEl ? (subEl.value || '').trim() : '';
    var specialFeatureEl = document.getElementById('board-write-special-feature');
    var mtEl = document.getElementById('board-write-metatags-input');
    var metaTags = mtEl ? (mtEl.value || '').trim() : '';
    var ytEl = document.getElementById('board-write-youtube-input');
    var youtubeUrl = ytEl ? (ytEl.value || '').trim() : '';
    var coverCaptionEl = document.getElementById('board-write-image-caption');
    var locationNameEl = document.getElementById('board-write-location-name');
    var locationAddressEl = document.getElementById('board-write-location-address');
    var submitBtn = document.getElementById('board-write-submit');

    if (!title) {
      GW.showToast('제목을 입력해주세요', 'error');
      return;
    }
    if (!this._editor) {
      GW.showToast('에디터가 준비되지 않았습니다', 'error');
      return;
    }
    if (GW.TURNSTILE_SITE_KEY && !this._turnstileToken) {
      GW.showToast('CAPTCHA를 완료해주세요', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '게재 중…';

    this._editor.save()
      .then(function (outputData) {
        var validation = GW.validatePostEditorOutput(outputData);
        if (!validation.ok) {
          GW.showToast(validation.error, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = '게재하기';
          return;
        }

        GW.apiFetch('/api/posts', {
          method: 'POST',
          body: JSON.stringify({
            category: self.category,
            title: title,
            subtitle: subtitle || null,
            special_feature: specialFeatureEl ? ((specialFeatureEl.value || '').trim() || null) : null,
            content: JSON.stringify(outputData),
            image_url: self._coverImage || null,
            gallery_images: self._galleryImages || [],
            image_caption: coverCaptionEl ? ((coverCaptionEl.value || '').trim() || null) : null,
            youtube_url: youtubeUrl || null,
            location_name: locationNameEl ? ((locationNameEl.value || '').trim() || null) : null,
            location_address: locationAddressEl ? ((locationAddressEl.value || '').trim() || null) : null,
            tag: self._selectedTags && self._selectedTags.length ? self._selectedTags.join(',') : null,
            meta_tags: metaTags || null,
            author: (document.getElementById('board-write-author') || {}).value || undefined,
            publish_at: (document.getElementById('board-write-date') || {}).value ? GW.normalizePublishAtValue(document.getElementById('board-write-date').value) : undefined,
            ai_assisted: (document.getElementById('board-ai-assisted') || {}).checked ? 1 : 0,
            cf_turnstile_response: self._turnstileToken || undefined,
          }),
        })
          .then(function () {
            GW.showToast('게재됐습니다', 'success');
            localStorage.removeItem('gw_draft_' + self.category);
            self._stopDraftAutosave();
            self._turnstileToken = '';
            if (window.turnstile && self._turnstileWidgetId != null) {
              window.turnstile.reset(self._turnstileWidgetId);
            }
            self._closeWriteForm();
            self.page = 1;
            self.total = 0;
            self.totalPages = 1;
            self.gridEl.innerHTML = '';
            self._load();
          })
          .catch(function (err) {
            if (err.status === 401) {
              GW.clearToken();
              GW.showToast('세션이 만료됐습니다. 다시 로그인해주세요.', 'error');
              self._closeWriteForm();
            } else {
              GW.showToast(err.message || '게재 실패', 'error');
              self._turnstileToken = '';
              if (window.turnstile && self._turnstileWidgetId != null) {
                window.turnstile.reset(self._turnstileWidgetId);
              }
            }
          })
          .finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = '게재하기';
          });
      })
      .catch(function () {
        GW.showToast('내용 저장 중 오류가 발생했습니다', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '게재하기';
      });
  };

  /* ══════════════════════════════════════════════════════════
     WRITE ASSIST — stats · SEO · scoring · autocomplete · shortcuts
     ══════════════════════════════════════════════════════════ */

  function _plainFromBoardEditor(doc) {
    if (!doc || !Array.isArray(doc.blocks)) return '';
    return doc.blocks.map(function (b) {
      if (!b || !b.data) return '';
      if (b.type === 'paragraph' || b.type === 'header' || b.type === 'quote') {
        return String(b.data.text || '').replace(/<[^>]+>/g, '');
      }
      if (b.type === 'list') {
        return (b.data.items || []).map(function (it) {
          if (typeof it === 'string') return it.replace(/<[^>]+>/g, '');
          return String((it && it.content) || '').replace(/<[^>]+>/g, '');
        }).join('\n');
      }
      return '';
    }).filter(Boolean).join('\n\n');
  }

  Board.prototype._setBoardDraftStatus = function (state, msg) {
    var el = document.getElementById('board-draft-status');
    if (!el) return;
    el.classList.remove('is-saving', 'is-saved', 'is-dirty');
    if (state === 'saving') { el.classList.add('is-saving'); el.textContent = msg || '자동 저장 중…'; }
    else if (state === 'saved')  { el.classList.add('is-saved');  el.textContent = msg || '자동 저장됨'; }
    else if (state === 'dirty')  { el.classList.add('is-dirty');  el.textContent = msg || '변경사항 있음'; }
    else { el.textContent = msg || '자동저장 대기…'; }
  };

  Board.prototype._scheduleBoardDraftSave = function () {
    var self = this;
    self._boardDraftDirty = true;
    self._setBoardDraftStatus('dirty');
    if (self._boardDraftDebounce) clearTimeout(self._boardDraftDebounce);
    self._boardDraftDebounce = setTimeout(function () {
      self._setBoardDraftStatus('saving');
      self._saveDraft(false).then(function () {
        self._boardDraftDirty = false;
        self._setBoardDraftStatus('saved');
      }).catch(function () {
        self._setBoardDraftStatus('dirty', '저장 실패 · 재시도 예정');
      });
    }, 1800);
  };

  Board.prototype._updateBoardWriteStats = function () {
    var self = this;
    var titleEl = document.getElementById('board-write-title-input');
    var subEl   = document.getElementById('board-write-subtitle-input');
    var titleLen = titleEl ? titleEl.value.length : 0;
    var subLen   = subEl   ? subEl.value.length   : 0;
    var tEl = document.getElementById('board-stat-title');
    var sEl = document.getElementById('board-stat-subtitle');
    if (tEl) tEl.textContent = titleLen + '자';
    if (sEl) sEl.textContent = subLen + '자';

    if (self._boardStatsTimer) clearTimeout(self._boardStatsTimer);
    self._boardStatsTimer = setTimeout(function () {
      if (!self._editor) return;
      self._editor.save().then(function (doc) {
        var plain = _plainFromBoardEditor(doc);
        var bodyLen = plain.replace(/\s+/g, '').length;
        var paragraphs = plain ? plain.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length : 0;
        var minutes = bodyLen ? Math.max(1, Math.round(bodyLen / 500)) : 0;
        var bEl = document.getElementById('board-stat-body');
        var pEl = document.getElementById('board-stat-paragraphs');
        var rEl = document.getElementById('board-stat-reading');
        if (bEl) bEl.textContent = bodyLen + '자';
        if (pEl) pEl.textContent = paragraphs + '개';
        if (rEl) rEl.textContent = minutes ? ('읽기 약 ' + minutes + '분') : '읽기 —';
        self._updateBoardSeoPreview(plain);
      }).catch(function () {});
    }, 350);
  };

  Board.prototype._updateBoardSeoPreview = function (plainBody) {
    var titleEl = document.getElementById('board-write-title-input');
    var subEl   = document.getElementById('board-write-subtitle-input');
    var tEl = document.getElementById('board-seo-title');
    var dEl = document.getElementById('board-seo-desc');
    var uEl = document.getElementById('board-seo-url');
    if (!tEl || !dEl) return;
    var rawTitle = (titleEl && titleEl.value.trim()) || '기사 제목이 여기에 표시됩니다';
    tEl.textContent = rawTitle + (rawTitle.length > 60 ? '' : ' — BP미디어');
    if (uEl) uEl.textContent = 'https://gilwell.media/post/—';
    var sub = (subEl && subEl.value.trim()) || '';
    if (sub) { dEl.textContent = sub; return; }
    var body = (plainBody != null) ? plainBody : '';
    var firstPara = body.split(/\n\s*\n/)[0] || '';
    dEl.textContent = firstPara.trim().slice(0, 140) || '부제목이 없으면 본문 첫 문단이 사용됩니다.';
  };

  Board.prototype._ensureBoardMetaTagPool = function () {
    var self = this;
    if (self._boardMetaTagPool || self._boardMetaTagPoolLoading) return;
    self._boardMetaTagPoolLoading = true;
    GW.apiFetch('/api/admin/meta-tag-pool?limit=300')
      .then(function (data) { self._boardMetaTagPool = (data && Array.isArray(data.tags)) ? data.tags : []; })
      .catch(function () { self._boardMetaTagPool = []; })
      .finally(function () { self._boardMetaTagPoolLoading = false; });
  };

  Board.prototype._renderBoardMetaSuggestions = function () {
    var self = this;
    var box = document.getElementById('board-metatag-suggestions');
    var input = document.getElementById('board-write-metatags-input');
    if (!box || !input || !self._boardMetaTagPool) { if (box) box.hidden = true; return; }
    var raw = input.value || '';
    var segments = raw.split(',');
    var current = (segments[segments.length - 1] || '').trim().toLowerCase();
    var already = segments.slice(0, -1).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    var excludeSet = {};
    already.forEach(function (s) { excludeSet[s] = true; });
    var matches = self._boardMetaTagPool
      .filter(function (t) { return t.name && !excludeSet[t.name.toLowerCase()]; })
      .filter(function (t) { return !current || t.name.toLowerCase().indexOf(current) >= 0; })
      .slice(0, 12);
    if (!matches.length) { box.hidden = true; return; }
    self._boardMetaSuggestIdx = -1;
    box.innerHTML = matches.map(function (t, i) {
      return '<div class="board-metatag-suggestion" data-idx="' + i + '" data-name="' + GW.escapeHtml(t.name) + '">' +
        '<span>' + GW.escapeHtml(t.name) + '</span>' +
        '<span class="board-metatag-suggestion-count">' + (t.count || 0) + '회</span>' +
      '</div>';
    }).join('');
    box.hidden = false;
  };

  Board.prototype._hideBoardMetaSuggestions = function () {
    var box = document.getElementById('board-metatag-suggestions');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    this._boardMetaSuggestIdx = -1;
  };

  Board.prototype._applyBoardMetaSuggestion = function (name) {
    if (!name) return;
    var input = document.getElementById('board-write-metatags-input');
    if (!input) return;
    var segments = (input.value || '').split(',');
    segments[segments.length - 1] = ' ' + name;
    input.value = segments.join(',').replace(/^\s*/, '') + ', ';
    this._hideBoardMetaSuggestions();
    input.focus();
    this._scheduleBoardDraftSave();
  };

  Board.prototype._moveBoardMetaActive = function (delta) {
    var box = document.getElementById('board-metatag-suggestions');
    if (!box || box.hidden) return;
    var items = box.querySelectorAll('.board-metatag-suggestion');
    if (!items.length) return;
    this._boardMetaSuggestIdx = ((this._boardMetaSuggestIdx || 0) + delta + items.length) % items.length;
    var idx = this._boardMetaSuggestIdx;
    items.forEach(function (el, i) { el.classList.toggle('is-active', i === idx); });
    if (items[idx] && items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' });
  };

  Board.prototype._runBoardScorer = function () {
    var self = this;
    var btn = document.getElementById('board-scorer-btn');
    var out = document.getElementById('board-scorer-result');
    var titleEl = document.getElementById('board-write-title-input');
    var subEl   = document.getElementById('board-write-subtitle-input');
    var mtEl    = document.getElementById('board-write-metatags-input');
    var title = (titleEl && titleEl.value.trim()) || '';
    if (!title) { GW.showToast('제목을 먼저 입력하세요', 'error'); return; }
    if (!self._editor) { GW.showToast('에디터가 준비되지 않았습니다', 'error'); return; }

    var origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'AI 채점 중…'; }
    if (out) {
      out.hidden = false;
      out.innerHTML = '<div class="board-scorer-loading">AI가 기사를 분석하고 있습니다… (약 10~20초)</div>';
    }

    self._editor.save().then(function (doc) {
      var body = _plainFromBoardEditor(doc);
      return GW.apiFetch('/api/admin/score-article', {
        method: 'POST',
        body: JSON.stringify({
          title: title,
          subtitle: (subEl && subEl.value.trim()) || '',
          content: body,
          tags: (mtEl && mtEl.value.trim()) || (self._selectedTags || []).join(', '),
        }),
      });
    }).then(function (data) {
      if (btn) { btn.disabled = false; btn.textContent = origLabel || '✨ 현재 기사 채점'; }
      if (data && data.ok && data.result) {
        self._renderBoardScorerResult(data.result);
      } else {
        self._renderBoardScorerError((data && data.error) || 'AI 채점 실패');
      }
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = origLabel || '✨ 현재 기사 채점'; }
      self._renderBoardScorerError('채점 요청 실패: ' + ((err && err.message) || String(err)));
    });
  };

  Board.prototype._renderBoardScorerError = function (msg) {
    var out = document.getElementById('board-scorer-result');
    if (!out) return;
    out.hidden = false;
    out.innerHTML = '<div class="board-scorer-error">' + GW.escapeHtml(msg) + '</div>';
  };

  Board.prototype._renderBoardScorerResult = function (result) {
    var out = document.getElementById('board-scorer-result');
    if (!out) return;
    var overall = result.overall || {};
    var pct = Number(overall.score || 0);
    var grade = overall.grade || '—';
    var color = pct >= 80 ? '#248737' : pct >= 60 ? '#0094B4' : '#FF5655';
    var cats = Array.isArray(result.categories) ? result.categories : [];

    var html = '<div class="board-scorer-head">' +
      '<span class="board-scorer-score" style="color:' + color + '">' + pct + ' / 100</span>' +
      ' <span class="board-scorer-grade" style="color:' + color + ';border-color:' + color + '">' + GW.escapeHtml(grade) + '</span>' +
    '</div>';
    if (overall.summary) html += '<div class="board-scorer-summary">' + GW.escapeHtml(overall.summary) + '</div>';
    html += '<div class="board-scorer-bar"><div class="board-scorer-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
    html += '<div class="board-scorer-cats">' + cats.map(function (c) {
      var cPct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
      var cColor = cPct >= 80 ? '#248737' : cPct >= 60 ? '#0094B4' : '#FF5655';
      var issues    = (c.issues || []).filter(Boolean);
      var strengths = (c.strengths || []).filter(Boolean);
      var lh = '';
      if (strengths.length) lh += '<ul class="board-scorer-list is-strength">' + strengths.map(function (s) { return '<li>' + GW.escapeHtml(s) + '</li>'; }).join('') + '</ul>';
      if (issues.length)    lh += '<ul class="board-scorer-list is-issue">' + issues.map(function (s) { return '<li>' + GW.escapeHtml(s) + '</li>'; }).join('') + '</ul>';
      return '<div class="board-scorer-cat">' +
        '<div class="board-scorer-cat-head"><span>' + GW.escapeHtml(c.label || '') + '</span>' +
        '<span style="color:' + cColor + '">' + c.score + '/' + c.max + '</span></div>' + lh +
      '</div>';
    }).join('') + '</div>';
    if (result.improvement) {
      html += '<div class="board-scorer-improvement"><strong>개선 방향</strong><p>' + GW.escapeHtml(result.improvement) + '</p></div>';
    }
    if (result.revision_suggestion) {
      html += '<div class="board-scorer-improvement board-scorer-revision">'
        + '<strong>✏️ 수정 제안 <span class="board-scorer-revision-meta">약 300자</span></strong>'
        + '<p>' + GW.escapeHtml(result.revision_suggestion) + '</p>'
        + '</div>';
    }
    out.innerHTML = html;
    out.hidden = false;
  };

  Board.prototype._bindBoardWriteAssistEventsOnce = function () {
    var self = this;
    if (self._boardAssistInited) return;
    self._boardAssistInited = true;

    // Input 변경 → stats + SEO + draft
    var watchIds = [
      'board-write-title-input', 'board-write-subtitle-input',
      'board-write-special-feature', 'board-write-author', 'board-write-date',
      'board-write-youtube-input', 'board-write-image-caption',
      'board-write-location-name', 'board-write-location-address',
      'board-write-metatags-input',
    ];
    watchIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        self._updateBoardWriteStats();
        self._updateBoardSeoPreview();
        self._scheduleBoardDraftSave();
      });
      el.addEventListener('change', function () { self._scheduleBoardDraftSave(); });
    });
    var ai = document.getElementById('board-ai-assisted');
    if (ai) ai.addEventListener('change', function () { self._scheduleBoardDraftSave(); });

    // Editor 변경 감지 (MutationObserver)
    var holder = document.getElementById('board-editorjs');
    if (holder && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        self._scheduleBoardDraftSave();
        self._updateBoardWriteStats();
      });
      obs.observe(holder, { childList: true, subtree: true, characterData: true });
    }

    // 채점 버튼
    var btn = document.getElementById('board-scorer-btn');
    if (btn) btn.addEventListener('click', function () { self._runBoardScorer(); });

    // 메타태그 자동완성
    var metaInput = document.getElementById('board-write-metatags-input');
    var metaBox = document.getElementById('board-metatag-suggestions');
    if (metaInput) {
      metaInput.addEventListener('input', function () {
        self._ensureBoardMetaTagPool();
        self._renderBoardMetaSuggestions();
      });
      metaInput.addEventListener('focus', function () {
        self._ensureBoardMetaTagPool();
        self._renderBoardMetaSuggestions();
      });
      metaInput.addEventListener('blur', function () {
        setTimeout(function () { self._hideBoardMetaSuggestions(); }, 160);
      });
      metaInput.addEventListener('keydown', function (e) {
        var box = document.getElementById('board-metatag-suggestions');
        var open = box && !box.hidden;
        if (e.key === 'ArrowDown' && open) { e.preventDefault(); self._moveBoardMetaActive(1); }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); self._moveBoardMetaActive(-1); }
        else if (e.key === 'Enter' && open && self._boardMetaSuggestIdx >= 0) {
          e.preventDefault();
          var items = box.querySelectorAll('.board-metatag-suggestion');
          var active = items[self._boardMetaSuggestIdx];
          if (active) self._applyBoardMetaSuggestion(active.getAttribute('data-name') || '');
        } else if (e.key === 'Escape' && open) {
          e.preventDefault();
          self._hideBoardMetaSuggestions();
        }
      });
    }
    if (metaBox) {
      metaBox.addEventListener('mousedown', function (e) {
        var t = e.target;
        while (t && t !== metaBox && !(t.classList && t.classList.contains('board-metatag-suggestion'))) t = t.parentNode;
        if (t && t.classList && t.classList.contains('board-metatag-suggestion')) {
          e.preventDefault();
          self._applyBoardMetaSuggestion(t.getAttribute('data-name') || '');
        }
      });
    }

    // 키보드 단축키 — write 모달 열려있을 때만
    document.addEventListener('keydown', function (e) {
      var overlay = document.getElementById('board-write-overlay');
      if (!overlay || !overlay.classList.contains('open')) return;
      var isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        self._saveDraft(true);
      } else if (e.key === 'Escape') {
        var sBox = document.getElementById('board-metatag-suggestions');
        if (sBox && !sBox.hidden) return; // 드롭다운 우선
        if (self._boardDraftDirty) {
          if (!confirm('저장하지 않은 변경사항이 있습니다. 닫을까요?')) return;
        }
        self._closeWriteForm();
      }
    });
  };

  Board.prototype._saveDraft = function (showToast) {
    var self = this;
    var key = 'gw_draft_' + this.category;
    var title = (document.getElementById('board-write-title-input') || {}).value || '';
    var subEl = document.getElementById('board-write-subtitle-input');
    var subtitle = subEl ? (subEl.value || '') : '';
    var specialFeatureEl = document.getElementById('board-write-special-feature');
    var mtEl = document.getElementById('board-write-metatags-input');
    var metaTags = mtEl ? (mtEl.value || '') : '';
    var ytEl = document.getElementById('board-write-youtube-input');
    var youtubeUrl = ytEl ? (ytEl.value || '') : '';
    var coverCaptionEl = document.getElementById('board-write-image-caption');
    var locationNameEl = document.getElementById('board-write-location-name');
    var locationAddressEl = document.getElementById('board-write-location-address');
    var authEl = document.getElementById('board-write-author');
    var dateEl = document.getElementById('board-write-date');
    var aiEl = document.getElementById('board-ai-assisted');
    var saving = {
      title: title,
      subtitle: subtitle,
      special_feature: specialFeatureEl ? (specialFeatureEl.value || '') : '',
      meta_tags: metaTags,
      youtube_url: youtubeUrl,
      image_caption: coverCaptionEl ? (coverCaptionEl.value || '') : '',
      location_name: locationNameEl ? (locationNameEl.value || '') : '',
      location_address: locationAddressEl ? (locationAddressEl.value || '') : '',
      author: authEl ? (authEl.value || '') : '',
      publish_at: dateEl ? GW.normalizePublishAtValue(dateEl.value || '') : '',
      ai_assisted: aiEl ? !!aiEl.checked : false,
      image_url: self._coverImage || null,
      gallery_images: self._galleryImages || [],
      tags: self._selectedTags || [],
    };

    function storeSaving() {
      localStorage.setItem(key, JSON.stringify(saving));
      if (showToast) GW.showToast('임시저장됐습니다', 'success');
    }

    if (self._editor) {
      return self._editor.save().then(function (d) {
        saving.editorData = d;
        storeSaving();
      }).catch(function () {
        if (showToast) GW.showToast('임시저장 실패', 'error');
      });
    }
    storeSaving();
    return Promise.resolve();
  };

  Board.prototype._startDraftAutosave = function () {
    var self = this;
    this._draftTimer = setInterval(function () {
      var title = (document.getElementById('board-write-title-input') || {}).value || '';
      var subtitle = ((document.getElementById('board-write-subtitle-input') || {}).value || '');
      if (!title && !subtitle) return;
      self._saveDraft(false);
    }, 30000);
  };

  Board.prototype._stopDraftAutosave = function () {
    if (this._draftTimer) {
      clearInterval(this._draftTimer);
      this._draftTimer = null;
    }
  };

  Board.prototype._renderCoverPreview = function () {
    var self = this;
    var preview = document.getElementById('board-cover-preview');
    if (!preview) return;
    if (!self._coverImage) {
      preview.innerHTML = '';
      return;
    }
    preview.innerHTML =
      '<img src="' + self._coverImage + '" class="cover-preview-img">' +
      '<button type="button" class="cover-remove-btn" id="board-cover-remove">× 제거</button>';
    document.getElementById('board-cover-remove').addEventListener('click', function () {
      self._coverImage = null;
      preview.innerHTML = '';
    });
  };

  Board.prototype._renderGalleryPreview = function () {
    var self = this;
    var preview = document.getElementById('board-gallery-preview');
    var counter = document.getElementById('board-gallery-count');
    if (counter) counter.textContent = String(self._galleryImages.length) + '/10';
    if (!preview) return;
    if (!self._galleryImages.length) {
      preview.innerHTML = '<p class="gallery-upload-empty">슬라이드 전용 이미지를 올리면 기사 하단에서만 별도 슬라이드로 노출됩니다.</p>';
      return;
    }
    preview.innerHTML = self._galleryImages.map(function (item, index) {
      return '<div class="gallery-upload-item">' +
        '<img src="' + item.url + '" class="gallery-upload-thumb" alt="슬라이드 이미지 ' + (index + 1) + '">' +
        '<button type="button" class="gallery-upload-remove" data-index="' + index + '">제거</button>' +
      '</div>';
    }).join('');
    preview.querySelectorAll('.gallery-upload-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var index = parseInt(btn.getAttribute('data-index') || '-1', 10);
        if (!Number.isFinite(index) || index < 0) return;
        self._galleryImages.splice(index, 1);
        self._renderGalleryPreview();
      });
    });
  };

  Board.prototype._parseGallerySeed = function (raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.slice(0, 10);
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch (_) {
      return [];
    }
  };
})();
