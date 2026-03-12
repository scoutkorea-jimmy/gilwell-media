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
   * @param {string} opts.category   - 'korea' | 'apr' | 'worm'
   * @param {string} [opts.gridId]   - id of the grid container element
   * @param {string} [opts.countId]  - id of the post-count element
   * @param {string} [opts.moreId]   - id of the "load more" button
   * @param {string} [opts.modalId]  - id of the modal overlay element
   */
  function Board(opts) {
    this.category = opts.category;
    this.gridEl   = document.getElementById(opts.gridId   || 'board-grid');
    this.countEl  = document.getElementById(opts.countId  || 'board-count');
    this.moreBtnEl = document.getElementById(opts.moreId  || 'load-more-btn');
    this.modalEl  = document.getElementById(opts.modalId  || 'post-modal');

    this.page     = 1;
    this.total    = 0;
    this.loading  = false;
    this.hasMore  = true;
  }

  // ── Initialise ────────────────────────────────────────────
  Board.prototype.init = function () {
    var self = this;
    GW.setMastheadDate();
    GW.markActiveNav();
    this._setupModal();
    this._load();

    if (this.moreBtnEl) {
      this.moreBtnEl.addEventListener('click', function () { self._load(); });
    }
  };

  // ── Load posts from API ───────────────────────────────────
  Board.prototype._load = function () {
    if (this.loading || !this.hasMore) return;
    var self = this;
    this.loading = true;
    this._showLoading();

    GW.apiFetch('/api/posts?category=' + this.category + '&page=' + this.page)
      .then(function (data) {
        self.total   = data.total;
        self.hasMore = data.posts.length === data.pageSize;
        self.page++;
        self._renderPosts(data.posts);
        self._updateCount();
        if (self.moreBtnEl) {
          self.moreBtnEl.style.display = self.hasMore ? 'block' : 'none';
          self.moreBtnEl.disabled = false;
        }
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
    // Remove loading / empty state on first load
    var existing = this.gridEl.querySelector('.loading-state, .empty-state, .error-state');
    if (existing) existing.remove();

    if (posts.length === 0 && this.page === 2) {
      // First load, no posts
      this._showEmpty();
      return;
    }

    posts.forEach(function (post, i) {
      var card = self._buildCard(post, i);
      self.gridEl.appendChild(card);
    });
  };

  Board.prototype._buildCard = function (post, idx) {
    var self    = this;
    var cat     = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var card    = document.createElement('article');
    card.className = 'post-card';
    card.style.animationDelay = (0.04 + idx * 0.04) + 's';

    var thumb = '';
    if (post.image_url) {
      thumb = '<img class="post-card-thumb" src="' + GW.escapeHtml(post.image_url)
            + '" alt="" loading="lazy">';
    }

    card.innerHTML =
      thumb +
      '<div class="post-card-body">' +
        '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
        '<h3>' + GW.escapeHtml(post.title) + '</h3>' +
        '<p class="post-card-excerpt">' + GW.escapeHtml(GW.truncate(post.content || '', 140)) + '</p>' +
        '<div class="post-card-meta">' + GW.formatDate(post.created_at) + '</div>' +
      '</div>';

    card.addEventListener('click', function () { self._openPost(post.id); });
    return card;
  };

  // ── Post detail modal ─────────────────────────────────────
  Board.prototype._setupModal = function () {
    var self = this;
    if (!this.modalEl) return;

    // Close on overlay click (outside .modal)
    this.modalEl.addEventListener('click', function (e) {
      if (e.target === self.modalEl) self._closePost();
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') self._closePost();
    });
  };

  Board.prototype._openPost = function (id) {
    var self = this;
    if (!this.modalEl) return;

    // Show loading state inside modal immediately
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
      imgHtml = '<img class="modal-img" src="' + GW.escapeHtml(post.image_url) + '" alt="">';
    }

    inner.innerHTML =
      '<button class="modal-close" id="modal-close-btn">×</button>' +
      '<div class="modal-header">' +
        '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
        '<h2>' + GW.escapeHtml(post.title) + '</h2>' +
        '<div class="modal-date">' + GW.formatDate(post.created_at) + '</div>' +
      '</div>' +
      imgHtml +
      '<div class="modal-body">' + GW.renderText(post.content) + '</div>';

    inner.querySelector('#modal-close-btn').addEventListener('click', function () {
      self._closePost();
    });
  };

  Board.prototype._closePost = function () {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('open');
    document.body.style.overflow = '';
  };

  // ── State displays ────────────────────────────────────────
  Board.prototype._showLoading = function () {
    if (this.page === 1) {
      this.gridEl.innerHTML =
        '<div class="loading-state">' +
          '<div class="loading-dots"><span></span><span></span><span></span></div>' +
        '</div>';
    }
    if (this.moreBtnEl) this.moreBtnEl.disabled = true;
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
    if (this.countEl) this.countEl.textContent = this.total + '개';
  };

  // ── Export ────────────────────────────────────────────────
  GW.Board = Board;

})();
