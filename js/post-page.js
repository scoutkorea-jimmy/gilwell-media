(function () {
  'use strict';

  var boot = window.GW_POST_BOOT || {};
  GW.bootstrapStandardPage();

var _editPostId = Number(boot.editPostId || 0);
var _sharePostUrl = String(boot.sharePostUrl || window.location.href);
var _sharePostTitle = String(boot.sharePostTitle || document.title || '');
var _postEditSeed = boot.editSeed || {};
var _postTurnstileWidgetId = null;
var _editorCallbackQueue = [];
var _postEditState = {
  editor: null,
  editorLoading: false,
  coverImage: _postEditSeed.image_url || null,
  galleryImages: [],
  selectedTags: [],
  activeCategory: _postEditSeed.category || 'korea',
  manualRelatedPosts: Array.isArray(_postEditSeed.manual_related_posts) ? _postEditSeed.manual_related_posts.slice(0, 5) : []
};
var _postRelatedSearchTimer = null;

function _setBodyModalLock(locked) {
  document.body.style.overflow = locked ? 'hidden' : '';
}

function _setOverlayState(id, open) {
  var overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.toggle('open', !!open);
  overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function _parsePostTags(value) {
  return String(value || '')
    .split(',')
    .map(function (tag) { return tag.trim(); })
    .filter(Boolean);
}

function _stripLegacyHtml(html) {
  if (!html) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}

function _createParagraphBlocks(text) {
  var normalized = String(text || '').replace(/\\r\\n/g, '\\n').trim();
  if (!normalized) return [];
  return normalized.split(/\\n{2,}/).map(function (chunk) {
    return {
      type: 'paragraph',
      data: {
        text: GW.escapeHtml(chunk).replace(/\\n/g, '<br>')
      }
    };
  });
}

function _parseEditorSeed(raw) {
  var text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { time: Date.now(), blocks: [] };
  if (text.charAt(0) === '{') {
    try {
      var parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.blocks)) return parsed;
    } catch (_) {}
  }
  if (/^</.test(text)) {
    text = _stripLegacyHtml(text);
  }
  return {
    time: Date.now(),
    blocks: _createParagraphBlocks(text)
  };
}

function _loadPostEditorAssets(callback) {
  if (window.EditorJS && window.Header && window.List && window.Quote) {
    callback();
    return;
  }
  if (_postEditState.editorLoading) {
    _editorCallbackQueue.push(callback);
    return;
  }
  _postEditState.editorLoading = true;
  _editorCallbackQueue.push(callback);

  function flushCallbacks() {
    _postEditState.editorLoading = false;
    var cbs = _editorCallbackQueue.splice(0);
    cbs.forEach(function (cb) { cb(); });
  }

  function loadScript(src, done) {
    var exists = document.querySelector('script[src="' + src + '"]');
    if (exists) {
      if (exists.dataset.loaded === '1') {
        done();
        return;
      }
      exists.addEventListener('load', done, { once: true });
      exists.addEventListener('error', done, { once: true });
      return;
    }
    var script = document.createElement('script');
    script.src = src;
    script.addEventListener('load', function () {
      script.dataset.loaded = '1';
      done();
    }, { once: true });
    script.addEventListener('error', function () {
      console.error('[post-page] Failed to load script: ' + src);
      done();
    }, { once: true });
    document.head.appendChild(script);
  }

  loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
    var pending = 3;
    function done() {
      pending -= 1;
      if (pending === 0) flushCallbacks();
    }
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', done);
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js', done);
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js', done);
  });
}

function _initPostEditor(callback) {
  _loadPostEditorAssets(function () {
    if (!window.EditorJS) {
      GW.showToast('에디터 로드에 실패했습니다. 페이지를 새로고침해 주세요.', 'error');
      return;
    }
    if (!_postEditState.editor) {
      _postEditState.editor = new window.EditorJS({
        holder: 'post-edit-editorjs',
        placeholder: '내용을 수정하세요...',
        tools: {
          paragraph: {
            inlineToolbar: true,
            config: { preserveBlank: true }
          },
          header: {
            class: window.Header,
            config: { levels: [2, 3, 4], defaultLevel: 2 }
          },
          list: {
            class: window.List,
            inlineToolbar: true
          },
          quote: {
            class: window.Quote,
            inlineToolbar: true
          },
          image: {
            class: GW.makeEditorImageTool()
          }
        }
      });
    }
    _postEditState.editor.isReady
      .then(function () { callback(); })
      .catch(function () {
        GW.showToast('에디터를 불러오지 못했습니다', 'error');
      });
  });
}

