(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.GW || !window.GW.HomeHelpers) return;

  var GW = window.GW;
  var helpers = GW.HomeHelpers;
  var HOME_COLUMN_KEYS = ['korea', 'apr', 'wosm', 'people'];
  var HOME_MINI_SECTIONS = [
    { id: 'latest-list', source: 'latestRail', empty: '아직 게시글이 없습니다' },
    { id: 'popular-list', source: 'popularRail', empty: '아직 게시글이 없습니다' },
    { id: 'popular-list-mobile', source: 'popularRail', empty: '아직 게시글이 없습니다' },
    { id: 'picks-list', source: 'picksRail', empty: '에디터 추천 게시글이 없습니다' },
    { id: 'picks-list-mobile', source: 'picksRail', empty: '에디터 추천 게시글이 없습니다' }
  ];

  function buildMiniItem(post, options) {
    var thumb = post.image_url
      ? '<img class="mini-thumb' + (post.image_is_placeholder ? ' is-placeholder' : '') + '" src="' + GW.escapeHtml(post.image_url) + '" loading="lazy" alt="' + GW.escapeHtml(post.title || '') + '">'
      : '';
    return (
      '<article class="mini-item">' +
        '<div class="mini-item-row">' +
          '<div class="mini-item-text">' +
            '<div class="mini-item-labels">' + helpers.buildMiniLabels(post, options) + '</div>' +
            '<h4><a class="mini-item-link" href="/post/' + post.id + '">' + GW.escapeHtml(post.title) + '</a></h4>' +
            '<div class="mini-meta">' + GW.formatPostDate(post) + '</div>' +
            '<div class="mini-item-actions">' + helpers.buildMiniShareButton(post) + '</div>' +
          '</div>' +
          thumb +
        '</div>' +
      '</article>'
    );
  }

  function renderLeadStory(el, post, label, leadMedia, options) {
    if (!el) return;
    var opts = options || {};
    if (opts.error) {
      helpers.renderHomeBlockError(el, 'lead');
      return;
    }
    if (!post) {
      el.innerHTML = '<div class="mini-empty">대표 기사를 준비 중입니다</div>';
      return;
    }
    var cat = GW.CATEGORIES[post.category] || GW.CATEGORIES.korea;
    var categoryLabel = GW.getCategoryLabel(post.category);
    var subtitle = (post.subtitle || '').trim();
    var excerpt = GW.truncate(post.content || '', 420);
    var tags = helpers.getSortedPostTags(post);
    if (excerpt === subtitle) excerpt = '';

    var thumb = post.image_url
      ? '<a class="home-lead-thumb-link' + (helpers.isTransparentPng(post.image_url) ? ' is-png' : '') + (post.image_is_placeholder ? ' is-placeholder' : '') + '" style="' + helpers.getResponsiveMediaStyle(leadMedia) + '" href="/post/' + post.id + '">' +
          '<span class="home-lead-thumb-backdrop" aria-hidden="true" style="background-image:url(' + GW.escapeHtml(post.image_url) + ')"></span>' +
          '<img class="home-lead-thumb' + (post.image_is_placeholder ? ' is-placeholder' : '') + '" src="' + GW.escapeHtml(post.image_url) + '" alt="' + GW.escapeHtml(post.title) + '" loading="eager" fetchpriority="high" decoding="async">' +
        '</a>'
      : '';

    el.innerHTML =
      '<article class="home-lead-card">' +
        thumb +
        '<div class="home-lead-body">' +
          '<div class="home-lead-copy">' +
            '<div class="home-lead-labels">' +
              '<span class="category-tag ' + cat.tagClass + '">' + GW.escapeHtml(categoryLabel) + '</span>' +
              tags.map(function (tag) {
                return '<span class="post-kicker tag-' + GW.escapeHtml(post.category) + '-kicker">' + GW.escapeHtml(tag) + '</span>';
              }).join('') +
              '<span class="home-lead-kicker">' + GW.escapeHtml(label || '메인 스토리') + '</span>' +
              (GW.isPostNew(post) ? '<span class="post-kicker post-kicker-new">NEW</span>' : '') +
            '</div>' +
            '<h3><a class="home-lead-link" href="/post/' + post.id + '">' + GW.escapeHtml(post.title) + '</a></h3>' +
            (subtitle ? '<p class="home-lead-subtitle">' + GW.escapeHtml(subtitle) + '</p>' : '') +
            (excerpt ? '<p class="home-lead-excerpt">' + GW.escapeHtml(excerpt) + '</p>' : '') +
          '</div>' +
          '<div class="home-lead-footer">' +
            '<div class="home-lead-meta">' + GW.formatPostDate(post) + (post.author ? ' · ' + GW.escapeHtml(post.author) : '') + '</div>' +
            '<div class="home-lead-actions">' +
              '<a class="home-subscribe-btn" href="/post/' + post.id + '">기사 읽기</a>' +
              '<button class="home-subscribe-btn secondary" type="button" data-share-url="/post/' + post.id + '" data-share-title="' + GW.escapeHtml(post.title) + '">공유하기</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    helpers.bindShareButtons(el, '[data-share-url]');
  }

  function renderMiniList(el, posts, emptyMsg, options) {
    if (!el) return;
    var opts = options || {};
    if (opts.errorKey) {
      helpers.renderHomeBlockError(el, opts.errorKey);
      return;
    }
    if (!posts || !posts.length) {
      el.innerHTML = '<div class="mini-empty">' + (emptyMsg || '게시글이 없습니다') + '</div>';
      return;
    }
    el.innerHTML = posts.map(function (post) {
      return buildMiniItem(post, options);
    }).join('');
    helpers.bindShareButtons(el, '.mini-share-link');
  }

  function buildHomeSections(data) {
    var issues = helpers.getHomeIssueMap(data);
    var latestPosts = helpers.sortPostsLatest(data.latest && data.latest.posts ? data.latest.posts : []);
    var popularPosts = data.popular && data.popular.posts ? data.popular.posts : [];
    var picksPosts = data.picks && data.picks.posts ? data.picks.posts : [];
    return {
      latestPosts: latestPosts,
      popularPosts: popularPosts,
      picksPosts: picksPosts,
      columns: data.columns || {},
      latestRail: latestPosts.slice(0, 3),
      popularRail: issues.popular ? [] : (popularPosts.length ? popularPosts : latestPosts).slice(0, 4),
      picksRail: picksPosts.slice(0, 4)
    };
  }

  function miniSectionErrorKey(sectionSource, issues) {
    var key = sectionSource === 'latestRail'
      ? 'latest'
      : sectionSource === 'popularRail'
        ? 'popular'
        : sectionSource === 'picksRail'
          ? 'picks'
          : '';
    return issues[key] ? key : '';
  }

  function applyMiniSections(viewModel, issues) {
    HOME_MINI_SECTIONS.forEach(function (section) {
      renderMiniList(
        document.getElementById(section.id),
        viewModel[section.source] || [],
        section.empty,
        { errorKey: miniSectionErrorKey(section.source, issues) }
      );
    });

    HOME_COLUMN_KEYS.forEach(function (key) {
      renderMiniList(
        document.getElementById('col-' + key),
        viewModel.columns[key] && viewModel.columns[key].posts ? viewModel.columns[key].posts.slice(0, 4) : [],
        '게시글이 없습니다',
        {
          hideCategoryChip: true,
          errorKey: issues[key] ? key : ''
        }
      );
    });
  }

  GW.HomeRender = {
    renderLeadStory: renderLeadStory,
    renderMiniList: renderMiniList,
    buildHomeSections: buildHomeSections,
    applyMiniSections: applyMiniSections,
    HOME_COLUMN_KEYS: HOME_COLUMN_KEYS,
    HOME_MINI_SECTIONS: HOME_MINI_SECTIONS
  };
})();
