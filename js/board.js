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
    this.extraParams = Object.assign({}, opts.extraParams || {});
    if (this.apiCategory && this.category !== 'latest' && !Object.prototype.hasOwnProperty.call(this.extraParams, 'sort')) {
      this.extraParams.sort = 'manual';
    }
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
    this._galleryImages = [];
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
        console.error('[board] load failed:', err);
        try { self._showError(); } catch (_) {}
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
    card.style.setProperty('--card-accent', cat.color || '#111111');

    var thumb = '';
    if (post.image_url) {
      thumb = '<img class="post-card-thumb' + (post.image_is_placeholder ? ' is-placeholder' : '') + '" src="' + GW.escapeHtml(post.image_url)
            + '" alt="' + GW.escapeHtml(post.title || '') + '" loading="lazy">';
    }

    var isNew = GW.isPostNew(post);
    var shareHtml = '<div class="post-card-share-row"><button class="post-share-btn post-card-share-btn" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button></div>';
    var kickerHtml = (isNew ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
      (post.tag ? post.tag.split(',').map(function(t){ t = t.trim(); return t ? '<span class="post-kicker ' + cat.tagClass + '-kicker">' + GW.escapeHtml(t) + '</span>' : ''; }).join('') : '');
    // 게시판 카테고리 태그(채움)와 글머리 태그(아웃라인) 동시 표시
    var labelsHtml = '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' + kickerHtml;
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
        '<div class="post-card-footer">' +
          shareHtml +
          '<div class="post-card-engagement">공감 ' + GW.formatNumber(post.likes || 0) + '</div>' +
          '<div class="post-card-meta">' +
            GW.formatPostDate(post) +
            (post.author ? ' &nbsp;·&nbsp; <span class="post-author">' + GW.escapeHtml(post.author) + '</span>' : '') +
            ' &nbsp;<a class="post-permalink" href="/post/' + post.id + '" title="개별 페이지로 이동">↗</a>' +
          '</div>' +
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
    var renderedContent = GW.renderTextWithMedia(post.content);
    var relatedHtml = buildRelatedPostsHtml(post.related_posts);
    var galleryHtml = GW.renderContentGallery(parseGalleryImages(post.gallery_images), { className: 'modal-content-gallery' });
    var locationHtml = buildPostLocationHtml(post);

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
      '<div class="modal-body">' + renderedContent.html + '</div>' +
      locationHtml +
      galleryHtml +
      relatedHtml +
      '<div class="post-byline">' +
        (post.author ? '<span class="post-byline-author">작성자 · ' + GW.escapeHtml(post.author) + '</span>' : '') +
        '<span class="post-byline-report">오류제보 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a></span>' +
      '</div>';

    inner.querySelector('#modal-close-btn').addEventListener('click', function () {
      self._closePost();
    });
    GW.initContentGalleries(inner);
    _initLocationMap(inner);
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

  function buildPostLocationHtml(post) {
    var locationAddress = post && post.location_address ? String(post.location_address).trim() : '';
    if (!locationAddress) return '';
    var locationName = post && post.location_name ? String(post.location_name).trim() : '';
    var mapTitle = locationName || locationAddress;
    // Map is loaded async via _initLocationMap() after the modal renders
    return '<details class="post-location-section" open>' +
      '<summary>위치 정보 보기</summary>' +
      '<div class="post-location-body">' +
        (locationName ? '<div class="post-location-name">' + GW.escapeHtml(locationName) + '</div>' : '') +
        '<div class="post-location-address">' + GW.escapeHtml(locationAddress) + '</div>' +
        '<div class="post-location-map-frame" data-location-addr="' + GW.escapeHtml(locationAddress) + '" data-location-title="' + GW.escapeHtml(mapTitle) + '">' +
          '<div class="post-location-map-loading" style="display:flex;align-items:center;justify-content:center;height:280px;color:#888;font-size:13px;">지도를 불러오는 중…</div>' +
        '</div>' +
      '</div>' +
    '</details>';
  }

  function _initLocationMap(container) {
    var mapFrames = container.querySelectorAll('.post-location-map-frame[data-location-addr]');
    mapFrames.forEach(function (frame) {
      var addr  = frame.getAttribute('data-location-addr') || '';
      var title = frame.getAttribute('data-location-title') || addr;
      if (!addr) return;
      fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addr) + '&format=json&limit=1', {
        headers: { 'Accept-Language': 'ko,en', 'User-Agent': 'GilwellMedia/1.0' }
      })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (results) {
          if (!results || !results.length) {
            frame.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:280px;color:#888;font-size:12px;">지도에서 위치를 찾을 수 없습니다</div>';
            return;
          }
          var loc = results[0];
          var lat = parseFloat(loc.lat), lon = parseFloat(loc.lon);
          var d = 0.01;
          var bbox = (lon - d) + ',' + (lat - d) + ',' + (lon + d) + ',' + (lat + d);
          var src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat + ',' + lon;
          frame.innerHTML = '<iframe class="post-location-map" src="' + src + '" title="' + GW.escapeHtml(title) + ' 지도" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
        })
        .catch(function () {
          frame.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:280px;color:#888;font-size:12px;">지도를 불러오지 못했습니다</div>';
        });
    });
  }

  function parseGalleryImages(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
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

  // ── Export ────────────────────────────────────────────────
  GW.Board = Board;

})();