function _fillPostAuthorOptions(editors) {
  var select = document.getElementById('post-edit-author');
  if (!select) return;
  var current = _postEditSeed.author || 'Editor.A';
  var options = GW.buildEditorOptions(editors || {});
  if (current && options.indexOf('value="' + current + '"') === -1) {
    options = '<option value="' + GW.escapeHtml(current) + '">' + GW.escapeHtml(current) + '</option>' + options;
  }
  select.innerHTML = options;
  select.value = current;
}

function _syncPostCategoryChip(category) {
  var chip = document.getElementById('post-edit-category-chip');
  var meta = (GW.CATEGORIES && GW.CATEGORIES[category]) || GW.CATEGORIES.korea;
  if (!chip || !meta) return;
  chip.textContent = meta.label;
  chip.style.background = meta.color;
}

function _syncPostTagPills(selectedTags) {
  var selector = document.getElementById('post-tag-selector');
  if (!selector) return;
  selector.querySelectorAll('.tag-pill').forEach(function (pill) {
    var value = pill.getAttribute('data-tag') || '';
    if (!value) {
      pill.classList.toggle('active', selectedTags.length === 0);
      return;
    }
    pill.classList.toggle('active', selectedTags.indexOf(value) >= 0);
  });
}

function _renderPostTagSelector(items) {
  var selector = document.getElementById('post-tag-selector');
  if (!selector) return;
  var selected = _postEditState.selectedTags.filter(function (tag) {
    return items.indexOf(tag) >= 0;
  });
  _postEditState.selectedTags = selected;
  var html = '<button type="button" class="tag-pill' + (!selected.length ? ' active' : '') + '" data-tag="">없음</button>';
  items.forEach(function (tag) {
    var active = selected.indexOf(tag) >= 0 ? ' active' : '';
    html += '<button type="button" class="tag-pill' + active + '" data-tag="' + GW.escapeHtml(tag) + '">' + GW.escapeHtml(tag) + '</button>';
  });
  selector.innerHTML = html;
  selector.querySelectorAll('.tag-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      var value = pill.getAttribute('data-tag') || '';
      if (!value) {
        _postEditState.selectedTags = [];
      } else {
        var idx = _postEditState.selectedTags.indexOf(value);
        if (idx >= 0) _postEditState.selectedTags.splice(idx, 1);
        else _postEditState.selectedTags.push(value);
      }
      _syncPostTagPills(_postEditState.selectedTags);
    });
  });
  _syncPostTagPills(_postEditState.selectedTags);
}

function _loadPostTagOptions(category) {
  var selector = document.getElementById('post-tag-selector');
  if (selector) selector.innerHTML = '<span class="post-edit-note">불러오는 중…</span>';
  fetch('/api/settings/tags?category=' + encodeURIComponent(category), { cache: 'no-store' })
    .then(function (response) { return response.json(); })
    .then(function (data) {
      _renderPostTagSelector((data && data.items) || []);
    })
    .catch(function () {
      if (selector) selector.innerHTML = '<span class="post-edit-note">태그를 불러오지 못했습니다.</span>';
    });
}

function _renderPostManualRelatedSelected() {
  var wrap = document.getElementById('post-edit-related-selected');
  if (!wrap) return;
  if (!_postEditState.manualRelatedPosts.length) {
    wrap.innerHTML = '<div class="post-edit-note">직접 연결한 유관기사가 없습니다.</div>';
    return;
  }
  wrap.innerHTML = _postEditState.manualRelatedPosts.map(function (item) {
    return '<div class="calendar-related-post-pill">' +
      '<strong>' + GW.escapeHtml(item.title || '') + '</strong>' +
      '<button type="button" class="calendar-related-post-remove" onclick="window._removePostManualRelated(' + Number(item.id) + ')">제거</button>' +
    '</div>';
  }).join('');
}

