/**
 * Gilwell Media · 제16회 한국잼버리 특별관 런타임
 *
 * 기사 목록은 태그 하나로만 정해진다 — JAM16_TAG 가 글머리 태그(posts.tag) 또는
 * 메타 태그(posts.meta_tags) 에 들어 있는 공개 글만 노출한다. /api/posts?tag= 는
 * 두 컬럼을 함께 LIKE 매칭하므로 편집자는 둘 중 어디에 넣어도 된다.
 * 카드 마크업은 게시판(.board-grid/.post-card)과 같은 셸을 재사용한다.
 * 목록 API 는 content 를 내려주지 않으므로 발췌는 subtitle 로 대체한다.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.GW) return;
  var GW = window.GW;

  // 편집자가 글에 다는 태그와 정확히 같아야 한다 (띄어쓰기 없음).
  var JAM16_TAG = '제16회한국잼버리';
  var POST_LIMIT = 48;

  // 개영/폐영 시각은 KST 고정 오프셋으로 파싱한다. 방문자 로컬 타임존과 무관하게
  // 같은 D-day 가 나오도록 하기 위함.
  var OPEN_AT = Date.parse('2026-08-05T00:00:00+09:00');
  var CLOSE_AT = Date.parse('2026-08-09T23:59:59+09:00');

  function renderCountdown() {
    var box = document.getElementById('jam16-countdown');
    var valueEl = document.getElementById('jam16-countdown-value');
    if (!box || !valueEl) return;
    var labelEl = box.querySelector('.jam16-countdown-label');
    var now = Date.now();

    if (now > CLOSE_AT) {
      box.classList.add('is-finished');
      if (labelEl) labelEl.textContent = '대회 상태';
      valueEl.textContent = '행사 종료';
      return;
    }
    if (now >= OPEN_AT) {
      box.classList.add('is-live');
      if (labelEl) labelEl.textContent = '대회 상태';
      valueEl.textContent = '진행중';
      return;
    }
    // 남은 일수는 KST 자정 기준 경계로 올림한다 (오늘이 8/4면 D-1).
    var days = Math.ceil((OPEN_AT - now) / 86400000);
    if (labelEl) labelEl.textContent = '개영까지';
    valueEl.textContent = days <= 0 ? 'D-DAY' : 'D-' + days;
  }

  function buildCard(post, idx) {
    var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var card = document.createElement('article');
    card.className = 'post-card' + (post.image_url ? ' has-thumb' : ' no-thumb');
    card.style.animationDelay = (0.04 + idx * 0.04) + 's';
    card.style.setProperty('--card-accent', cat.color || '#111111');

    var thumb = '';
    if (post.image_url) {
      var frameStyle = post.image_is_placeholder ? '' : GW.thumbFrameStyle(post);
      thumb = '<img class="post-card-thumb' + (post.image_is_placeholder ? ' is-placeholder' : '') + '"' +
        ' src="' + GW.escapeHtml(post.image_url) + '"' +
        (frameStyle ? ' style="' + frameStyle + '"' : '') +
        ' alt="' + GW.escapeHtml(post.title || '') + '" loading="lazy">';
    }

    var kickerHtml = (GW.isPostNew(post) ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
      (post.tag ? post.tag.split(',').map(function (t) {
        t = t.trim();
        return t ? '<span class="post-kicker ' + cat.tagClass + '-kicker">' + GW.escapeHtml(t) + '</span>' : '';
      }).join('') : '');
    var labelsHtml = '<span class="category-tag ' + cat.tagClass + '">' + GW.escapeHtml(cat.label) + '</span>' + kickerHtml;
    // 목록 API 응답에는 content 가 없다. 요약은 subtitle 로만 노출한다.
    var summaryHtml = post.subtitle
      ? '<p class="post-card-subtitle">' + GW.escapeHtml(GW.truncate(post.subtitle, 140)) + '</p>'
      : '';

    card.innerHTML =
      thumb +
      '<div class="post-card-body">' +
        '<div class="post-card-head">' +
          '<div class="post-card-labels">' + labelsHtml + '</div>' +
          '<h3><a class="post-card-title-link" href="/post/' + post.id + '">' + GW.escapeHtml(post.title || '') + '</a></h3>' +
        '</div>' +
        summaryHtml +
        '<div class="post-card-footer">' +
          '<div class="post-card-share-row"><button class="post-share-btn post-card-share-btn" type="button">공유하기</button></div>' +
          '<div class="post-card-engagement">공감 ' + GW.formatNumber(post.likes || 0) + '</div>' +
          '<div class="post-card-meta">' +
            GW.renderPostDateLabel(post) +
            (post.author ? ' &nbsp;·&nbsp; <span class="post-author">' + GW.escapeHtml(post.author) + '</span>' : '') +
            ' &nbsp;<a class="post-permalink" href="/post/' + post.id + '" title="개별 페이지로 이동">↗</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    var thumbEl = card.querySelector('.post-card-thumb');
    if (thumbEl) {
      thumbEl.addEventListener('error', function () {
        card.classList.remove('has-thumb');
        card.classList.add('no-thumb');
        thumbEl.remove();
      }, { once: true });
    }

    card.addEventListener('click', function (e) {
      if (e.target.classList.contains('post-permalink')) return;
      if (e.target.classList.contains('post-card-share-btn')) return;
      if (e.target.closest('.post-card-title-link')) return;
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
  }

  function paint(gridEl, posts, emptyMessage) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    if (!posts.length) {
      gridEl.innerHTML = '<div class="list-empty jam16-empty">' + GW.escapeHtml(emptyMessage) + '</div>';
      return;
    }
    posts.forEach(function (post, idx) { gridEl.appendChild(buildCard(post, idx)); });
  }

  function fetchPosts(params) {
    var qs = new URLSearchParams(params).toString();
    return fetch('/api/posts?' + qs, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (data) { return (data && data.posts) || []; });
  }

  function loadPosts() {
    var grid = document.getElementById('jam16-grid');
    var countEl = document.getElementById('jam16-count');

    fetchPosts({ tag: JAM16_TAG, limit: POST_LIMIT })
      .catch(function (err) {
        console.warn('[jamboree16] 기사 목록 조회 실패:', (err && err.message) || err);
        return [];
      })
      .then(function (posts) {
        if (countEl) countEl.textContent = posts.length ? '총 ' + posts.length + '건' : '';
        paint(grid, posts, '아직 등록된 기사가 없습니다.');
      });
  }


  /* ── 사진 미리보기 갤러리 ────────────────────────────────────────────────
   * 사진은 제16회 한국잼버리 홍보부 공개 드라이브에서 핫링크한다 (원본은
   * 장당 8~29MB 라 리사이즈 엔드포인트만 쓴다 — jamboree16-photos.js 참조).
   *
   * 방문마다 순서를 셔플해 매번 다른 사진이 위로 온다. 처음에는 GALLERY_VISIBLE
   * 장만 그리고, 나머지는 '더 보기'를 눌렀을 때 붙인다 (초기 요청 수 억제).
   *
   * 드라이브 폴더는 2026-11-17 경 사라질 수 있다. 그래서 로드 실패를 세고,
   * 시도한 것 중 절반 이상이 깨지면 섹션 전체를 접는다 — 깨진 회색 타일이
   * 잔뜩 남는 것보다 아예 안 보이는 게 낫다.
   * ──────────────────────────────────────────────────────────────────────── */

  var GALLERY_VISIBLE = 12;   // 첫 화면에 그리는 장수
  var THUMB_W = 640;          // 그리드 썸네일 너비
  var FULL_W = 1600;          // 라이트박스 확대 너비

  var galleryState = {
    order: [],       // 셔플된 사진 배열
    rendered: 0,     // 지금까지 DOM 에 붙인 장수
    ok: 0,           // 로드 성공
    failed: 0,       // 두 경로 모두 실패
    lightboxAt: -1,  // 라이트박스가 보고 있는 galleryState.order 인덱스
    lastFocus: null  // 라이트박스 열기 전 포커스 (닫을 때 되돌린다)
  };

  // Fisher-Yates. 원본 배열을 건드리지 않도록 복사본을 섞는다.
  function shuffled(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function photoAlt(photo) {
    // day 가 빈 사진(메인 게이트)은 날짜 없이 장면만 읽힌다.
    return '제16회 한국잼버리 ' + (photo.day ? photo.day + ' ' : '') + photo.scene;
  }

  // 두 경로 모두 죽었을 때만 타일을 버린다. 첫 실패에서는 대체 리사이저로
  // 한 번 더 시도한다 (같은 파일, 다른 엔드포인트).
  function attachImageFallback(img, catalog, photo, width, onDead) {
    img.addEventListener('error', function () {
      if (img.dataset.triedFallback === '1') {
        galleryState.failed += 1;
        if (typeof onDead === 'function') onDead();
        maybeCollapseGallery();
        return;
      }
      img.dataset.triedFallback = '1';
      img.src = catalog.fallbackUrl(photo.id, width);
    });
    img.addEventListener('load', function () {
      if (img.dataset.counted === '1') return;
      img.dataset.counted = '1';
      galleryState.ok += 1;
    });
  }

  // 시도분 중 과반이 깨졌으면 섹션을 접는다. 3장 미만에서는 판단하지 않는다
  // (한두 장 실패로 섹션이 사라지는 것을 막기 위함).
  function maybeCollapseGallery() {
    var tried = galleryState.ok + galleryState.failed;
    if (tried < 3) return;
    if (galleryState.failed <= tried / 2) return;
    var section = document.getElementById('jam16-gallery-section');
    if (!section || section.hidden) return;
    section.hidden = true;
    closeLightbox();
    console.warn('[jamboree16] 사진 ' + galleryState.failed + '/' + tried +
      '장 로드 실패 — 원본 드라이브 폴더가 만료됐을 수 있어 갤러리를 숨깁니다.');
  }

  function buildTile(catalog, photo, orderIndex) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jam16-photo';
    btn.setAttribute('aria-label', photoAlt(photo) + ' — 크게 보기');

    var img = document.createElement('img');
    img.className = 'jam16-photo-img';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = photoAlt(photo);
    img.src = catalog.thumbUrl(photo.id, THUMB_W);
    attachImageFallback(img, catalog, photo, THUMB_W, function () { btn.remove(); });

    var cap = document.createElement('span');
    cap.className = 'jam16-photo-cap';
    cap.setAttribute('aria-hidden', 'true');
    cap.textContent = (photo.day ? photo.day + ' · ' : '') + photo.scene;

    btn.appendChild(img);
    btn.appendChild(cap);
    btn.addEventListener('click', function () { openLightbox(orderIndex); });
    return btn;
  }

  // count 장을 그리드에 이어 붙이고, 남은 장수를 '더 보기' 버튼에 반영한다.
  function appendPhotos(catalog, gridEl, count) {
    var frag = document.createDocumentFragment();
    var end = Math.min(galleryState.rendered + count, galleryState.order.length);
    for (var i = galleryState.rendered; i < end; i++) {
      frag.appendChild(buildTile(catalog, galleryState.order[i], i));
    }
    gridEl.appendChild(frag);
    galleryState.rendered = end;

    var moreBtn = document.getElementById('jam16-gallery-more');
    if (!moreBtn) return;
    var left = galleryState.order.length - galleryState.rendered;
    if (left <= 0) {
      moreBtn.hidden = true;
      return;
    }
    moreBtn.hidden = false;
    moreBtn.textContent = '사진 ' + left + '장 더 보기';
  }

  /* ── 라이트박스 ─────────────────────────────────────────────────────── */

  function lightboxEls() {
    return {
      box: document.getElementById('jam16-lightbox'),
      img: document.getElementById('jam16-lightbox-img'),
      cap: document.getElementById('jam16-lightbox-cap'),
      link: document.getElementById('jam16-lightbox-link'),
      closeBtn: document.getElementById('jam16-lightbox-close')
    };
  }

  function showLightboxPhoto(index) {
    var catalog = window.GW_JAM16_PHOTOS;
    var els = lightboxEls();
    var photo = galleryState.order[index];
    if (!catalog || !els.box || !photo) return;

    galleryState.lightboxAt = index;
    els.img.dataset.triedFallback = '';
    els.img.dataset.counted = '';
    els.img.alt = photoAlt(photo);
    els.img.src = catalog.thumbUrl(photo.id, FULL_W);
    els.cap.textContent = (photo.day ? '8월 ' + photo.day.split('/')[1] + '일 · ' : '') + photo.scene +
      '  (' + (index + 1) + '/' + galleryState.order.length + ')';
    if (els.link) els.link.href = catalog.viewUrl(photo.id);
  }

  function openLightbox(index) {
    var els = lightboxEls();
    if (!els.box) return;
    galleryState.lastFocus = document.activeElement;
    els.box.hidden = false;
    document.body.classList.add('jam16-lightbox-open');
    showLightboxPhoto(index);
    if (els.closeBtn) els.closeBtn.focus();
  }

  function closeLightbox() {
    var els = lightboxEls();
    if (!els.box || els.box.hidden) return;
    els.box.hidden = true;
    document.body.classList.remove('jam16-lightbox-open');
    // src 를 비워 큰 이미지를 붙들고 있지 않게 한다.
    if (els.img) els.img.removeAttribute('src');
    galleryState.lightboxAt = -1;
    if (galleryState.lastFocus && typeof galleryState.lastFocus.focus === 'function') {
      galleryState.lastFocus.focus();
    }
  }

  // step 만큼 이동. 끝에서는 반대쪽으로 감싼다.
  function stepLightbox(step) {
    if (galleryState.lightboxAt < 0) return;
    var n = galleryState.order.length;
    if (!n) return;
    showLightboxPhoto((galleryState.lightboxAt + step + n) % n);
  }

  function wireLightbox() {
    var els = lightboxEls();
    if (!els.box) return;

    if (els.closeBtn) els.closeBtn.addEventListener('click', closeLightbox);
    var prev = document.getElementById('jam16-lightbox-prev');
    var next = document.getElementById('jam16-lightbox-next');
    if (prev) prev.addEventListener('click', function () { stepLightbox(-1); });
    if (next) next.addEventListener('click', function () { stepLightbox(1); });

    // 사진·캡션 바깥(백드롭)을 누르면 닫는다.
    els.box.addEventListener('click', function (e) {
      if (e.target === els.box) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (els.box.hidden) return;
      if (e.key === 'Escape') { closeLightbox(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
    });
  }

  function initGallery() {
    var catalog = window.GW_JAM16_PHOTOS;
    var section = document.getElementById('jam16-gallery-section');
    var gridEl = document.getElementById('jam16-gallery-grid');
    if (!section || !gridEl) return;

    // 카탈로그가 안 실렸거나 비었으면 섹션을 아예 내린다.
    if (!catalog || !catalog.photos || !catalog.photos.length) {
      section.hidden = true;
      return;
    }

    // 만료 시점이 지났다면 로드해 보기 전에 콘솔로 경고한다. 이 시점에도
    // 사진이 살아 있으면 그대로 보여주고, 죽었으면 maybeCollapseGallery 가 접는다.
    if (catalog.expiresAt && Date.now() > catalog.expiresAt) {
      console.warn('[jamboree16] 원본 드라이브 폴더의 공지 유지 기한(2026-11-17)이 지났습니다. ' +
        '사진을 R2 로 옮기거나 섹션을 내려야 합니다.');
    }

    section.hidden = false;
    galleryState.order = shuffled(catalog.photos);
    galleryState.rendered = 0;
    gridEl.innerHTML = '';

    var folderLink = document.getElementById('jam16-gallery-folder');
    if (folderLink) folderLink.href = catalog.folderUrl;

    var moreBtn = document.getElementById('jam16-gallery-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        appendPhotos(catalog, gridEl, GALLERY_VISIBLE);
        // 새로 붙은 첫 타일로 포커스를 옮겨 키보드 사용자가 위치를 잃지 않게 한다.
        var tiles = gridEl.querySelectorAll('.jam16-photo');
        var target = tiles[Math.max(0, galleryState.rendered - GALLERY_VISIBLE)];
        if (moreBtn.hidden && tiles.length) tiles[tiles.length - 1].focus();
        else if (target) target.focus();
      });
    }

    appendPhotos(catalog, gridEl, GALLERY_VISIBLE);
    wireLightbox();
  }

  function init() {
    GW.bootstrapStandardPage({ loadTicker: false });
    renderCountdown();
    // 자정을 넘겨도 D-day 가 갱신되도록 한 시간마다 다시 계산한다.
    setInterval(renderCountdown, 3600000);
    initGallery();
    loadPosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
