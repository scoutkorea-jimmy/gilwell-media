/**
 * Gilwell Media · Admin Panel Logic
 * Depends on GW namespace from js/main.js.
 */
(function () {
  'use strict';

  var editingId       = null;
  var _adminEditor    = null;
  var _adminCoverImg  = null;
  var _adminSelTags   = [];   // multi-select tags
  var _reorderDirty   = false; // drag-and-drop changed order
  var _heroPostIds    = [];   // current hero post IDs (up to 3)

  // Pagination state
  var _listPage     = 1;
  var _listCat      = 'all';
  var _listTotal    = 0;
  var _listSearch   = '';
  var _listSearchTimer = null;
  var _PAGE_SIZE    = 20;

  // Hero search cache
  var _allPosts = [];

  // ─── Boot ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (GW.getToken()) { showAdmin(); }
    var pwInput = document.getElementById('pw-input');
    if (pwInput) { pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); }

    // Handle ?edit=ID in URL (for edit button on post pages)
    var editParam = new URLSearchParams(location.search).get('edit');
    if (editParam && GW.getToken()) {
      showAdmin();
      setTimeout(function () { editPost(parseInt(editParam, 10)); }, 500);
    }
  });

  // ─── Login ───────────────────────────────────────────────
  window.doLogin = function () {
    var pw  = (document.getElementById('pw-input').value || '').trim();
    var err = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');
    if (!pw) return;

    // Collect Turnstile token if widget is active
    var cfInput = document.querySelector('#login-turnstile input[name="cf-turnstile-response"]');
    var cfToken = cfInput ? cfInput.value : '';
    if (GW.TURNSTILE_SITE_KEY && !cfToken) {
      err.textContent = 'CAPTCHA를 완료해주세요'; err.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = '로그인 중…'; err.style.display = 'none';
    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw, cf_turnstile_response: cfToken }),
    })
      .then(function (data) {
        GW.setToken(data.token);
        showAdmin();
        var editParam = new URLSearchParams(location.search).get('edit');
        if (editParam) {
          setTimeout(function () { editPost(parseInt(editParam, 10)); }, 600);
        }
      })
      .catch(function (e) {
        err.textContent = e.message || '비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        document.getElementById('pw-input').value = ''; document.getElementById('pw-input').focus();
        if (window.turnstile) window.turnstile.reset();
      })
      .finally(function () { btn.disabled = false; btn.textContent = '관리자 입장'; });
  };

  window.doLogout = function () {
    GW.clearToken();
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-screen').style.display = 'none';
    document.getElementById('pw-input').value = '';
  };

  function showAdmin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    // Load Editor.js then initialize
    _loadEditorJs(function () { _initAdminEditor(); });
    // Load tags for selector
    loadTagsAdmin();
    loadTickerAdmin();
    loadHeroAdmin();
    loadEditorsAdmin();
    loadTranslationsAdmin();
    loadAiDisclaimerAdmin();
    loadContributorsAdmin();
    loadAdminList();
    loadDashboard();
    // Default date input to today
    var dateEl = document.getElementById('art-date');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
    updateCatPreview();
    // Default to dashboard tab
    showAdminTab('dashboard');
  }

  // ─── Tab navigation ───────────────────────────────────────
  window.showAdminTab = function (tab) {
    document.querySelectorAll('.admin-tab-panel').forEach(function (p) { p.classList.remove('active'); });
    var panel = document.getElementById('admin-tab-' + tab);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.admin-tab-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.getElementById('tab-btn-' + tab);
    if (btn) btn.classList.add('active');
    if (tab === 'list') loadAdminList();
    if (tab === 'dashboard') loadDashboard();
  };

  // ─── Editor.js loader ─────────────────────────────────────
  function _loadEditorJs(callback) {
    if (window.EditorJS) { callback(); return; }
    function loadScript(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = cb; document.head.appendChild(s); }
    loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.29.1/dist/editorjs.umd.js', function () {
      var pending = 3;
      function done() { if (--pending === 0) callback(); }
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.8.1/dist/header.umd.js', done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.10.0/dist/list.umd.js',   done);
      loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.7.5/dist/quote.umd.js',  done);
    });
  }

  function _initAdminEditor() {
    if (_adminEditor) return;
    _adminEditor = new window.EditorJS({
      holder: 'admin-editorjs',
      placeholder: '내용을 작성하세요…',
      tools: {
        header: { class: window.Header, config: { levels: [2,3,4], defaultLevel: 2 } },
        list:   { class: window.List,   inlineToolbar: true },
        quote:  { class: window.Quote,  inlineToolbar: true },
        image:  { class: GW.makeEditorImageTool() },
      },
    });
  }

  // ─── Cover image upload ───────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('admin-cover-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { _uploadAdminCover(); });
  });

  function _uploadAdminCover() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var maxW = 1600; var ratio = Math.min(maxW / img.width, 1);
          canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          _adminCoverImg = canvas.toDataURL('image/jpeg', 0.82);
          var preview = document.getElementById('admin-cover-preview');
          if (preview) {
            preview.innerHTML = '<img src="' + _adminCoverImg + '" class="cover-preview-img">' +
              '<button type="button" class="cover-remove-btn" id="admin-cover-remove">× 제거</button>';
            document.getElementById('admin-cover-remove').addEventListener('click', function () {
              _adminCoverImg = null; preview.innerHTML = '';
            });
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // ─── Tag selector (multi-select) ─────────────────────────
  function loadTagsForSelector() {
    fetch('/api/settings/tags', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var tags = data.items || [];
        var sel  = document.getElementById('admin-tag-selector');
        if (!sel) return;
        var html = '<button type="button" class="tag-pill" data-tag="">없음</button>';
        tags.forEach(function (t) {
          html += '<button type="button" class="tag-pill" data-tag="' + GW.escapeHtml(t) + '">' + GW.escapeHtml(t) + '</button>';
        });
        sel.innerHTML = html;
        _syncTagPills(sel);
        sel.querySelectorAll('.tag-pill').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var tagVal = btn.dataset.tag || '';
            if (tagVal === '') {
              _adminSelTags = [];
            } else {
              var idx = _adminSelTags.indexOf(tagVal);
              if (idx >= 0) { _adminSelTags.splice(idx, 1); }
              else { _adminSelTags.push(tagVal); }
            }
            _syncTagPills(sel);
          });
        });
      })
      .catch(function () {});
  }

  function _syncTagPills(sel) {
    if (!sel) return;
    sel.querySelectorAll('.tag-pill').forEach(function (b) {
      var t = b.dataset.tag || '';
      if (t === '') {
        b.classList.toggle('active', _adminSelTags.length === 0);
      } else {
        b.classList.toggle('active', _adminSelTags.indexOf(t) >= 0);
      }
    });
  }

  // ─── Save (create or update) ──────────────────────────────
  window.savePost = function () {
    var category = document.getElementById('art-category').value;
    var title    = (document.getElementById('art-title').value    || '').trim();
    var subtitle = (document.getElementById('art-subtitle').value || '').trim();
    var author   = (document.getElementById('art-author').value   || '').trim();
    var metaTags = (document.getElementById('art-metatags').value || '').trim();
    var btn      = document.getElementById('submit-btn');

    if (!title)      { GW.showToast('제목을 입력해주세요', 'error'); return; }
    if (!_adminEditor) { GW.showToast('에디터가 준비되지 않았습니다', 'error'); return; }

    btn.disabled = true; btn.textContent = editingId ? '수정 중…' : '게재 중…';

    _adminEditor.save().then(function (outputData) {
      var hasContent = outputData.blocks && outputData.blocks.length > 0;
      if (!hasContent && !editingId) {
        GW.showToast('내용을 입력해주세요', 'error');
        btn.disabled = false; btn.textContent = editingId ? '수정 완료' : '게재하기';
        return;
      }
      var content = JSON.stringify(outputData);
      var aiEl = document.getElementById('art-ai-assisted');
      var dateEl = document.getElementById('art-date');
      var body = {
        category: category,
        title: title,
        subtitle: subtitle || null,
        content: content,
        image_url: _adminCoverImg || null,
        tag: _adminSelTags.length ? _adminSelTags.join(',') : null,
        meta_tags: metaTags || null,
        author: author || undefined,
        ai_assisted: aiEl ? (aiEl.checked ? 1 : 0) : 0,
        publish_date: (dateEl && dateEl.value) ? dateEl.value : undefined,
      };
      var url    = editingId ? '/api/posts/' + editingId : '/api/posts';
      var method = editingId ? 'PUT' : 'POST';
      GW.apiFetch(url, { method: method, body: JSON.stringify(body) })
        .then(function () {
          GW.showToast(editingId ? '수정됐습니다' : '게재됐습니다', 'success');
          cancelEdit();
          loadAdminList();
          showAdminTab('list');
        })
        .catch(function (err) {
          if (err.status === 401) { GW.showToast('세션 만료. 다시 로그인해주세요.', 'error'); doLogout(); }
          else GW.showToast(err.message || '저장 실패', 'error');
        })
        .finally(function () { btn.disabled = false; btn.textContent = editingId ? '수정 완료' : '게재하기'; });
    }).catch(function () {
      GW.showToast('에디터 오류', 'error');
      btn.disabled = false; btn.textContent = editingId ? '수정 완료' : '게재하기';
    });
  };

  // ─── Edit ─────────────────────────────────────────────────
  window.editPost = function (id) {
    // Update URL without reload so browser history reflects the edit
    if (history.replaceState) {
      history.replaceState(null, '', '/admin.html?edit=' + id);
    }
    GW.apiFetch('/api/posts/' + id)
      .then(function (data) {
        var p = data.post;
        editingId = p.id;

        // Switch to write tab
        showAdminTab('write');

        document.getElementById('art-category').value  = p.category;
        document.getElementById('art-title').value     = p.title;
        document.getElementById('art-subtitle').value  = p.subtitle || '';
        document.getElementById('art-author').value    = p.author || '';
        document.getElementById('art-metatags').value  = p.meta_tags || '';
        var aiChk = document.getElementById('art-ai-assisted');
        if (aiChk) aiChk.checked = !!p.ai_assisted;
        updateCatPreview();

        // Load cover image
        _adminCoverImg = p.image_url || null;
        var preview = document.getElementById('admin-cover-preview');
        if (preview) {
          if (_adminCoverImg && _adminCoverImg.startsWith('http')) {
            preview.innerHTML = '<img src="' + GW.escapeHtml(_adminCoverImg) + '" class="cover-preview-img">' +
              '<button type="button" class="cover-remove-btn" id="admin-cover-remove">× 제거</button>';
            document.getElementById('admin-cover-remove').addEventListener('click', function () {
              _adminCoverImg = null; preview.innerHTML = '';
            });
          } else if (_adminCoverImg) {
            preview.innerHTML = '<img src="' + _adminCoverImg + '" class="cover-preview-img">' +
              '<button type="button" class="cover-remove-btn" id="admin-cover-remove">× 제거</button>';
            document.getElementById('admin-cover-remove').addEventListener('click', function () {
              _adminCoverImg = null; preview.innerHTML = '';
            });
          } else {
            preview.innerHTML = '';
          }
        }

        // Load tag selector (multi-select)
        _adminSelTags = p.tag ? p.tag.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
        var sel = document.getElementById('admin-tag-selector');
        if (sel) _syncTagPills(sel);

        // Load publish date
        var dateEl = document.getElementById('art-date');
        if (dateEl && p.created_at) {
          dateEl.value = p.created_at.slice(0, 10);
        }

        // Load content into Editor.js
        if (_adminEditor) {
          _adminEditor.isReady.then(function () {
            var content = p.content || '';
            var editorData;
            if (content.trim().charAt(0) === '{') {
              try { editorData = JSON.parse(content); } catch (e) { editorData = null; }
            }
            if (editorData && Array.isArray(editorData.blocks)) {
              _adminEditor.render(editorData).catch(function () {});
            } else {
              // Plain text → single paragraph
              _adminEditor.render({ blocks: [{ type: 'paragraph', data: { text: content } }] }).catch(function () {});
            }
          });
        }

        document.getElementById('form-title').textContent = '게시글 수정';
        document.getElementById('submit-btn').textContent = '수정 완료';
        document.getElementById('submit-btn').classList.add('editing');
        document.getElementById('cancel-btn').classList.add('visible');
      })
      .catch(function () { GW.showToast('게시글을 불러오지 못했습니다.', 'error'); });
  };

  // ─── Delete ───────────────────────────────────────────────
  window.deletePost = function (id) {
    if (!confirm('이 게시글을 삭제할까요?\n삭제된 내용은 복구되지 않습니다.')) return;
    GW.apiFetch('/api/posts/' + id, { method: 'DELETE' })
      .then(function () { GW.showToast('삭제됐습니다', 'success'); loadAdminList(); })
      .catch(function (err) {
        if (err.status === 401) { GW.showToast('세션 만료.', 'error'); doLogout(); }
        else GW.showToast(err.message || '삭제 실패', 'error');
      });
  };

  // ─── Cancel edit ──────────────────────────────────────────
  window.cancelEdit = function () {
    editingId = null;
    if (history.replaceState) history.replaceState(null, '', '/admin.html');
    _adminCoverImg = null;
    _adminSelTags = [];
    document.getElementById('art-title').value    = '';
    document.getElementById('art-subtitle').value = '';
    document.getElementById('art-metatags').value = '';
    var dateEl = document.getElementById('art-date');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    var authorEl = document.getElementById('art-author');
    if (authorEl && authorEl.tagName === 'SELECT') authorEl.selectedIndex = 0;

    document.getElementById('art-category').value = 'korea';
    var aiChk = document.getElementById('art-ai-assisted');
    if (aiChk) aiChk.checked = false;
    var preview = document.getElementById('admin-cover-preview');
    if (preview) preview.innerHTML = '';
    var sel = document.getElementById('admin-tag-selector');
    if (sel) _syncTagPills(sel);
    if (_adminEditor) { _adminEditor.isReady.then(function(){_adminEditor.clear();}); }
    document.getElementById('form-title').textContent  = '새 게시글 작성';
    document.getElementById('submit-btn').textContent  = '게재하기';
    document.getElementById('submit-btn').classList.remove('editing');
    document.getElementById('cancel-btn').classList.remove('visible');
    updateCatPreview();
  };

  // ─── Admin list loading (paginated) ──────────────────────
  function loadAdminList() {
    var reorderMode = _canReorderCurrentList();
    var url = reorderMode ? '/api/posts?all=1' : '/api/posts?page=' + _listPage;
    if (_listCat !== 'all') url += '&category=' + _listCat;
    if (_listSearch) url += '&q=' + encodeURIComponent(_listSearch);

    GW.apiFetch(url)
      .then(function (data) {
        _listTotal = data.total;
        _allPosts  = _allPosts.concat(data.posts || []); // for hero search — rebuild separately
        renderAdminList(data.posts || []);
        renderPagination(reorderMode);
        renderReorderControls(reorderMode);
        updateStats(data.posts || []);
      })
      .catch(function (err) {
        console.error(err);
        if (err.status === 401) { GW.showToast('세션이 만료됐습니다.', 'error'); doLogout(); }
        else GW.showToast('목록을 불러오지 못했습니다.', 'error');
      });
  }

  function renderAdminList(posts) {
    var list  = document.getElementById('article-list');
    var count = document.getElementById('article-count');
    if (count) count.textContent = _listTotal + '건';
    if (!posts || posts.length === 0) {
      list.innerHTML = '<div class="list-empty">게시글이 없습니다</div>';
      return;
    }
    var reorderMode = _canReorderCurrentList();
    list.innerHTML = posts.map(function (p) {
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      var isUnpublished = p.published === 0;
      var hasSortOrder = p.sort_order !== null && p.sort_order !== undefined;
      return (
        '<div class="article-item" draggable="' + (reorderMode ? 'true' : 'false') + '" data-id="' + p.id + '"' + (isUnpublished ? ' style="opacity:0.65;"' : '') + '>' +
          (reorderMode ? '<div class="drag-handle" title="드래그로 순서 변경">☰</div>' : '') +
          '<div class="article-item-content">' +
            '<div style="margin-bottom:6px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' +
              '<span style="display:inline-block;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;color:#f5f3ee;background:' + cat.color + ';">' + cat.label + '</span>' +
              (isUnpublished ? '<span style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;background:#cc4444;color:#fff;">비공개</span>' : '') +
              (hasSortOrder ? '<span style="font-family:\'DM Mono\',monospace;font-size:9px;padding:2px 6px;border:1px solid #622599;color:#622599;">순서 ' + (p.sort_order + 1) + '</span>' : '') +
            '</div>' +
            '<h4>' + GW.escapeHtml(p.title) + '</h4>' +
            '<div class="item-meta">' + GW.formatDate(p.created_at) + ' · 조회 ' + (p.views || 0) + (p.author ? ' · ' + GW.escapeHtml(p.author) : '') + '</div>' +
          '</div>' +
          '<div class="item-actions">' +
            '<button onclick="togglePublished(' + p.id + ',' + (isUnpublished ? 0 : 1) + ')" title="' + (isUnpublished ? '비공개→공개' : '공개→비공개') + '" style="font-size:14px;padding:4px 8px;border:1px solid var(--border);background:none;cursor:pointer;color:' + (isUnpublished ? '#cc4444' : '#44aa44') + ';">' + (isUnpublished ? '🔒' : '🌐') + '</button>' +
            '<button class="btn-featured" onclick="toggleFeatured(' + p.id + ',' + (p.featured ? 1 : 0) + ')" title="에디터 추천 토글" style="font-size:16px;padding:4px 8px;border:1px solid var(--border);background:none;cursor:pointer;color:' + (p.featured ? '#e6a800' : 'var(--muted)') + ';">' + (p.featured ? '★' : '☆') + '</button>' +
            '<button class="btn-edit"   onclick="editPost('   + p.id + ')">수정</button>' +
            '<button class="btn-delete" onclick="deletePost(' + p.id + ')">삭제</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    // Setup drag-and-drop
    if (reorderMode) _initDragAndDrop(list);
  }

  var _dragSrc = null;

  function _initDragAndDrop(list) {
    var items = list.querySelectorAll('.article-item');
    items.forEach(function (item) {
      item.addEventListener('dragstart', function (e) {
        _dragSrc = item;
        e.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.4';
      });
      item.addEventListener('dragend', function () {
        item.style.opacity = '';
        list.querySelectorAll('.article-item').forEach(function (i) { i.classList.remove('drag-over'); });
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.querySelectorAll('.article-item').forEach(function (i) { i.classList.remove('drag-over'); });
        if (item !== _dragSrc) item.classList.add('drag-over');
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        if (!_dragSrc || _dragSrc === item) return;
        // Determine insertion position
        var rect = item.getBoundingClientRect();
        var after = e.clientY > rect.top + rect.height / 2;
        if (after) {
          item.parentNode.insertBefore(_dragSrc, item.nextSibling);
        } else {
          item.parentNode.insertBefore(_dragSrc, item);
        }
        item.classList.remove('drag-over');
        _reorderDirty = true;
        var btn = document.getElementById('reorder-save-btn');
        if (btn) btn.style.display = '';
      });
    });
  }

  window.saveReorder = function () {
    if (!_canReorderCurrentList()) {
      GW.showToast('정렬은 전체 목록에서만 저장할 수 있습니다', 'error');
      return;
    }
    var list = document.getElementById('article-list');
    var ids = [];
    list.querySelectorAll('.article-item[data-id]').forEach(function (el) {
      ids.push(parseInt(el.getAttribute('data-id'), 10));
    });
    GW.apiFetch('/api/posts/reorder', { method: 'PUT', body: JSON.stringify({ order: ids }) })
      .then(function () {
        GW.showToast('순서가 저장됐습니다', 'success');
        _reorderDirty = false;
        var btn = document.getElementById('reorder-save-btn');
        if (btn) btn.style.display = 'none';
        loadAdminList();
      })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  window.clearReorder = function () {
    if (!confirm('모든 게시글의 수동 순서를 초기화하고 날짜순으로 되돌릴까요?')) return;
    GW.apiFetch('/api/posts/reorder', { method: 'DELETE' })
      .then(function () { GW.showToast('순서가 초기화됐습니다', 'success'); loadAdminList(); })
      .catch(function (err) { GW.showToast(err.message || '초기화 실패', 'error'); });
  };

  function renderPagination(reorderMode) {
    var totalPages = Math.max(1, Math.ceil(_listTotal / _PAGE_SIZE));
    var pgEl = document.getElementById('admin-pagination');
    var infoEl = document.getElementById('admin-page-info');
    var prevEl = document.getElementById('admin-prev-btn');
    var nextEl = document.getElementById('admin-next-btn');
    if (!pgEl) return;
    if (reorderMode) {
      pgEl.style.display = 'none';
      return;
    }
    pgEl.style.display = totalPages > 1 ? 'flex' : 'none';
    if (infoEl) infoEl.textContent = _listPage + ' / ' + totalPages;
    if (prevEl) prevEl.disabled = _listPage <= 1;
    if (nextEl) nextEl.disabled = _listPage >= totalPages;
  }

  function _canReorderCurrentList() {
    return _listCat === 'all' && !_listSearch;
  }

  function renderReorderControls(reorderMode) {
    var saveBtn = document.getElementById('reorder-save-btn');
    if (saveBtn) saveBtn.style.display = reorderMode && _reorderDirty ? '' : 'none';
    var hintId = 'reorder-mode-hint';
    var count = document.getElementById('article-count');
    if (!count) return;
    var hint = document.getElementById(hintId);
    if (!reorderMode) {
      if (!hint) {
        hint = document.createElement('span');
        hint.id = hintId;
        hint.style.marginLeft = '8px';
        hint.style.fontSize = '11px';
        hint.style.color = 'var(--muted)';
        count.parentNode.insertBefore(hint, count.nextSibling);
      }
      hint.textContent = '정렬은 검색/카테고리 해제 시 전체 목록에서만 가능합니다';
    } else if (hint) {
      hint.remove();
    }
  }

  window.adminListPageChange = function (delta) {
    var totalPages = Math.max(1, Math.ceil(_listTotal / _PAGE_SIZE));
    _listPage = Math.max(1, Math.min(totalPages, _listPage + delta));
    loadAdminList();
  };

  window.adminListFilter = function (cat) {
    _listCat  = cat;
    _listPage = 1;
    _reorderDirty = false;
    ['all','korea','apr','worm'].forEach(function (c) {
      var tab = document.getElementById('admin-tab-' + c);
      if (!tab) return;
      tab.style.background = c === cat ? 'var(--black)' : 'var(--bg)';
      tab.style.color      = c === cat ? 'var(--white)' : 'var(--muted)';
    });
    loadAdminList();
  };

  window.adminSearchDebounce = function () {
    clearTimeout(_listSearchTimer);
    _listSearchTimer = setTimeout(function () {
      _listSearch = (document.getElementById('admin-list-search').value || '').trim();
      _listPage   = 1;
      _reorderDirty = false;
      loadAdminList();
    }, 350);
  };

  function updateStats(posts) {
    // Fetch category stats from the API stats endpoint
    fetch('/api/stats').then(function(r){return r.json();}).then(function(d){
      var k = document.getElementById('stat-korea'); if(k) k.textContent = d.korea || 0;
      var a = document.getElementById('stat-apr');   if(a) a.textContent = d.apr   || 0;
      var w = document.getElementById('stat-worm');  if(w) w.textContent = d.worm  || 0;
    }).catch(function(){});
  }

  // ─── Category preview ─────────────────────────────────────
  window.updateCatPreview = function () {
    var cat = document.getElementById('art-category');
    var preview = document.getElementById('cat-preview');
    if (!cat || !preview) return;
    var meta = GW.CATEGORIES[cat.value] || GW.CATEGORIES.korea;
    preview.textContent = meta.label;
    preview.style.background = meta.color;
  };

  // ─── Toggle Published ─────────────────────────────────────
  window.togglePublished = function (id, currentVal) {
    var newVal = currentVal ? 0 : 1;
    GW.apiFetch('/api/posts/' + id, { method: 'PATCH', body: JSON.stringify({ published: newVal }) })
      .then(function () { GW.showToast(newVal ? '공개됐습니다' : '비공개됐습니다', 'success'); loadAdminList(); })
      .catch(function (err) { GW.showToast(err.message || '변경 실패', 'error'); });
  };

  // ─── Toggle Featured ──────────────────────────────────────
  window.toggleFeatured = function (id, currentVal) {
    var newVal = currentVal ? 0 : 1;
    GW.apiFetch('/api/posts/' + id, { method: 'PATCH', body: JSON.stringify({ featured: newVal }) })
      .then(function () { GW.showToast(newVal ? '에디터 추천 추가' : '에디터 추천 제거', 'success'); loadAdminList(); })
      .catch(function (err) { GW.showToast(err.message || '변경 실패', 'error'); });
  };

  // ─── Author admin ─────────────────────────────────────────
  // ─── Editors A-Z ──────────────────────────────────────────
  var _editors = {}; // { A: "name", B: "", ... }

  function loadEditorsAdmin() {
    GW.apiFetch('/api/settings/editors')
      .then(function (data) {
        _editors = data.editors || {};
        _renderEditorSelect();
        _renderEditorsManager();
      })
      .catch(function () {});
  }

  function _renderEditorSelect() {
    var sel = document.getElementById('art-author');
    if (!sel || sel.tagName !== 'SELECT') return;
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    sel.innerHTML = letters.map(function (l) {
      var name  = _editors[l] || '';
      var label = 'Editor ' + l + (name ? ' — ' + name : '');
      return '<option value="Editor ' + l + '">' + GW.escapeHtml(label) + '</option>';
    }).join('');
  }

  function _renderEditorsManager() {
    var container = document.getElementById('editors-manager');
    if (!container) return;
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    container.innerHTML = letters.map(function (l) {
      var name = _editors[l] || '';
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">' +
        '<span style="font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:.08em;min-width:64px;color:var(--ink);">Editor ' + l + '</span>' +
        '<input type="text" data-editor="' + l + '" value="' + GW.escapeHtml(name) + '" placeholder="실명 (비공개, 선택)" maxlength="60" ' +
          'style="flex:1;padding:5px 10px;border:1px solid var(--border);font-family:\'Noto Sans KR\',sans-serif;font-size:12px;outline:none;" />' +
      '</div>';
    }).join('');
  }

  window.saveEditors = function () {
    var inputs  = document.querySelectorAll('#editors-manager input[data-editor]');
    var editors = {};
    inputs.forEach(function (inp) {
      editors[inp.getAttribute('data-editor')] = inp.value.trim();
    });
    GW.apiFetch('/api/settings/editors', { method: 'PUT', body: JSON.stringify({ editors: editors }) })
      .then(function (data) {
        _editors = data.editors || editors;
        _renderEditorSelect();
        GW.showToast('에디터 정보가 저장됐습니다', 'success');
      })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  // ─── Ticker admin ─────────────────────────────────────────
  function loadTickerAdmin() {
    fetch('/api/settings/ticker').then(function(r){return r.json();}).then(function(data){
      var ta = document.getElementById('ticker-textarea');
      if (ta && data.items) ta.value = data.items.join('\n');
    }).catch(function(){});
  }

  // ─── Tags admin ───────────────────────────────────────────
  function loadTagsAdmin() {
    fetch('/api/settings/tags', { cache: 'no-store' }).then(function(r){return r.json();}).then(function(data){
      var ta = document.getElementById('tags-textarea');
      if (ta && data.items) ta.value = data.items.join('\n');
      loadTagsForSelector();
    }).catch(function(){});
  }

  window.saveTags = function () {
    var ta = document.getElementById('tags-textarea'); if (!ta) return;
    var items = ta.value.split('\n').map(function(s){return s.trim();}).filter(Boolean);
    GW.apiFetch('/api/settings/tags', { method: 'PUT', body: JSON.stringify({ items: items }) })
      .then(function () { GW.showToast('태그가 저장됐습니다', 'success'); loadTagsForSelector(); })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  window.saveTicker = function () {
    var ta = document.getElementById('ticker-textarea'); if (!ta) return;
    var items = ta.value.split('\n').map(function(s){return s.trim();}).filter(Boolean);
    if (!items.length) { GW.showToast('항목을 입력해주세요', 'error'); return; }
    GW.apiFetch('/api/settings/ticker', { method: 'PUT', body: JSON.stringify({ items: items }) })
      .then(function () { GW.showToast('티커가 저장됐습니다', 'success'); })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

  // ─── Translations admin ───────────────────────────────────
  var _translationOverrides = {};
  function loadTranslationsAdmin() {
    fetch('/api/settings/translations').then(function(r){return r.json();}).then(function(data){
      _translationOverrides = data.strings || {};
      renderTranslationsTable();
    }).catch(function(){ renderTranslationsTable(); });
  }
  function renderTranslationsTable() {
    var container = document.getElementById('translations-table'); if (!container) return;
    var keys = Object.keys(GW.STRINGS);
    container.innerHTML = keys.map(function (key) {
      var def = GW.STRINGS[key]; var over = _translationOverrides[key] || {};
      var koVal = over.ko !== undefined ? over.ko : (def.ko || '');
      var enVal = over.en !== undefined ? over.en : (def.en || '');
      return '<div style="border:1px solid var(--border);padding:10px 12px;">' +
        '<div style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">' + key + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<div style="flex:1;"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:3px;">KOR</label>' +
          '<input type="text" value="' + escapeAttr(koVal) + '" data-tkey="' + key + '" data-tlang="ko" style="width:100%;padding:6px 8px;border:1px solid var(--border);font-size:12px;font-family:\'Noto Sans KR\',sans-serif;outline:none;"></div>' +
          '<div style="flex:1;"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:3px;">ENG</label>' +
          '<input type="text" value="' + escapeAttr(enVal) + '" data-tkey="' + key + '" data-tlang="en" style="width:100%;padding:6px 8px;border:1px solid var(--border);font-size:12px;font-family:\'Noto Sans KR\',sans-serif;outline:none;"></div>' +
        '</div></div>';
    }).join('');
  }
  function escapeAttr(str) { return String(str||'').replace(/"/g,'&quot;'); }
  window.saveTranslations = function () {
    var inputs = document.querySelectorAll('#translations-table input[data-tkey]');
    var strings = {};
    inputs.forEach(function(inp){ var key=inp.getAttribute('data-tkey'); var lang=inp.getAttribute('data-tlang'); if(!strings[key]) strings[key]={}; strings[key][lang]=inp.value; });
    GW.apiFetch('/api/settings/translations', { method: 'PUT', body: JSON.stringify({ strings: strings }) })
      .then(function(){ GW.showToast('번역이 저장됐습니다','success'); })
      .catch(function(err){ GW.showToast(err.message||'저장 실패','error'); });
  };

  // ─── Hero admin (up to 3 articles) ───────────────────────
  function loadHeroAdmin() {
    fetch('/api/settings/hero').then(function(r){return r.json();}).then(function(data){
      _heroPostIds = (data.posts || []).map(function(p){ return p.id; });
      renderHeroSlots(data.posts || []);
    }).catch(function(){});
  }

  function renderHeroSlots(posts) {
    var el = document.getElementById('hero-slots'); if (!el) return;
    if (!posts.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">선택된 기사 없음</div>';
      return;
    }
    el.innerHTML = posts.map(function(p, i){
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);background:var(--bg);">' +
        '<span style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--muted);flex-shrink:0;">' + (i+1) + '</span>' +
        '<span style="display:inline-block;font-size:9px;font-family:\'DM Mono\',monospace;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;color:#f5f3ee;background:'+cat.color+';flex-shrink:0;">'+cat.label+'</span>' +
        '<span style="flex:1;font-size:13px;">' + GW.escapeHtml(p.title) + '</span>' +
        '<button onclick="removeHeroSlot(' + i + ')" style="font-family:\'DM Mono\',monospace;font-size:10px;padding:3px 8px;border:1px solid #cc4444;background:none;cursor:pointer;color:#cc4444;">제거</button>' +
      '</div>';
    }).join('');
  }

  window.removeHeroSlot = function (index) {
    _heroPostIds.splice(index, 1);
    _saveHeroIds();
  };

  window.heroSearch = function () {
    var q = (document.getElementById('hero-search-input').value || '').trim();
    var list = document.getElementById('hero-search-results'); if (!list) return;
    if (!q) { list.innerHTML = ''; return; }
    GW.apiFetch('/api/posts?q=' + encodeURIComponent(q))
      .then(function(data){
        var results = (data.posts || []).slice(0, 8);
        if (!results.length) { list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">검색 결과 없음</div>'; return; }
        list.innerHTML = results.map(function(p){
          var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
          var already = _heroPostIds.indexOf(p.id) >= 0;
          return '<div class="hero-result-item" style="' + (already ? 'opacity:0.5;pointer-events:none;' : '') + '" onclick="addHeroSlot(' + p.id + ')">' +
            '<span style="font-size:9px;font-family:\'DM Mono\',monospace;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;color:#f5f3ee;background:'+cat.color+';margin-right:6px;">'+cat.label+'</span>' +
            GW.escapeHtml(p.title) +
            (already ? ' <span style="font-size:10px;color:var(--muted);">(이미 추가됨)</span>' : '') +
          '</div>';
        }).join('');
      }).catch(function(){ list.innerHTML = ''; });
  };

  window.addHeroSlot = function (id) {
    if (_heroPostIds.length >= 3) { GW.showToast('히어로는 최대 3개까지 설정할 수 있습니다', 'error'); return; }
    if (_heroPostIds.indexOf(id) >= 0) { GW.showToast('이미 추가된 기사입니다', 'error'); return; }
    _heroPostIds.push(id);
    _saveHeroIds();
    document.getElementById('hero-search-results').innerHTML = '';
    document.getElementById('hero-search-input').value = '';
  };

  function _saveHeroIds() {
    GW.apiFetch('/api/settings/hero', { method: 'PUT', body: JSON.stringify({ post_ids: _heroPostIds }) })
      .then(function(data){
        GW.showToast('히어로 기사가 저장됐습니다', 'success');
        loadHeroAdmin();
      })
      .catch(function(err){ GW.showToast(err.message||'저장 실패','error'); });
  }

  // ─── Dashboard ────────────────────────────────────────────
  function loadDashboard() {
    fetch('/api/stats').then(function(r){return r.json();}).then(function(d){
      var t = document.getElementById('dash-total');
      var k = document.getElementById('dash-korea');
      var a = document.getElementById('dash-apr');
      var w = document.getElementById('dash-worm');
      if(k) k.textContent = d.korea || 0;
      if(a) a.textContent = d.apr   || 0;
      if(w) w.textContent = d.worm  || 0;
      if(t) t.textContent = ((d.korea||0) + (d.apr||0) + (d.worm||0));
    }).catch(function(){});

    // Load 5 most recent posts
    fetch('/api/posts?page=1')
      .then(function(r){ return r.json(); })
      .then(function(data){
        var el = document.getElementById('dash-recent-list'); if (!el) return;
        var posts = (data.posts || []).slice(0, 5);
        if (!posts.length) { el.innerHTML = '<div class="list-empty">게시글이 없습니다</div>'; return; }
        el.innerHTML = posts.map(function(p){
          var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
          return '<div class="article-item" style="cursor:pointer;" onclick="editPost(' + p.id + ');showAdminTab(\'write\')">' +
            '<div class="article-item-content">' +
              '<div style="margin-bottom:4px;display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-block;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;color:#f5f3ee;background:'+cat.color+';">' + cat.label + '</span>' +
              '</div>' +
              '<h4>' + GW.escapeHtml(p.title) + '</h4>' +
              '<div class="item-meta">' + GW.formatDate(p.created_at) + ' · 조회 ' + (p.views||0) + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }).catch(function(){});
  }

  // ─── Contributors admin ───────────────────────────────────
  var _contributors = [];
  var _editingContributorIdx = null;

  function loadContributorsAdmin() {
    fetch('/api/settings/contributors')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _contributors = data.items || [];
        renderContributorsAdmin();
      })
      .catch(function () {});
  }

  function renderContributorsAdmin() {
    var el = document.getElementById('contributors-admin-list'); if (!el) return;
    if (!_contributors.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">등록된 분이 없습니다.</div>';
      return;
    }
    el.innerHTML = _contributors.map(function (c, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);background:var(--bg);">' +
        '<div style="flex:1;">' +
          '<strong style="font-size:13px;">' + GW.escapeHtml(c.name) + '</strong>' +
          (c.note ? '<span style="font-size:11px;color:var(--muted);margin-left:8px;">' + GW.escapeHtml(c.note) + '</span>' : '') +
          (c.date ? '<span style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--muted);margin-left:8px;">' + GW.escapeHtml(c.date) + '</span>' : '') +
        '</div>' +
        '<button onclick="editContributor(' + i + ')" style="font-family:\'DM Mono\',monospace;font-size:10px;padding:4px 10px;border:1px solid var(--border);background:none;cursor:pointer;color:var(--ink);">수정</button>' +
        '<button onclick="deleteContributor(' + i + ')" style="font-family:\'DM Mono\',monospace;font-size:10px;padding:4px 10px;border:1px solid #cc4444;background:none;cursor:pointer;color:#cc4444;">삭제</button>' +
      '</div>';
    }).join('');
  }

  window.editContributor = function (index) {
    var c = _contributors[index]; if (!c) return;
    _editingContributorIdx = index;
    document.getElementById('contrib-name-input').value = c.name || '';
    document.getElementById('contrib-note-input').value = c.note || '';
    document.getElementById('contrib-date-input').value = c.date || '';
    document.getElementById('contrib-form-label').textContent = '수정 중';
    document.getElementById('contrib-submit-btn').textContent = '수정 완료';
    document.getElementById('contrib-cancel-btn').style.display = '';
    document.getElementById('contrib-name-input').focus();
  };

  window.cancelEditContributor = function () {
    _editingContributorIdx = null;
    document.getElementById('contrib-name-input').value = '';
    document.getElementById('contrib-note-input').value = '';
    document.getElementById('contrib-date-input').value = '';
    document.getElementById('contrib-form-label').textContent = '새 분 추가';
    document.getElementById('contrib-submit-btn').textContent = '추가';
    document.getElementById('contrib-cancel-btn').style.display = 'none';
  };

  window.submitContributor = function () {
    var nameEl = document.getElementById('contrib-name-input');
    var noteEl = document.getElementById('contrib-note-input');
    var dateEl = document.getElementById('contrib-date-input');
    var name = (nameEl.value || '').trim();
    var note = (noteEl.value || '').trim();
    var date = (dateEl.value || '').trim();
    if (!name) { GW.showToast('이름을 입력해주세요', 'error'); return; }
    var updated = _contributors.slice();
    var entry = { name: name, note: note, date: date };
    if (_editingContributorIdx !== null) {
      updated[_editingContributorIdx] = entry;
    } else {
      updated.push(entry);
    }
    var wasEditing = _editingContributorIdx !== null;
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated }) })
      .then(function (data) {
        _contributors = data.items || updated;
        renderContributorsAdmin();
        cancelEditContributor();
        GW.showToast(wasEditing ? '수정됐습니다' : '추가됐습니다', 'success');
      })
      .catch(function (err) {
        GW.showToast(err.message || '저장 실패', 'error');
      });
  };

  window.deleteContributor = function (index) {
    if (!confirm('삭제할까요?')) return;
    var updated = _contributors.slice();
    updated.splice(index, 1);
    GW.apiFetch('/api/settings/contributors', { method: 'PUT', body: JSON.stringify({ items: updated }) })
      .then(function (data) {
        _contributors = data.items || updated;
        renderContributorsAdmin();
        GW.showToast('삭제됐습니다', 'success');
      })
      .catch(function (err) {
        GW.showToast(err.message || '삭제 실패', 'error');
        loadContributorsAdmin();
      });
  };

  // ─── AI Disclaimer admin ──────────────────────────────────
  function loadAiDisclaimerAdmin() {
    fetch('/api/settings/ai-disclaimer')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var inp = document.getElementById('ai-disclaimer-input');
        if (inp) inp.value = data.text || '본 글은 AI의 도움을 받아 작성되었습니다.';
      })
      .catch(function () {});
  }

  window.saveAiDisclaimer = function () {
    var val = (document.getElementById('ai-disclaimer-input').value || '').trim();
    if (!val) { GW.showToast('문구를 입력해주세요', 'error'); return; }
    GW.apiFetch('/api/settings/ai-disclaimer', { method: 'PUT', body: JSON.stringify({ text: val }) })
      .then(function () { GW.showToast('AI 도움 문구가 저장됐습니다', 'success'); })
      .catch(function (err) { GW.showToast(err.message || '저장 실패', 'error'); });
  };

})();