function _loadPostManualRelatedResults() {
  var input = document.getElementById('post-edit-related-search');
  var list = document.getElementById('post-edit-related-results');
  if (!list) return;
  var query = input ? (input.value || '').trim() : '';
  if (!query) {
    list.innerHTML = '<div class="post-edit-note">기사 제목으로 검색해 직접 연결할 유관기사를 선택하세요.</div>';
    return;
  }
  list.innerHTML = '<div class="post-edit-note">관련 기사를 불러오는 중…</div>';
  GW.apiFetch('/api/posts?page=1&limit=8&q=' + encodeURIComponent(query))
    .then(function (data) {
      var rows = Array.isArray(data && data.posts) ? data.posts : [];
      rows = rows.filter(function (item) { return Number(item.id) !== Number(_editPostId); });
      if (!rows.length) {
        list.innerHTML = '<div class="post-edit-note">검색 결과 없음</div>';
        return;
      }
      list.innerHTML = rows.map(function (item) {
        var selected = _postEditState.manualRelatedPosts.some(function (related) { return Number(related.id) === Number(item.id); });
        return '<button type="button" class="calendar-related-post-result' + (selected ? ' is-selected' : '') + '" onclick="window._addPostManualRelated(' + Number(item.id) + ')">' +
          '<strong>' + GW.escapeHtml(item.title || '') + '</strong>' +
          '<span>' + GW.escapeHtml((GW.CATEGORIES[item.category] || GW.CATEGORIES.korea).label) + (selected ? ' · 선택됨' : '') + '</span>' +
        '</button>';
      }).join('');
    })
    .catch(function () {
      list.innerHTML = '<div class="post-edit-note">관련 기사 검색에 실패했습니다.</div>';
    });
}

window._searchPostManualRelated = function () {
  clearTimeout(_postRelatedSearchTimer);
  _postRelatedSearchTimer = setTimeout(_loadPostManualRelatedResults, 180);
};

window._addPostManualRelated = function (postId) {
  var numericId = parseInt(postId, 10);
  if (!Number.isFinite(numericId) || numericId < 1) return;
  if (_postEditState.manualRelatedPosts.some(function (item) { return Number(item.id) === numericId; })) return;
  if (_postEditState.manualRelatedPosts.length >= 5) {
    GW.showToast('유관기사는 최대 5개까지 직접 연결할 수 있습니다', 'error');
    return;
  }
  GW.apiFetch('/api/posts/' + numericId)
    .then(function (data) {
      var post = data && data.post ? data.post : null;
      if (!post) throw new Error('관련 기사를 불러오지 못했습니다');
      _postEditState.manualRelatedPosts.push({
        id: post.id,
        title: post.title || '',
        category: post.category || '',
        publish_at: post.publish_at || '',
        created_at: post.created_at || '',
      });
      _renderPostManualRelatedSelected();
      _loadPostManualRelatedResults();
    })
    .catch(function (err) {
      GW.showToast((err && err.message) || '관련 기사를 추가하지 못했습니다', 'error');
    });
};

window._removePostManualRelated = function (postId) {
  var numericId = parseInt(postId, 10);
  _postEditState.manualRelatedPosts = _postEditState.manualRelatedPosts.filter(function (item) {
    return Number(item.id) !== numericId;
  });
  _renderPostManualRelatedSelected();
  _loadPostManualRelatedResults();
};

function _addPostManagedTag() {
  var input = document.getElementById('post-tag-new-input');
  var value = (input && input.value || '').trim();
  if (!value) {
    GW.showToast('태그명을 입력해주세요', 'error');
    if (input) input.focus();
    return;
  }
  GW.addManagedTagToCategory(value, _postEditState.activeCategory)
    .then(function (result) {
      var selectedTag = result && result.selectedTag ? result.selectedTag : value;
      if (_postEditState.selectedTags.indexOf(selectedTag) < 0) {
        _postEditState.selectedTags.push(selectedTag);
      }
      return fetch('/api/settings/tags?category=' + encodeURIComponent(_postEditState.activeCategory), { cache: 'no-store' })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          _renderPostTagSelector((data && data.items) || []);
          if (input) input.value = '';
          GW.showToast(result && result.created ? '태그를 추가하고 바로 선택했습니다' : '이미 있는 태그라서 바로 선택했습니다', 'success');
        });
    })
    .catch(function (err) {
      GW.showToast((err && err.message) || '태그를 추가하지 못했습니다', 'error');
    });
}

function _renderPostCoverPreview() {
  var preview = document.getElementById('post-cover-preview');
  if (!preview) return;
  if (!_postEditState.coverImage) {
    preview.innerHTML = '';
    return;
  }
  preview.innerHTML =
    '<img src="' + GW.escapeHtml(_postEditState.coverImage) + '" class="cover-preview-img" alt="대표 이미지 미리보기">' +
    '<button type="button" class="cover-remove-btn" id="post-cover-remove">이미지 제거</button>';
  var removeBtn = document.getElementById('post-cover-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', function () {
      _postEditState.coverImage = null;
      _renderPostCoverPreview();
    });
  }
}

