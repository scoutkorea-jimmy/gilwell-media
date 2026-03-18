/**
 * Gilwell Media · Bulletin Board Component
 * Depends on GW namespace from js/main.js.
 *
 * Usage:
 *   const board = new GW.Board({ category: 'korea', gridId: 'board-grid' });
 *   board.init();
 */
(function () {
  'use strict';

  /**
   * @param {object} opts
   * @param {string} opts.category   - page category key
   * @param {string|null} [opts.apiCategory] - actual API category filter
   * @param {boolean} [opts.enableWrite] - whether to expose write UI
   * @param {object} [opts.extraParams] - extra query params for public list/tag calls
   * @param {string} [opts.gridId]   - id of the grid container element
   * @param {string} [opts.countId]  - id of the post-count element
   * @param {string} [opts.moreId]   - id of the "load more" button
   * @param {string} [opts.modalId]  - id of the modal overlay element
   */
  function Board(opts) {
    this.category = opts.category;
    this.apiCategory = Object.prototype.hasOwnProperty.call(opts, 'apiCategory') ? opts.apiCategory : opts.category;
    this.enableWrite = opts.enableWrite !== false;
    this.extraParams = opts.extraParams || {};
    this.gridEl   = document.getElementById(opts.gridId   || 'board-grid');
    this.countEl  = document.getElementById(opts.countId  || 'board-count');
    this.bannerTotalEl = document.getElementById(opts.bannerTotalId || 'board-banner-total');
    this.paginationEl = document.getElementById(opts.paginationId || 'board-pagination');
    this.modalEl  = document.getElementById(opts.modalId  || 'post-modal');
    this.bannerInfo = { event_name: '', event_date: '' };

    this.page          = 1;
    this.pageSize      = 16;
    this.totalPages    = 1;
    this.total         = 0;
    this.loading       = false;
    this._searchQuery  = '';
    this._selectedTag  = null;
    this._loginTurnstileWidgetId = null;
    this._loginTurnstileToken = '';
  }

  Board.prototype._getPageSize = function () {
    return window.innerWidth <= 640 ? 20 : 16;
  };

  // ── Initialise ────────────────────────────────────────────
  Board.prototype.init = function () {
    var self = this;
    this.pageSize = this._getPageSize();
    GW.setMastheadDate();
    GW.markActiveNav();
    this._setupModal();
    if (this.enableWrite) this._setupWriteFeature();
    this._setupSearch();
    this._loadBoardLayout();
    this._loadBoardBannerInfo();
    this._load();
    this._loadTagBar();
    window.addEventListener('resize', function () {
      var nextPageSize = self._getPageSize();
      if (nextPageSize === self.pageSize) return;
      self.pageSize = nextPageSize;
      self._resetAndLoad();
    });
  };

  Board.prototype._loadBoardLayout = function () {
    var self = this;
    fetch('/api/settings/board-layout', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var gap = parseInt(data && data.gap_px, 10);
        if (!Number.isFinite(gap)) gap = 6;
        gap = Math.min(40, Math.max(5, gap));
        if (self.gridEl) {
          self.gridEl.style.gap = gap + 'px';
          self.gridEl.style.marginTop = gap + 'px';
        }
      })
      .catch(function () {});
  };

  Board.prototype._loadBoardBannerInfo = function () {
    var self = this;
    fetch('/api/settings/board-banner', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = data && data.items ? data.items : {};
        var item = items[self.category] || {};
        self.bannerInfo = {
          event_name: String(item.event_name || '').trim(),
          event_date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.event_date || '').trim()) ? String(item.event_date).trim() : '',
        };
        self._updateCount();
      })
      .catch(function () {});
  };

  // ── Tag filter bar ────────────────────────────────────────
  Board.prototype._loadTagBar = function () {
    var self  = this;
    var barEl = document.getElementById('tag-filter-bar');
    if (!barEl) return;

    var url = '/api/posts/tags';
    var params = [];
    if (this.apiCategory) params.push('category=' + encodeURIComponent(this.apiCategory));
    Object.keys(this.extraParams).forEach(function (key) {
      var value = self.extraParams[key];
      if (value === null || value === undefined || value === '') return;
      params.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    });
    if (params.length) url += '?' + params.join('&');
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var tags = data.tags || [];
        if (!tags.length) return;

        var html = '<div class="tag-filter-bar-inner"><button class="tag-filter-btn active" data-tag="">전체</button>';
        tags.forEach(function (t) {
          html += '<button class="tag-filter-btn" data-tag="' + GW.escapeHtml(t) + '">' + GW.escapeHtml(t) + '</button>';
        });
        html += '</div>';
        barEl.innerHTML = html;

        barEl.querySelectorAll('.tag-filter-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            barEl.querySelectorAll('.tag-filter-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            self._selectedTag = btn.dataset.tag || null;
            self._resetAndLoad();
          });
        });
      })
      .catch(function () {});
  };

  Board.prototype._resetAndLoad = function () {
    this.page    = 1;
    this.total   = 0;
    this.totalPages = 1;
    this.loading = false;
    this.gridEl.innerHTML = '';
    if (this.paginationEl) this.paginationEl.innerHTML = '';
    this._load();
  };

  // ── Load posts from API ───────────────────────────────────
  Board.prototype._load = function () {
    if (this.loading) return;
    var self = this;
    this.loading = true;
    this._showLoading();
    this.pageSize = this._getPageSize();

    var searchParam = this._searchQuery ? '&q=' + encodeURIComponent(this._searchQuery) : '';
    var tagParam    = this._selectedTag  ? '&tag=' + encodeURIComponent(this._selectedTag)  : '';
    var endpoint = '/api/posts?page=' + this.page + '&limit=' + this.pageSize + searchParam + tagParam;
    if (this.apiCategory) endpoint += '&category=' + encodeURIComponent(this.apiCategory);
    Object.keys(this.extraParams).forEach(function (key) {
      var value = self.extraParams[key];
      if (value === null || value === undefined || value === '') return;
      endpoint += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(String(value));
    });
    GW.apiFetch(endpoint)
      .then(function (data) {
        self.total   = data.total;
        self.pageSize = data.pageSize || self.pageSize || 16;
        self.totalPages = Math.max(1, Math.ceil(self.total / self.pageSize));
        self._renderPosts(data.posts);
        self._updateCount();
        self._renderPagination();
      })
      .catch(function (err) {
        console.error(err);
        self._showError();
      })
      .finally(function () {
        self.loading = false;
      });
  };

  // ── Render cards ──────────────────────────────────────────
  Board.prototype._renderPosts = function (posts) {
    var self = this;
    this.gridEl.innerHTML = '';

    if (posts.length === 0) {
      this._showEmpty();
      return;
    }

    posts.forEach(function (post, i) {
      var card = self._buildCard(post, i);
      self.gridEl.appendChild(card);
    });
  };

  Board.prototype._renderPagination = function () {
    var self = this;
    if (!this.paginationEl) return;
    if (this.totalPages <= 1) {
      this.paginationEl.innerHTML = '';
      return;
    }

    var currentPage = this.page;
    var totalPages = this.totalPages;
    var start = Math.max(1, currentPage - 2);
    var end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    var html = '';

    if (currentPage > 1) {
      html += '<button type="button" class="board-page-btn board-page-nav" data-page="' + (currentPage - 1) + '">이전</button>';
    }
    for (var page = start; page <= end; page++) {
      html += '<button type="button" class="board-page-btn' + (page === currentPage ? ' active' : '') + '" data-page="' + page + '">[' + page + ']</button>';
    }
    if (currentPage < totalPages) {
      html += '<button type="button" class="board-page-btn board-page-nav" data-page="' + (currentPage + 1) + '">다음</button>';
    }
    this.paginationEl.innerHTML = html;
    this.paginationEl.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nextPage = parseInt(btn.getAttribute('data-page') || '1', 10);
        if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === currentPage) return;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        self.page = nextPage;
        self._load();
      });
    });
  };

  Board.prototype._buildCard = function (post, idx) {
    var self    = this;
    var cat     = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var card    = document.createElement('article');
    card.className = 'post-card' + (post.image_url ? ' has-thumb' : ' no-thumb');
    card.style.animationDelay = (0.04 + idx * 0.04) + 's';

    var thumb = '';
    if (post.image_url) {
      thumb = '<img class="post-card-thumb" src="' + GW.escapeHtml(post.image_url)
            + '" alt="" loading="lazy">';
    }

    var isNew = GW.isPostNew(post);
    var shareHtml = '<div class="post-card-share-row"><button class="post-share-btn post-card-share-btn" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button></div>';
    var tagHtml = (isNew ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
      (post.tag ? post.tag.split(',').map(function(t){ t = t.trim(); return t ? '<span class="post-kicker ' + cat.tagClass + '-kicker">' + GW.escapeHtml(t) + '</span>' : ''; }).join('') : '');

    var labelsHtml = tagHtml || ('<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>');
    var subtitleHtml = post.subtitle
      ? '<p class="post-card-subtitle">' + GW.escapeHtml(post.subtitle) + '</p>'
      : '';

    card.innerHTML =
      thumb +
      '<div class="post-card-body">' +
        '<div class="post-card-head">' +
          '<div class="post-card-labels">' + labelsHtml + '</div>' +
          '<h3>' + GW.escapeHtml(post.title) + '</h3>' +
        '</div>' +
        subtitleHtml +
        '<p class="post-card-excerpt">' + GW.escapeHtml(GW.truncate(post.content || '', 140)) + '</p>' +
        shareHtml +
        '<div class="post-card-engagement">공감 ' + GW.formatNumber(post.likes || 0) + '</div>' +
        '<div class="post-card-meta">' +
          GW.formatPostDate(post) +
          (post.author ? ' &nbsp;·&nbsp; <span class="post-author">' + GW.escapeHtml(post.author) + '</span>' : '') +
          ' &nbsp;<a class="post-permalink" href="/post/' + post.id + '" title="개별 페이지로 이동">↗</a>' +
        '</div>' +
      '</div>';

    card.addEventListener('click', function (e) {
      if (e.target.classList.contains('post-permalink')) return;
      if (e.target.classList.contains('post-card-share-btn')) return;
      window.location.href = '/post/' + post.id;
    });
    var shareBtn = card.querySelector('.post-card-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var url = new URL('/post/' + post.id, window.location.origin).toString();
        GW.sharePostLink({ url: url, title: post.title, text: post.title })
          .catch(function (err) {
            GW.showToast((err && err.message) || '링크 공유에 실패했습니다', 'error');
          });
      });
    }
    return card;
  };

  // ── Post detail modal ─────────────────────────────────────
  Board.prototype._setupModal = function () {
    var self = this;
    if (!this.modalEl) return;

    this.modalEl.addEventListener('click', function (e) {
      if (e.target === self.modalEl) self._closePost();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') self._closePost();
    });
  };

  Board.prototype._openPost = function (id) {
    var self = this;
    if (!this.modalEl) return;

    var inner = this.modalEl.querySelector('.modal');
    if (inner) {
      inner.innerHTML =
        '<button class="modal-close" onclick="document.getElementById(\'post-modal\').classList.remove(\'open\')">×</button>' +
        '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    }
    this.modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';

    GW.apiFetch('/api/posts/' + id)
      .then(function (data) { self._renderModal(data.post); })
      .catch(function () {
        if (inner) {
          inner.innerHTML =
            '<button class="modal-close" onclick="document.getElementById(\'post-modal\').classList.remove(\'open\')">×</button>' +
            '<div class="error-state">게시글을 불러오지 못했습니다.</div>';
        }
      });
  };

  Board.prototype._renderModal = function (post) {
    var self  = this;
    var cat   = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var inner = this.modalEl.querySelector('.modal');
    if (!inner) return;

    var imgHtml = '';
    if (post.image_url) {
      imgHtml = '<div class="modal-image-frame"><img class="modal-img" src="' + GW.escapeHtml(post.image_url) + '" alt="' + GW.escapeHtml(post.title || '') + '"></div>' +
        GW.buildImageCaption(post.image_caption);
    }
    var youtubeHtml = GW.buildYouTubeEmbed(post.youtube_url, post.title);

    var modalTagHtml = (GW.isPostNew(post) ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
      (post.tag ? post.tag.split(',').map(function(t){ t = t.trim(); return t ? '<span class="post-kicker ' + cat.tagClass + '-kicker">' + GW.escapeHtml(t) + '</span>' : ''; }).join('') : '');

    var subtitleHtml = post.subtitle
      ? '<p class="modal-subtitle">' + GW.escapeHtml(post.subtitle) + '</p>'
      : '';
    var relatedHtml = buildRelatedPostsHtml(post.related_posts);

    inner.innerHTML =
      '<button class="modal-close" id="modal-close-btn" aria-label="닫기">×</button>' +
      '<div class="modal-header">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
          '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
          modalTagHtml +
        '</div>' +
        '<h2>' + GW.escapeHtml(post.title) + '</h2>' +
        subtitleHtml +
        '<div class="modal-date">' + GW.formatPostDate(post) + '</div>' +
      '</div>' +
      imgHtml +
      youtubeHtml +
      '<div class="modal-body">' + GW.renderText(post.content) + '</div>' +
      relatedHtml +
      '<div class="post-byline">' +
        (post.author ? '<span class="post-byline-author">작성자 · ' + GW.escapeHtml(post.author) + '</span>' : '') +
        '<span class="post-byline-report">오류제보 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a></span>' +
      '</div>';

    inner.querySelector('#modal-close-btn').addEventListener('click', function () {
      self._closePost();
    });
  };

  Board.prototype._closePost = function () {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('open');
    document.body.style.overflow = '';
  };

  function buildRelatedPostsHtml(items) {
    if (!Array.isArray(items) || !items.length) return '';
    return '<section class="modal-related-posts">' +
      '<h3 class="post-related-heading">유관기사 읽어보기</h3>' +
      '<ul class="post-related-list">' +
        items.map(function (item) {
          var category = GW.CATEGORIES[item.category] || GW.CATEGORIES.korea;
          return '<li><a href="/post/' + item.id + '">[' + GW.escapeHtml(category.label) + '] ' + GW.escapeHtml(item.title || '') + '</a></li>';
        }).join('') +
      '</ul>' +
    '</section>';
  }

  // ── State displays ────────────────────────────────────────
  Board.prototype._showLoading = function () {
    this.gridEl.innerHTML =
      '<div class="loading-state">' +
        '<div class="loading-dots"><span></span><span></span><span></span></div>' +
      '</div>';
  };

  Board.prototype._showEmpty = function () {
    this.gridEl.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;">' +
        '<span class="empty-icon">◌</span>' +
        '<p>아직 게시된 글이 없습니다.<br>관리자가 첫 번째 글을 올릴 예정입니다.</p>' +
      '</div>';
  };

  Board.prototype._showError = function () {
    if (this.page === 1) {
      this.gridEl.innerHTML =
        '<div class="error-state" style="grid-column:1/-1;">게시글을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
    }
  };

  Board.prototype._updateCount = function () {
    if (this.countEl) this.countEl.textContent = '총 ' + this.total + '개';
    if (!this.bannerTotalEl) return;

    var eventName = this.bannerInfo && this.bannerInfo.event_name;
    var eventDate = this.bannerInfo && this.bannerInfo.event_date;
    var dday = getDdayLabel(eventDate);
    if (eventName && dday) {
      this.bannerTotalEl.classList.add('has-event');
      this.bannerTotalEl.innerHTML =
        '<div class="board-banner-total-label">' + GW.escapeHtml(eventName) + '</div>' +
        '<div class="board-banner-total-value">' + GW.escapeHtml(dday) + '</div>';
      return;
    }

    this.bannerTotalEl.classList.remove('has-event');
    this.bannerTotalEl.textContent = this.total + '개';
  };

  function getDdayLabel(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '';
    var parts = dateStr.split('-').map(function (part) { return parseInt(part, 10); });
    var targetUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    if (!Number.isFinite(targetUtc)) return '';
    var now = new Date();
    var kstText = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    var currentParts = kstText.split('-').map(function (part) { return parseInt(part, 10); });
    var todayUtc = Date.UTC(currentParts[0], currentParts[1] - 1, currentParts[2]);
    var diff = Math.round((targetUtc - todayUtc) / 86400000);
    if (diff === 0) return 'D-Day';
    return diff > 0 ? 'D-' + diff : 'D+' + Math.abs(diff);
  }

  // ── Write Feature ─────────────────────────────────────────
  Board.prototype._setupWriteFeature = function () {
    var self = this;
    var cat  = GW.CATEGORIES[this.category] || GW.CATEGORIES.korea;

    // Inject write button
    var textEl = document.querySelector('.board-banner-text');
    if (textEl) {
      var btn = document.createElement('button');
      btn.className   = 'write-btn';
      btn.textContent = '✏ 글쓰기';
      btn.addEventListener('click', function () { self._showPasswordModal(); });
      textEl.appendChild(btn);
    }

    // ── Password modal ──────────────────────────────────────
    var pwOverlay = document.createElement('div');
    pwOverlay.id        = 'board-pw-overlay';
    pwOverlay.className = 'board-pw-overlay';
    pwOverlay.innerHTML =
      '<div class="board-pw-box">' +
        '<div class="board-pw-header">글쓰기</div>' +
        '<p class="board-pw-desc">관리자 비밀번호를 입력하세요</p>' +
        '<input type="password" id="board-pw-input" placeholder="비밀번호" autocomplete="current-password" />' +
        '<div id="board-pw-turnstile" style="margin:12px 0;"></div>' +
        '<div id="board-pw-error" class="board-pw-error">관리자만 글을 쓸 수 있습니다</div>' +
        '<div class="board-pw-actions">' +
          '<button id="board-pw-submit">확인</button>' +
          '<button id="board-pw-cancel">취소</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pwOverlay);

    document.getElementById('board-pw-submit').addEventListener('click', function () { self._checkPassword(); });
    document.getElementById('board-pw-cancel').addEventListener('click', function () { self._closePasswordModal(); });
    document.getElementById('board-pw-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  self._checkPassword();
      if (e.key === 'Escape') self._closePasswordModal();
    });
    pwOverlay.addEventListener('click', function (e) {
      if (e.target === pwOverlay) self._closePasswordModal();
    });

    // ── Write form modal (Editor.js) ────────────────────────
    var writeOverlay = document.createElement('div');
    writeOverlay.id        = 'board-write-overlay';
    writeOverlay.className = 'board-write-overlay';
    writeOverlay.innerHTML =
      '<div class="board-write-box" role="dialog" aria-modal="true" aria-labelledby="board-write-heading">' +
        '<button class="board-write-close" id="board-write-close" aria-label="닫기">×</button>' +
        '<div class="board-write-header" id="board-write-heading">새 게시글 작성</div>' +
        '<span class="board-write-cat" style="background:' + cat.color + '">' + cat.label + '</span>' +
        '<div class="form-group" style="margin-top:20px;">' +
          '<label for="board-write-title-input">제목 *</label>' +
          '<input type="text" id="board-write-title-input" placeholder="게시글 제목을 입력하세요" maxlength="200" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="board-write-subtitle-input">부제목</label>' +
          '<input type="text" id="board-write-subtitle-input" placeholder="부제목을 입력하세요 (선택)" maxlength="300" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="board-write-special-feature">특집 기사 묶음명</label>' +
          '<input type="text" id="board-write-special-feature" placeholder="예: 세계잼버리 리더십 특집 (선택)" maxlength="120" />' +
        '</div>' +
        '<div style="display:flex;gap:12px;">' +
          '<div class="form-group" style="flex:1;">' +
            '<label for="board-write-author">작성자</label>' +
            '<select id="board-write-author" style="padding:9px 12px;border:1px solid var(--border);font-family: AliceDigitalLearning, sans-serif;font-size:12px;outline:none;background:var(--bg);color:var(--ink);width:100%;"><option>불러오는 중…</option></select>' +
          '</div>' +
          '<div class="form-group" style="min-width:140px;">' +
            '<label for="board-write-date">퍼블리싱 시각</label>' +
            '<input type="datetime-local" id="board-write-date" class="admin-control-input board-write-datetime" />' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>글머리 태그</label>' +
          '<div id="board-tag-selector" class="tag-pill-group"><span style="font-size:11px;color:var(--muted);">불러오는 중…</span></div>' +
          '<div class="public-tag-add-tools">' +
            '<input type="text" id="board-tag-new-input" maxlength="30" placeholder="현재 카테고리에 새 태그 추가" />' +
            '<button type="button" id="board-tag-new-btn" class="public-inline-tag-add">태그 추가</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>대표 이미지</label>' +
          '<div id="board-cover-wrap" class="cover-upload-wrap">' +
            '<button type="button" id="board-cover-btn" class="cover-upload-btn">📷 대표 이미지 선택</button>' +
            '<div id="board-cover-preview"></div>' +
          '</div>' +
          '<input type="text" id="board-write-image-caption" placeholder="사진 출처 또는 캡션 (선택)" maxlength="300" style="margin-top:10px;" />' +
          '<p style="font-size:10px;color:var(--muted);font-family: AliceDigitalLearning, sans-serif;margin-top:6px;">대표 사진 아래에 출처 또는 캡션으로 표기됩니다. 본문 이미지는 각 이미지 캡션에 같은 형식으로 표기됩니다.</p>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="board-write-youtube-input">유튜브 영상 링크</label>' +
          '<input type="url" id="board-write-youtube-input" placeholder="https://www.youtube.com/watch?v=..." maxlength="300" />' +
          '<p style="font-size:10px;color:var(--muted);font-family: AliceDigitalLearning, sans-serif;margin-top:6px;">선택 입력입니다. YouTube / youtu.be 링크를 넣으면 기사 페이지와 뷰어에 영상이 표시됩니다.</p>' +
        '</div>' +
        '<div class="form-group">' +
          '<label>본문 * <span style="font-size:10px;color:var(--muted);font-family: AliceDigitalLearning, sans-serif;">(이미지 최대 5개)</span></label>' +
          '<div id="board-editorjs" class="board-editorjs-wrap"></div>' +
        '</div>' +
        '<div class="form-group" style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px;">' +
          '<label for="board-write-metatags-input">SEO 해시태그 <span style="font-size:10px;color:var(--muted);font-family: AliceDigitalLearning, sans-serif;">(쉼표로 구분 · comma-separated)</span></label>' +
          '<input type="text" id="board-write-metatags-input" placeholder="예: 스카우트, 잼버리, WOSM, 세계스카우트" maxlength="500" />' +
          '<p style="font-size:10px;color:var(--muted);font-family: AliceDigitalLearning, sans-serif;margin-top:6px;">검색엔진 최적화를 위한 키워드입니다. 각 게시글의 메타 태그로 사용됩니다.</p>' +
        '</div>' +
        '<div class="form-group" style="display:flex;align-items:center;gap:10px;margin-top:8px;">' +
          '<input type="checkbox" id="board-ai-assisted" style="width:auto;margin:0;" />' +
          '<label for="board-ai-assisted" style="margin:0;cursor:pointer;font-family: AliceDigitalLearning, sans-serif;font-size:11px;color:var(--muted);">AI 지원 여부</label>' +
        '</div>' +
        '<div id="board-write-turnstile" style="margin:20px 0 0;"></div>' +
        '<button id="board-write-submit" class="submit-btn" style="margin-top:12px;">게재하기</button>' +
        '<button id="board-write-savedraft" class="cancel-btn visible" style="margin-left:8px;">💾 임시저장</button>' +
        '<button id="board-write-cancel" class="cancel-btn visible">취소</button>' +
      '</div>';
    document.body.appendChild(writeOverlay);

    document.getElementById('board-write-close').addEventListener('click',  function () { self._closeWriteForm(); });
    document.getElementById('board-write-cancel').addEventListener('click', function () { self._closeWriteForm(); });
    document.getElementById('board-write-submit').addEventListener('click', function () { self._submitPost(); });
    document.getElementById('board-cover-btn').addEventListener('click', function () { self._uploadCoverImage(); });
    document.getElementById('board-tag-new-btn').addEventListener('click', function () { self._addWriteTag(); });
    document.getElementById('board-tag-new-input').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        self._addWriteTag();
      }
    });
    document.getElementById('board-write-savedraft').addEventListener('click', function () {
      var title    = (document.getElementById('board-write-title-input') || {}).value || '';
      var subEl    = document.getElementById('board-write-subtitle-input');
      var subtitle = subEl ? (subEl.value || '') : '';
      var specialFeatureEl = document.getElementById('board-write-special-feature');
      var mtEl     = document.getElementById('board-write-metatags-input');
      var metaTags = mtEl ? (mtEl.value || '') : '';
      var ytEl     = document.getElementById('board-write-youtube-input');
      var youtubeUrl = ytEl ? (ytEl.value || '') : '';
      var coverCaptionEl = document.getElementById('board-write-image-caption');
      var authEl   = document.getElementById('board-write-author');
      var dateEl   = document.getElementById('board-write-date');
      var aiEl     = document.getElementById('board-ai-assisted');
      var key = 'gw_draft_' + self.category;
      var saving = {
        title: title,
        subtitle: subtitle,
        special_feature: specialFeatureEl ? (specialFeatureEl.value || '') : '',
        meta_tags: metaTags,
        youtube_url: youtubeUrl,
        image_caption: coverCaptionEl ? (coverCaptionEl.value || '') : '',
        author: authEl ? (authEl.value || '') : '',
        publish_at: dateEl ? GW.normalizePublishAtValue(dateEl.value || '') : '',
        ai_assisted: aiEl ? !!aiEl.checked : false,
        image_url: self._coverImage || null,
        tags: self._selectedTags || [],
      };
      if (self._editor) {
        self._editor.save().then(function(d) {
          saving.editorData = d;
          localStorage.setItem(key, JSON.stringify(saving));
          GW.showToast('임시저장됐습니다', 'success');
        }).catch(function() {
          GW.showToast('임시저장 실패', 'error');
        });
      } else {
        localStorage.setItem(key, JSON.stringify(saving));
        GW.showToast('임시저장됐습니다', 'success');
      }
    });
    writeOverlay.addEventListener('click', function (e) {
      if (e.target === writeOverlay) self._closeWriteForm();
    });
  };

  // ── Tag pill sync helper ──────────────────────────────────
  function _syncBoardTagPills(sel, selectedTags) {
    sel.querySelectorAll('.tag-pill').forEach(function (b) {
      var t = b.dataset.tag || '';
      if (t === '') {
        b.classList.toggle('active', selectedTags.length === 0);
      } else {
        b.classList.toggle('active', selectedTags.indexOf(t) >= 0);
      }
    });
  }

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
        _syncBoardTagPills(sel, self._selectedTags);
      });
    });
    _syncBoardTagPills(sel, self._selectedTags);
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

  // ── Board search ──────────────────────────────────────────
  Board.prototype._setupSearch = function () {
    var self = this;
    var container = document.querySelector('.board-container');
    if (!container) return;

    var wrap = document.createElement('div');
    wrap.className = 'board-search-wrap';
    wrap.innerHTML =
      '<div class="board-search-inner">' +
        '<input type="text" id="board-search-input" class="board-search-input" placeholder="이 게시판에서 검색…" autocomplete="off" />' +
        '<button class="board-search-clear" id="board-search-clear" style="display:none;">✕</button>' +
      '</div>';
    container.insertBefore(wrap, container.firstChild);

    var input  = document.getElementById('board-search-input');
    var clear  = document.getElementById('board-search-clear');
    var timer  = null;

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clear.style.display = q ? 'block' : 'none';
      clearTimeout(timer);
      timer = setTimeout(function () { self._search(q); }, 350);
    });

    clear.addEventListener('click', function () {
      input.value = '';
      clear.style.display = 'none';
      self._search('');
    });
  };

  Board.prototype._search = function (q) {
    this._searchQuery = q;
    this.page    = 1;
    this.total   = 0;
    this.totalPages = 1;
    this.loading = false;
    this.gridEl.innerHTML = '';
    this._load();
  };

  // ── Editor.js loader ──────────────────────────────────────
  Board.prototype._loadEditorJs = function (callback) {
    if (window.EditorJS) { callback(); return; }

    function loadScript(src, cb) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      document.head.appendChild(s);
    }

    // Load core first, then 3 tools in parallel
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
      var pending = 3;
      function done() { if (--pending === 0) callback(); }
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js',   done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js',  done);
    });
  };

  Board.prototype._initEditorJs = function () {
    if (this._editor) return;
    var self = this;

    this._editor = new window.EditorJS({
      holder:      'board-editorjs',
      placeholder: '내용을 작성하세요...',
      tools: {
        header: {
          class:  window.Header,
          config: { levels: [2, 3, 4], defaultLevel: 2 },
        },
        list: {
          class:    window.List,
          inlineToolbar: true,
        },
        quote: {
          class:         window.Quote,
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
    document.getElementById('board-pw-input').value             = '';
    document.getElementById('board-pw-error').style.display     = 'none';
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
    var self      = this;
    var input     = document.getElementById('board-pw-input');
    var submitBtn = document.getElementById('board-pw-submit');
    var error     = document.getElementById('board-pw-error');
    var pw        = (input.value || '').trim();
    if (!pw) return;
    if (GW.TURNSTILE_SITE_KEY && !this._loginTurnstileToken) {
      error.textContent = 'CAPTCHA를 완료해주세요';
      error.style.display = 'block';
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = '확인 중…';
    error.style.display   = 'none';

    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body:   JSON.stringify({
        password: pw,
        cf_turnstile_response: this._loginTurnstileToken || undefined,
      }),
    })
      .then(function (data) {
        GW.setToken(data.token);
        self._closePasswordModal();
        self._showWriteForm();
      })
      .catch(function (err) {
        error.textContent = err && err.message ? err.message : '관리자만 글을 쓸 수 있습니다';
        error.style.display = 'block';
        input.value = '';
        input.focus();
        self._loginTurnstileToken = '';
        if (window.turnstile && self._loginTurnstileWidgetId != null) {
          window.turnstile.reset(self._loginTurnstileWidgetId);
        }
      })
      .finally(function () {
        submitBtn.disabled    = false;
        submitBtn.textContent = '확인';
      });
  };

  Board.prototype._uploadCoverImage = function () {
    var self  = this;
    var input = document.createElement('input');
    input.type   = 'file';
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

  Board.prototype._showWriteForm = function () {
    var self    = this;
    var overlay = document.getElementById('board-write-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Reset selections
    self._selectedTags  = [];
    self._coverImage    = null;
    self._turnstileToken = '';
    var coverCaptionEl = document.getElementById('board-write-image-caption');
    if (coverCaptionEl) coverCaptionEl.value = '';
    self._renderCoverPreview();
    var aiChk = document.getElementById('board-ai-assisted');
    if (aiChk) aiChk.checked = false;

    // Load editors for author select (requires auth — real names are private)
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

    // Default date to today (reset on every open)
    var dateEl = document.getElementById('board-write-date');
    if (dateEl) dateEl.value = GW.getKstDateTimeInputValue();

    self._loadWriteTagOptions();

    this._loadEditorJs(function () {
      // Destroy previous instance before creating a new one
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

      // Check for draft
      var draftKey = 'gw_draft_' + self.category;
      var draftStr = localStorage.getItem(draftKey);
      if (draftStr) {
        try {
          var draft = JSON.parse(draftStr);
          if (draft && (draft.title || draft.editorData)) {
            if (confirm('저장된 임시 글이 있습니다. 불러올까요?')) {
              if (draft.title) document.getElementById('board-write-title-input').value = draft.title;
              var sub2 = document.getElementById('board-write-subtitle-input');
              if (sub2 && draft.subtitle) sub2.value = draft.subtitle;
              var sf2 = document.getElementById('board-write-special-feature');
              if (sf2 && draft.special_feature) sf2.value = draft.special_feature;
              var mt2 = document.getElementById('board-write-metatags-input');
              if (mt2 && draft.meta_tags) mt2.value = draft.meta_tags;
              var yt2 = document.getElementById('board-write-youtube-input');
              if (yt2 && draft.youtube_url) yt2.value = draft.youtube_url;
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
              var tagSel = document.getElementById('board-tag-selector');
              if (tagSel) _syncBoardTagPills(tagSel, self._selectedTags);
              // If editorData exists, render it into the editor after a short delay
              if (draft.editorData && self._editor) {
                self._editor.render(draft.editorData).catch(function(){});
              }
            }
          }
        } catch(e) { localStorage.removeItem(draftKey); }
      }

      setTimeout(function () { document.getElementById('board-write-title-input').focus(); }, 100);
    });

    // Load Turnstile widget for post submission
    GW.loadTurnstile(function () {
      if (window.turnstile && GW.TURNSTILE_SITE_KEY) {
        if (self._turnstileWidgetId == null) {
          // First open: render and store widget ID
          self._turnstileWidgetId = window.turnstile.render('#board-write-turnstile', {
            sitekey: GW.TURNSTILE_SITE_KEY,
            theme: 'light',
            callback: function (token) { self._turnstileToken = token; },
            'expired-callback': function () { self._turnstileToken = ''; },
          });
        } else {
          // Subsequent opens: reset token only, widget DOM stays
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
    var self      = this;
    var title     = (document.getElementById('board-write-title-input').value || '').trim();
    var subEl     = document.getElementById('board-write-subtitle-input');
    var subtitle  = subEl ? (subEl.value || '').trim() : '';
    var specialFeatureEl = document.getElementById('board-write-special-feature');
    var mtEl      = document.getElementById('board-write-metatags-input');
    var metaTags  = mtEl ? (mtEl.value || '').trim() : '';
    var ytEl      = document.getElementById('board-write-youtube-input');
    var youtubeUrl = ytEl ? (ytEl.value || '').trim() : '';
    var coverCaptionEl = document.getElementById('board-write-image-caption');
    var submitBtn = document.getElementById('board-write-submit');

    if (!title) { GW.showToast('제목을 입력해주세요', 'error'); return; }
    if (!this._editor) { GW.showToast('에디터가 준비되지 않았습니다', 'error'); return; }
    if (GW.TURNSTILE_SITE_KEY && !this._turnstileToken) {
      GW.showToast('CAPTCHA를 완료해주세요', 'error'); return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = '게재 중…';

    this._editor.save()
      .then(function (outputData) {
        var validation = GW.validatePostEditorOutput(outputData);
        if (!validation.ok) {
          GW.showToast(validation.error, 'error');
          submitBtn.disabled    = false;
          submitBtn.textContent = '게재하기';
          return;
        }

        var content = JSON.stringify(outputData);

        var aiChk  = document.getElementById('board-ai-assisted');
        var authEl = document.getElementById('board-write-author');
        var dateEl = document.getElementById('board-write-date');
        GW.apiFetch('/api/posts', {
          method: 'POST',
          body:   JSON.stringify({
            category:    self.category,
            title:       title,
            subtitle:    subtitle || null,
            special_feature: specialFeatureEl ? ((specialFeatureEl.value || '').trim() || null) : null,
            content:     content,
            image_url:   self._coverImage || null,
            image_caption: coverCaptionEl ? ((coverCaptionEl.value || '').trim() || null) : null,
            youtube_url: youtubeUrl || null,
            tag:         self._selectedTags && self._selectedTags.length ? self._selectedTags.join(',') : null,
            meta_tags:   metaTags || null,
            author:      authEl ? (authEl.value || undefined) : undefined,
            publish_at: dateEl && dateEl.value ? GW.normalizePublishAtValue(dateEl.value) : undefined,
            ai_assisted: aiChk ? (aiChk.checked ? 1 : 0) : 0,
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
            self.page    = 1;
            self.total   = 0;
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
            submitBtn.disabled    = false;
            submitBtn.textContent = '게재하기';
          });
      })
      .catch(function () {
        GW.showToast('내용 저장 중 오류가 발생했습니다', 'error');
        submitBtn.disabled    = false;
        submitBtn.textContent = '게재하기';
      });
  };

  // ── Draft Auto-save ───────────────────────────────────────
  Board.prototype._startDraftAutosave = function () {
    var self = this;
    var key  = 'gw_draft_' + this.category;
    this._draftTimer = setInterval(function () {
      var title    = (document.getElementById('board-write-title-input') || {}).value || '';
      var subEl    = document.getElementById('board-write-subtitle-input');
      var subtitle = subEl ? (subEl.value || '') : '';
      var specialFeatureEl = document.getElementById('board-write-special-feature');
      var mtEl     = document.getElementById('board-write-metatags-input');
      var metaTags = mtEl ? (mtEl.value || '') : '';
      var ytEl     = document.getElementById('board-write-youtube-input');
      var youtubeUrl = ytEl ? (ytEl.value || '') : '';
      var coverCaptionEl = document.getElementById('board-write-image-caption');
      var authEl   = document.getElementById('board-write-author');
      var dateEl   = document.getElementById('board-write-date');
      var aiEl     = document.getElementById('board-ai-assisted');
      if (!title && !subtitle) return; // don't save empty
      var saving = {
        title: title,
        subtitle: subtitle,
        special_feature: specialFeatureEl ? (specialFeatureEl.value || '') : '',
        meta_tags: metaTags,
        youtube_url: youtubeUrl,
        image_caption: coverCaptionEl ? (coverCaptionEl.value || '') : '',
        author: authEl ? (authEl.value || '') : '',
        publish_at: dateEl ? GW.normalizePublishAtValue(dateEl.value || '') : '',
        ai_assisted: aiEl ? !!aiEl.checked : false,
        image_url: self._coverImage || null,
        tags: self._selectedTags || [],
      };
      if (self._editor) {
        self._editor.save().then(function(d) {
          saving.editorData = d;
          localStorage.setItem(key, JSON.stringify(saving));
        }).catch(function(){});
      } else {
        localStorage.setItem(key, JSON.stringify(saving));
      }
    }, 30000); // every 30 seconds
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

  // ── Export ────────────────────────────────────────────────
  GW.Board = Board;

})();
