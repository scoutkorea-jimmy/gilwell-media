/**
 * Gilwell Media · 제16회 한국잼버리 특별관 런타임
 *
 * 두 개의 목록을 채운다.
 *   1) 특별관 소식  — posts.special_feature = SPECIAL_FEATURE (편집자가 글에 지정)
 *   2) 잼버리 관련 소식 — q=잼버리 검색 결과에서 1)에 이미 나온 글을 제외
 * 카드 마크업은 게시판(.board-grid/.post-card)과 같은 셸을 재사용한다.
 * 목록 API 는 content 를 내려주지 않으므로 발췌는 subtitle 로 대체한다.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.GW) return;
  var GW = window.GW;

  // 편집자가 글 작성/수정 화면의 '특집 기사 묶음' 에 입력하는 값과 정확히 같아야 한다.
  var SPECIAL_FEATURE = '제16회 한국잼버리';
  var RELATED_QUERY = '잼버리';
  var FEATURE_LIMIT = 24;
  var RELATED_LIMIT = 12;

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

  function loadLists() {
    var featureGrid = document.getElementById('jam16-grid');
    var relatedGrid = document.getElementById('jam16-related-grid');
    var countEl = document.getElementById('jam16-count');

    fetchPosts({ special_feature: SPECIAL_FEATURE, limit: FEATURE_LIMIT })
      .catch(function (err) {
        console.warn('[jamboree16] 특별관 목록 조회 실패:', (err && err.message) || err);
        return [];
      })
      .then(function (featurePosts) {
        if (countEl) countEl.textContent = featurePosts.length ? '총 ' + featurePosts.length + '건' : '';
        paint(featureGrid, featurePosts, '아직 이 특별관으로 묶인 기사가 없습니다. 아래 관련 소식을 먼저 확인해 주세요.');

        var seen = {};
        featurePosts.forEach(function (p) { seen[p.id] = true; });

        return fetchPosts({ q: RELATED_QUERY, limit: RELATED_LIMIT })
          .catch(function (err) {
            console.warn('[jamboree16] 관련 소식 조회 실패:', (err && err.message) || err);
            return [];
          })
          .then(function (relatedPosts) {
            paint(
              relatedGrid,
              relatedPosts.filter(function (p) { return !seen[p.id]; }),
              '표시할 관련 소식이 없습니다.'
            );
          });
      });
  }

  function init() {
    GW.bootstrapStandardPage({ loadTicker: false });
    renderCountdown();
    // 자정을 넘겨도 D-day 가 갱신되도록 한 시간마다 다시 계산한다.
    setInterval(renderCountdown, 3600000);
    loadLists();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