function _parsePostGallerySeed(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(function (item) {
      if (typeof item === 'string') return { url: item, caption: '' };
      return {
        url: item && typeof item.url === 'string' ? item.url : '',
        caption: item && typeof item.caption === 'string' ? item.caption : ''
      };
    }).filter(function (item) { return item.url; }).slice(0, 10);
  }
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(function (item) {
      if (typeof item === 'string') return { url: item, caption: '' };
      return {
        url: item && typeof item.url === 'string' ? item.url : '',
        caption: item && typeof item.caption === 'string' ? item.caption : ''
      };
    }).filter(function (item) { return item.url; }).slice(0, 10);
  } catch (_) {
    return [];
  }
}

function _renderPostGalleryPreview() {
  var preview = document.getElementById('post-gallery-preview');
  var count = document.getElementById('post-gallery-count');
  if (!preview) return;
  if (count) count.textContent = (_postEditState.galleryImages.length || 0) + '/10';
  if (!_postEditState.galleryImages.length) {
    preview.innerHTML = '<p class="gallery-upload-empty">슬라이드 전용 이미지를 올리면 기사 하단에서만 별도 슬라이드로 노출됩니다.</p>';
    return;
  }
  preview.innerHTML = _postEditState.galleryImages.map(function (item, idx) {
    return '' +
      '<div class="gallery-upload-item">' +
        '<img class="gallery-upload-thumb" src="' + GW.escapeHtml(item.url) + '" alt="슬라이드 이미지 ' + (idx + 1) + '">' +
        '<button type="button" class="gallery-upload-remove" data-idx="' + idx + '">제거</button>' +
      '</div>';
  }).join('');
  preview.querySelectorAll('.gallery-upload-remove').forEach(function (button) {
    button.addEventListener('click', function () {
      var idx = parseInt(button.getAttribute('data-idx') || '-1', 10);
      if (idx < 0) return;
      _postEditState.galleryImages.splice(idx, 1);
      _renderPostGalleryPreview();
    });
  });
}

window._postUploadCover = function () {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (!file) return;
    GW.optimizeImageFile(file, { maxW: 1600, maxH: 1600, quality: 0.82 })
      .then(function (result) {
        _postEditState.coverImage = result.dataUrl;
        _renderPostCoverPreview();
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '대표 이미지 처리에 실패했습니다', 'error');
      });
  });
  input.click();
};

window._postUploadGallery = function () {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call((input.files || []));
    if (!files.length) return;
    if ((_postEditState.galleryImages.length + files.length) > 10) {
      GW.showToast('슬라이드 이미지는 최대 10장까지 등록할 수 있습니다', 'error');
      return;
    }
    Promise.all(files.map(function (file) {
      return GW.optimizeImageFile(file, { maxW: 1800, maxH: 1800, quality: 0.84 });
    }))
      .then(function (results) {
        results.forEach(function (result) {
          _postEditState.galleryImages.push({ url: result.dataUrl, caption: '' });
        });
        _renderPostGalleryPreview();
      })
      .catch(function (err) {
        GW.showToast((err && err.message) || '슬라이드 이미지 처리에 실패했습니다', 'error');
      });
  });
  input.click();
};

