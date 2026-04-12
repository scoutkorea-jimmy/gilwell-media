(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.GW || !window.GW.HomeHelpers) return;

  var GW = window.GW;
  var helpers = GW.HomeHelpers;

  function renderHero(data) {
    var slides = [];
    var current = 0;
    var timer = null;
    var animating = false;
    var intervalMs = (data && data.interval_ms) || 3000;
    var touchState = null;
    var paused = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var suppressClickUntil = 0;
    var slider = document.getElementById('site-hero-slider');
    var controls = document.getElementById('hero-controls');

    function ensureStaticSlide() {
      if (!slider || slider.querySelector('#site-hero-static')) return;
      if (!slider.dataset.staticMarkup) return;
      if (controls) controls.insertAdjacentHTML('beforebegin', slider.dataset.staticMarkup);
      else slider.insertAdjacentHTML('afterbegin', slider.dataset.staticMarkup);
    }

    if (!slider) return;
    if (!slider.dataset.staticMarkup) {
      var initialStatic = document.getElementById('site-hero-static');
      if (initialStatic) slider.dataset.staticMarkup = initialStatic.outerHTML;
    }
    if (GW._homeHeroState && typeof GW._homeHeroState.destroy === 'function') {
      GW._homeHeroState.destroy();
    }

    function buildSlide(post, index) {
      var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
      var heroTags = helpers.getSortedPostTags(post);
      var div = document.createElement('div');
      div.className = 'site-hero site-hero-slide';
      if (helpers.isTransparentPng(post.image_url)) div.classList.add('site-hero-png');
      div.setAttribute('data-post-id', post.id);

      var mediaMarkup = '';
      if (post.image_url) {
        div.classList.add('has-bg');
        mediaMarkup =
          '<div class="site-hero-media' + (helpers.isTransparentPng(post.image_url) ? ' is-png' : '') + (post.image_is_placeholder ? ' is-placeholder' : '') + '" aria-hidden="true" style="' + helpers.getResponsiveMediaStyle(post.media) + '">' +
            '<div class="site-hero-media-backdrop" style="background-image:url(' + GW.escapeHtml(post.image_url) + ')"></div>' +
            '<img class="site-hero-media-img' + (post.image_is_placeholder ? ' is-placeholder' : '') + '" src="' + GW.escapeHtml(post.image_url) + '" alt="" loading="' + (index === 0 ? 'eager' : 'lazy') + '" fetchpriority="' + (index === 0 ? 'high' : 'auto') + '" decoding="async">' +
          '</div>';
      }

      div.innerHTML =
        mediaMarkup +
        '<div class="site-hero-bg-text">' + (post.subtitle ? GW.escapeHtml(post.subtitle) : '') + '</div>' +
        '<div class="site-hero-content">' +
          '<div class="site-hero-labels">' +
            '<span class="category-tag ' + cat.tagClass + '">' + cat.label + '</span>' +
            heroTags.map(function (tag) {
              return '<span class="post-kicker tag-' + GW.escapeHtml(post.category) + '-kicker">' + GW.escapeHtml(tag) + '</span>';
            }).join('') +
            (GW.isPostNew(post) ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
          '</div>' +
          '<h2 class="site-hero-title">' + GW.escapeHtml(post.title) + '</h2>' +
          (post.subtitle ? '<p class="site-hero-subtitle">' + GW.escapeHtml(post.subtitle) + '</p>' : '') +
          '<div class="site-hero-actions">' +
            '<a class="site-hero-cta" href="/post/' + post.id + '">소식 읽기 →</a>' +
            '<button class="site-hero-share-btn" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button>' +
          '</div>' +
        '</div>';

      helpers.bindShareButtons(div, '.site-hero-share-btn');
      div.style.cursor = 'pointer';
      div.addEventListener('click', function (event) {
        if (Date.now() < suppressClickUntil) {
          event.preventDefault();
          return;
        }
        if (!event.target.classList.contains('site-hero-cta') && !event.target.classList.contains('site-hero-share-btn')) {
          window.location.href = '/post/' + post.id;
        }
      });
      return div;
    }

    function renderDots(count, active) {
      var dotsEl = document.getElementById('hero-dots');
      if (!dotsEl) return;
      if (count <= 1) {
        dotsEl.innerHTML = '';
        return;
      }
      dotsEl.innerHTML = Array.from({ length: count }, function (_, index) {
        return '<button type="button" class="hero-dot' + (index === active ? ' active' : '') + '" aria-label="슬라이드 ' + (index + 1) + '"' + (index === active ? ' aria-current="true"' : ' aria-current="false"') + '></button>';
      }).join('');
      dotsEl.querySelectorAll('.hero-dot').forEach(function (btn, index) {
        btn.addEventListener('click', function () {
          goTo(index, index > current ? 1 : -1);
        });
      });
    }

    function setAutoTimer() {
      clearInterval(timer);
      if (!paused && slides.length > 1) {
        timer = setInterval(function () {
          goTo(current + 1, 1);
        }, intervalMs);
      }
    }

    function syncPauseButton() {
      var btn = document.getElementById('hero-pause-btn');
      if (!btn) return;
      btn.hidden = slides.length <= 1;
      btn.textContent = paused ? '재생' : '일시정지';
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.setAttribute('aria-label', paused ? '메인 슬라이드 자동 전환 다시 재생' : '메인 슬라이드 자동 전환 일시정지');
      btn.classList.toggle('is-paused', paused);
    }

    function bindPauseButton() {
      var btn = document.getElementById('hero-pause-btn');
      if (!btn) return;
      btn.onclick = function () {
        paused = !paused;
        syncPauseButton();
        setAutoTimer();
      };
      syncPauseButton();
    }

    function bindTouchNavigation() {
      if (!slider || slides.length <= 1) return;
      var onTouchStart = function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        var touch = event.touches[0];
        touchState = {
          startX: touch.clientX,
          startY: touch.clientY,
          deltaX: 0,
          deltaY: 0,
        };
      };

      var onTouchMove = function (event) {
        if (!touchState || !event.touches || event.touches.length !== 1) return;
        var touch = event.touches[0];
        touchState.deltaX = touch.clientX - touchState.startX;
        touchState.deltaY = touch.clientY - touchState.startY;
      };

      var onTouchEnd = function () {
        if (!touchState) return;
        var deltaX = touchState.deltaX;
        var deltaY = touchState.deltaY;
        touchState = null;
        if (Math.abs(deltaX) < 36 || Math.abs(deltaX) < Math.abs(deltaY) || animating) return;
        suppressClickUntil = Date.now() + 450;
        goTo(current + (deltaX < 0 ? 1 : -1), deltaX < 0 ? 1 : -1);
      };

      slider.addEventListener('touchstart', onTouchStart, { passive: true });
      slider.addEventListener('touchmove', onTouchMove, { passive: true });
      slider.addEventListener('touchend', onTouchEnd);
      GW._homeHeroState = GW._homeHeroState || {};
      GW._homeHeroState.touch = {
        start: onTouchStart,
        move: onTouchMove,
        end: onTouchEnd
      };
    }

    function normalizeOffscreen(slide, direction) {
      slide.classList.remove('active', 'before', 'transitioning');
      slide.style.visibility = 'hidden';
      slide.style.pointerEvents = 'none';
      slide.style.transform = direction < 0 ? 'translateX(-100%)' : 'translateX(100%)';
    }

    function goTo(index, direction) {
      if (!slider || !slides.length || animating) return;
      var nextIndex = (index + slides.length) % slides.length;
      if (nextIndex === current) return;
      animating = true;

      var currentSlide = slides[current];
      var nextSlide = slides[nextIndex];

      currentSlide.classList.remove('before');
      currentSlide.classList.add('active', 'transitioning');
      currentSlide.style.visibility = 'visible';
      currentSlide.style.pointerEvents = 'none';
      currentSlide.style.transform = 'translateX(0)';

      nextSlide.classList.remove('active', 'before');
      nextSlide.classList.add('transitioning');
      nextSlide.style.visibility = 'visible';
      nextSlide.style.pointerEvents = 'none';
      nextSlide.style.transform = direction > 0 ? 'translateX(100%)' : 'translateX(-100%)';

      nextSlide.offsetWidth;
      requestAnimationFrame(function () {
        currentSlide.style.transform = direction > 0 ? 'translateX(-100%)' : 'translateX(100%)';
        nextSlide.style.transform = 'translateX(0)';
      });

      setTimeout(function () {
        slides.forEach(function (slide, slideIndex) {
          if (slideIndex === nextIndex) {
            slide.classList.remove('before', 'transitioning');
            slide.classList.add('active');
            slide.style.visibility = 'visible';
            slide.style.pointerEvents = 'auto';
            slide.style.transform = 'translateX(0)';
          } else if (slideIndex === current) {
            slide.classList.remove('active', 'before', 'transitioning');
            if (direction > 0) slide.classList.add('before');
            slide.style.visibility = 'hidden';
            slide.style.pointerEvents = 'none';
            slide.style.transform = direction > 0 ? 'translateX(-100%)' : 'translateX(100%)';
          } else {
            normalizeOffscreen(slide, 1);
          }
        });
        current = nextIndex;
        animating = false;
        renderDots(slides.length, current);
        setAutoTimer();
      }, 560);
    }

    var posts = data && data.posts ? data.posts : [];
    if (!posts.length) {
      ensureStaticSlide();
      return;
    }

    var staticSlide = document.getElementById('site-hero-static');
    if (staticSlide) staticSlide.remove();

    posts.forEach(function (post, index) {
      var slide = buildSlide(post, index);
      if (index === 0) {
        slide.classList.add('active');
        slide.style.visibility = 'visible';
        slide.style.pointerEvents = 'auto';
        slide.style.transform = 'translateX(0)';
      } else {
        slide.style.visibility = 'hidden';
        slide.style.pointerEvents = 'none';
        slide.style.transform = 'translateX(100%)';
      }
      slider.appendChild(slide);
      slides.push(slide);
    });

    renderDots(posts.length, 0);
    bindTouchNavigation();
    bindPauseButton();
    setAutoTimer();
    GW._homeHeroState = Object.assign(GW._homeHeroState || {}, {
      destroy: function () {
        clearInterval(timer);
        if (GW._homeHeroState && GW._homeHeroState.touch && slider) {
          slider.removeEventListener('touchstart', GW._homeHeroState.touch.start);
          slider.removeEventListener('touchmove', GW._homeHeroState.touch.move);
          slider.removeEventListener('touchend', GW._homeHeroState.touch.end);
        }
        slider.querySelectorAll('.site-hero-slide[data-post-id]').forEach(function (node) {
          node.remove();
        });
      }
    });
  }

  GW.HomeHero = {
    renderHero: renderHero
  };
})();