function _populatePostEditForm() {
  document.getElementById('post-edit-category').value = _postEditSeed.category || 'korea';
  document.getElementById('post-edit-title-input').value = _postEditSeed.title || '';
  document.getElementById('post-edit-subtitle-input').value = _postEditSeed.subtitle || '';
  document.getElementById('post-edit-special-feature').value = _postEditSeed.special_feature || '';
  document.getElementById('post-edit-date').value = GW.toDatetimeLocalValue(_postEditSeed.publish_at || _postEditSeed.publish_date || '') || GW.getKstDateTimeInputValue();
  document.getElementById('post-edit-youtube').value = _postEditSeed.youtube_url || '';
  document.getElementById('post-edit-location-name').value = _postEditSeed.location_name || '';
  document.getElementById('post-edit-location-address').value = _postEditSeed.location_address || '';
  var locationToggle = document.getElementById('post-location-toggle');
  if (locationToggle) locationToggle.open = !!(_postEditSeed.location_name || _postEditSeed.location_address);
  document.getElementById('post-edit-image-caption').value = _postEditSeed.image_caption || '';
  document.getElementById('post-edit-metatags-input').value = _postEditSeed.meta_tags || '';
  document.getElementById('post-edit-ai-assisted').checked = !!_postEditSeed.ai_assisted;
  _postEditState.coverImage = _postEditSeed.image_url || null;
  _postEditState.galleryImages = _parsePostGallerySeed(_postEditSeed.gallery_images);
  _postEditState.selectedTags = _parsePostTags(_postEditSeed.tag);
  _postEditState.manualRelatedPosts = Array.isArray(_postEditSeed.manual_related_posts) ? _postEditSeed.manual_related_posts.slice(0, 5) : [];
  _postEditState.activeCategory = _postEditSeed.category || 'korea';
  _syncPostCategoryChip(_postEditState.activeCategory);
  _renderPostCoverPreview();
  _renderPostGalleryPreview();
  _renderPostManualRelatedSelected();
  var relatedInput = document.getElementById('post-edit-related-search');
  if (relatedInput) relatedInput.value = '';
  _loadPostManualRelatedResults();
  _loadPostTagOptions(_postEditState.activeCategory);
  _fillPostAuthorOptions({});
  GW.apiFetch('/api/settings/editors')
    .then(function (data) {
      _fillPostAuthorOptions((data && data.editors) || {});
    })
    .catch(function () {
      _fillPostAuthorOptions({});
    });
  _initPostEditor(function () {
    _postEditState.editor.render(_parseEditorSeed(_postEditSeed.content || '')).catch(function () {});
  });
}

window._closePostLogin = function () {
  var modal = document.getElementById('post-login-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  _setBodyModalLock(false);
  var err = document.getElementById('post-login-err');
  if (err) err.style.display = 'none';
  if (window.turnstile && _postTurnstileWidgetId != null) {
    window.turnstile.reset(_postTurnstileWidgetId);
  }
};

function _openPostLogin() {
  var modal = document.getElementById('post-login-modal');
  if (!modal) return;
  document.getElementById('post-login-pw').value = '';
  var err = document.getElementById('post-login-err');
  if (err) err.style.display = 'none';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  _setBodyModalLock(true);
  setTimeout(function () {
    var input = document.getElementById('post-login-pw');
    if (input) input.focus();
  }, 80);
  GW.loadTurnstile(function () {
    if (window.turnstile && GW.TURNSTILE_SITE_KEY && _postTurnstileWidgetId == null) {
      _postTurnstileWidgetId = window.turnstile.render('#post-login-turnstile', {
        sitekey: GW.TURNSTILE_SITE_KEY,
        theme: 'light'
      });
    }
  });
}

window._closePostEdit = function () {
  var overlay = document.getElementById('post-edit-overlay');
  if (!overlay) return;
  _setOverlayState('post-edit-overlay', false);
  _setBodyModalLock(false);
};

function _openPostEdit() {
  var overlay = document.getElementById('post-edit-overlay');
  if (!overlay) return;
  _populatePostEditForm();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  _setBodyModalLock(true);
  setTimeout(function () {
    var input = document.getElementById('post-edit-title-input');
    if (input) input.focus();
  }, 100);
}

window._sharePostLink = function() {
  GW.sharePostLink({
    url: _sharePostUrl,
    title: _sharePostTitle,
    text: _sharePostTitle
  }).catch(function(err) {
    GW.showToast((err && err.message) || '링크 공유에 실패했습니다', 'error');
  });
};

window._closePostTagModal = function () {
  _setOverlayState('post-tag-modal', false);
  _setBodyModalLock(false);
};

function _renderTagRelatedPosts(tag, posts) {
  var list = document.getElementById('post-tag-modal-list');
  if (!list) return;
  list.innerHTML = '<section class="modal-related-posts post-related-surface">' +
    '<h3 class="post-related-heading">#' + GW.escapeHtml(tag) + '</h3>' +
    '<ul class="post-related-list">' +
      posts.map(function (item) {
        var category = (GW.CATEGORIES && GW.CATEGORIES[item.category]) || GW.CATEGORIES.korea;
        var publicDate = item.publish_at || item.created_at || '';
        return '<li><a href="/post/' + Number(item.id) + '">' +
          '<span class="post-related-title">[' + GW.escapeHtml(category.label) + '] ' + GW.escapeHtml(item.title || '') + '</span>' +
          '<span class="post-related-date">' + GW.escapeHtml(GW.formatDate(publicDate)) + '</span>' +
        '</a></li>';
      }).join('') +
    '</ul>' +
  '</section>';
}

function _openPostTagModal(tag) {
  var safeTag = String(tag || '').trim();
  if (!safeTag) return;
  var titleEl = document.getElementById('post-tag-modal-title');
  var descEl = document.getElementById('post-tag-modal-desc');
  var chipEl = document.getElementById('post-tag-modal-chip');
  var listEl = document.getElementById('post-tag-modal-list');
  if (titleEl) titleEl.textContent = '#' + safeTag + ' 관련 기사';
  if (descEl) descEl.textContent = '선택한 태그와 연결된 공개 기사 목록입니다.';
  if (chipEl) chipEl.textContent = safeTag;
  if (listEl) listEl.innerHTML = '<div class="post-edit-note">관련 기사를 불러오는 중…</div>';
  GW.apiFetch('/api/posts?page=1&limit=8&tag=' + encodeURIComponent(safeTag))
    .then(function (data) {
      var posts = Array.isArray(data && data.posts) ? data.posts : [];
      posts = posts.filter(function (item) {
        return Number(item.id) !== Number(_editPostId);
      });
      if (!posts.length) {
        window._closePostTagModal();
        GW.showToast('유관기사가 없습니다', 'error');
        return;
      }
      _renderTagRelatedPosts(safeTag, posts);
      _setOverlayState('post-tag-modal', true);
      _setBodyModalLock(true);
    })
    .catch(function (err) {
      GW.showToast((err && err.message) || '태그 관련 기사를 불러오지 못했습니다', 'error');
    });
}

window._postEdit = function() {
  if (GW.getToken && GW.getToken() && GW.verifyAdminSession) {
    GW.verifyAdminSession({ force: true }).then(function (ok) {
      if (ok && GW.getAdminRole && GW.getAdminRole() === 'full') {
        _openPostEdit();
        return;
      }
      GW.showToast('수정 권한이 있는 관리자 비밀번호를 다시 입력해주세요', 'error');
      _openPostLogin();
    });
    return;
  }
  if (GW.getToken && GW.getToken()) {
    GW.clearToken();
    GW.showToast('수정 권한이 있는 관리자 비밀번호를 다시 입력해주세요', 'error');
  } else {
    GW.showToast('수정하려면 관리자 비밀번호를 입력해주세요', 'error');
  }
  _openPostLogin();
};

window._postLoginSubmit = function() {
  var pw = (document.getElementById('post-login-pw').value || '').trim();
  var err = document.getElementById('post-login-err');
  var submitBtn = document.getElementById('post-login-submit-btn');
  err.style.display = 'none';
  if (!pw) {
    err.textContent = '비밀번호를 입력하세요';
    err.style.display = 'block';
    GW.showToast('관리자 비밀번호를 입력해주세요', 'error');
    return;
  }
  var cfToken = '';
  if (_postTurnstileWidgetId != null && window.turnstile) {
    cfToken = window.turnstile.getResponse(_postTurnstileWidgetId) || '';
  }
  if (GW.TURNSTILE_SITE_KEY && !cfToken) {
    err.textContent = 'CAPTCHA를 완료해주세요';
    err.style.display = 'block';
    GW.showToast('CAPTCHA를 완료해주세요', 'error');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = '확인 중…';
  GW.apiFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      password: pw,
      cf_turnstile_response: cfToken || undefined
    })
  })
    .then(function(data) {
      if (!data || !data.token || data.role !== 'full') {
        GW.clearToken();
        err.textContent = '수정 권한이 있는 관리자 계정만 사용할 수 있습니다';
        err.style.display = 'block';
        GW.showToast('수정 권한이 있는 관리자 비밀번호가 아닙니다', 'error');
        if (window.turnstile && _postTurnstileWidgetId != null) window.turnstile.reset(_postTurnstileWidgetId);
        return;
      }
      GW.setToken(data.token);
      GW.setAdminRole(data.role || 'full');
      window._closePostLogin();
      GW.showToast('관리자 인증이 확인되었습니다', 'success');
      _openPostEdit();
    })
    .catch(function(errObj) {
      var message = (errObj && errObj.message) || '비밀번호가 올바르지 않습니다';
      err.textContent = message;
      err.style.display = 'block';
      GW.showToast(message, 'error');
      if (window.turnstile && _postTurnstileWidgetId != null) window.turnstile.reset(_postTurnstileWidgetId);
    })
    .finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = '확인';
    });
};

window._postSaveEdit = function() {
  var submitBtn = document.getElementById('post-edit-submit');
  var category = document.getElementById('post-edit-category').value || 'korea';
  var title = (document.getElementById('post-edit-title-input').value || '').trim();
  var subtitle = (document.getElementById('post-edit-subtitle-input').value || '').trim();
  var specialFeature = (document.getElementById('post-edit-special-feature').value || '').trim();
  var publishDate = (document.getElementById('post-edit-date').value || '').trim();
  var youtubeUrl = (document.getElementById('post-edit-youtube').value || '').trim();
  var locationName = (document.getElementById('post-edit-location-name').value || '').trim();
  var locationAddress = (document.getElementById('post-edit-location-address').value || '').trim();
  var imageCaption = (document.getElementById('post-edit-image-caption').value || '').trim();
  var metaTags = (document.getElementById('post-edit-metatags-input').value || '').trim();
  var author = (document.getElementById('post-edit-author').value || '').trim();
  var aiAssisted = !!document.getElementById('post-edit-ai-assisted').checked;

  if (!title) {
    GW.showToast('제목을 입력해주세요', 'error');
    return;
  }
  if (!_postEditState.editor) {
    GW.showToast('에디터가 준비되지 않았습니다', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중…';

  Promise.resolve()
    .then(function () {
      if (!GW.verifyAdminSession) return true;
      return GW.verifyAdminSession({ force: true });
    })
    .then(function (ok) {
      if (!ok) throw Object.assign(new Error('인증이 필요합니다. 다시 로그인해주세요.'), { status: 401 });
      return _postEditState.editor.save();
    })
    .then(function (outputData) {
      var validation = GW.validatePostEditorOutput(outputData);
      if (!validation.ok) {
        GW.showToast(validation.error, 'error');
        throw new Error('__post_validation__');
      }
      var payload = {
        category: category,
        title: title,
        subtitle: subtitle || null,
        special_feature: specialFeature || null,
        content: JSON.stringify(outputData),
        image_caption: imageCaption || null,
        youtube_url: youtubeUrl || null,
        location_name: locationName || null,
        location_address: locationAddress || null,
        tag: _postEditState.selectedTags.length ? _postEditState.selectedTags.join(',') : null,
        meta_tags: metaTags || null,
        manual_related_posts: _postEditState.manualRelatedPosts || [],
        author: author || null,
        ai_assisted: aiAssisted,
        publish_at: publishDate ? GW.normalizePublishAtValue(publishDate) : undefined
      };
      if ((_postEditSeed.image_url || '') !== (_postEditState.coverImage || '')) {
        payload.image_url = _postEditState.coverImage || null;
      }
      if (!_samePostGallery(_postEditSeed.gallery_images, _postEditState.galleryImages)) {
        payload.gallery_images = _postEditState.galleryImages || [];
      }
      return GW.apiFetch('/api/posts/' + _editPostId, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    })
    .then(function () {
      GW.showToast('기사 수정이 저장되었습니다', 'success');
      window._closePostEdit();
      window.location.reload();
    })
    .catch(function (errObj) {
      if (errObj && errObj.message === '__post_validation__') return;
      if (errObj && errObj.status === 401) {
        GW.clearToken();
        window._closePostEdit();
        GW.showToast('수정 권한을 다시 확인해주세요', 'error');
        _openPostLogin();
        return;
      }
      GW.showToast((errObj && errObj.message) || '기사 수정에 실패했습니다', 'error');
    })
    .finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = '수정 완료';
    });
};

function _samePostGallery(previousRaw, nextItems) {
  function normalize(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      if (typeof item === 'string') return { url: item, caption: '' };
      return {
        url: item && typeof item.url === 'string' ? item.url : '',
        caption: item && typeof item.caption === 'string' ? item.caption : ''
      };
    }).filter(function (item) {
      return item.url;
    }).slice(0, 10);
  }
  var previous = normalize(_parsePostGallerySeed(previousRaw));
  var next = normalize(nextItems);
  return JSON.stringify(previous) === JSON.stringify(next);
}

var _postShareBtn = document.getElementById('post-share-btn');
if (_postShareBtn) {
  _postShareBtn.addEventListener('click', function (event) {
    event.preventDefault();
    window._sharePostLink();
  });
}

var _postEditBtn = document.getElementById('post-edit-btn');
if (_postEditBtn) {
  _postEditBtn.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    window._postEdit();
  });
}

document.querySelectorAll('.post-page-tag-btn').forEach(function (button) {
  button.addEventListener('click', function (event) {
    event.preventDefault();
    var tag = button.getAttribute('data-tag') || '';
    _openPostTagModal(tag);
  });
});

var _specialFeatureToggle = document.getElementById('post-special-feature-toggle');
if (_specialFeatureToggle) {
  _specialFeatureToggle.addEventListener('click', function () {
    var list = document.querySelector('.post-special-feature-list');
    if (!list) return;
    var collapsed = list.classList.toggle('expanded');
    _specialFeatureToggle.textContent = collapsed ? '목록 접기' : '전체 목록보기';
  });
}

window._togglePostLoginPw = function () {
  var input = document.getElementById('post-login-pw');
  var icon  = document.getElementById('post-login-pw-eye-icon');
  if (!input) return;
  var showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  if (icon) {
    icon.innerHTML = showing
      ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
  }
  input.focus();
};

document.getElementById('post-login-pw').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') window._postLoginSubmit();
});
document.getElementById('post-login-modal').addEventListener('click', function (event) {
  if (event.target === event.currentTarget) window._closePostLogin();
});
document.getElementById('post-edit-overlay').addEventListener('click', function (event) {
  if (event.target === event.currentTarget) window._closePostEdit();
});
document.getElementById('post-tag-modal').addEventListener('click', function (event) {
  if (event.target === event.currentTarget) window._closePostTagModal();
});
document.getElementById('post-edit-category').addEventListener('change', function (event) {
  _postEditState.activeCategory = event.target.value || 'korea';
  _postEditState.selectedTags = [];
  _syncPostCategoryChip(_postEditState.activeCategory);
  _loadPostTagOptions(_postEditState.activeCategory);
});
document.getElementById('post-tag-new-btn').addEventListener('click', function () {
  _addPostManagedTag();
});
document.getElementById('post-edit-related-search').addEventListener('input', function () {
  window._searchPostManualRelated();
});
document.getElementById('post-tag-new-input').addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    _addPostManagedTag();
  }
});
document.getElementById('post-cover-btn').addEventListener('click', function () {
  window._postUploadCover();
});
document.addEventListener('keydown', function (event) {
  if (event.key !== 'Escape') return;
  var loginModal = document.getElementById('post-login-modal');
  var editOverlay = document.getElementById('post-edit-overlay');
  if (editOverlay && editOverlay.classList.contains('open')) {
    window._closePostEdit();
    return;
  }
  var tagModal = document.getElementById('post-tag-modal');
  if (tagModal && tagModal.classList.contains('open')) {
    window._closePostTagModal();
    return;
  }
  if (loginModal && loginModal.classList.contains('open')) {
    window._closePostLogin();
  }
});

// ── OpenStreetMap location init ──────────────────────────
(function _initPostPageLocationMaps() {
  var frames = document.querySelectorAll('.post-location-map-frame[data-location-addr]');
  frames.forEach(function (frame) {
    var addr  = frame.getAttribute('data-location-addr') || '';
    var title = frame.getAttribute('data-location-title') || addr;
    if (!addr) return;
    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addr) + '&format=json&limit=1', {
      headers: { 'Accept-Language': 'ko,en', 'User-Agent': 'GilwellMedia/1.0' }
    })
      .then(function (r) { return r.json(); })
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
}());

var _postLikeBtn = document.getElementById('post-like-btn');
if (_postLikeBtn) {
  _postLikeBtn.addEventListener('click', function() {
    if (_postLikeBtn.disabled) return;
    _postLikeBtn.classList.add('is-busy');
    GW.apiFetch('/api/posts/' + _editPostId + '/like', { method: 'POST' })
      .then(function(data) {
        var countEl = document.getElementById('post-like-count');
        if (countEl) countEl.textContent = data.likes || 0;
        _postLikeBtn.disabled = true;
        _postLikeBtn.classList.add('liked');
        _postLikeBtn.classList.remove('is-busy');
        var help = document.querySelector('.post-like-help');
        if (help) help.textContent = '이미 공감한 기사입니다';
      })
      .catch(function(err) {
        _postLikeBtn.classList.remove('is-busy');
        GW.showToast(err.message || '공감 처리에 실패했습니다', 'error');
      });
  });
}
})();
