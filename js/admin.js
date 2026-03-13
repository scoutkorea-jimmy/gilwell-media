/**
 * Gilwell Media · Admin Panel Logic
 * Depends on GW namespace from js/main.js.
 */
(function () {
  'use strict';

  var editingId       = null;
  var _adminEditor    = null;
  var _adminCoverImg  = null;
  var _adminSelTag    = '';

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
    btn.disabled = true; btn.textContent = '로그인 중…'; err.style.display = 'none';
    GW.apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw }) })
      .then(function (data) {
        GW.setToken(data.token);
        showAdmin();
        // If ?edit=ID was in URL, load that post for editing
        var editParam = new URLSearchParams(location.search).get('edit');
        if (editParam) {
          setTimeout(function () { editPost(parseInt(editParam, 10)); }, 600);
        }
      })
      .catch(function (e) {
        err.textContent = e.message || '비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        document.getElementById('pw-input').value = ''; document.getElementById('pw-input').focus();
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
    loadTranslationsAdmin();
    loadAuthorAdmin();
    loadAiDisclaimerAdmin();
    loadAdminList();
    // Set today date in form
    var dateEl = document.getElementById('art-date-display');
    if (dateEl) dateEl.textContent = GW.formatDate(new Date().toISOString());
    updateCatPreview();
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

  // ─── Tag selector (admin write form) ─────────────────────
  function loadTagsForSelector() {
    fetch('/api/settings/tags')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var tags = data.items || [];
        var sel  = document.getElementById('admin-tag-selector');
        if (!sel) return;
        var html = '<button type="button" class="tag-pill active" data-tag="">없음</button>';
        tags.forEach(function (t) {
          html += '<button type="button" class="tag-pill" data-tag="' + GW.escapeHtml(t) + '">' + GW.escapeHtml(t) + '</button>';
        });
        sel.innerHTML = html;
        sel.querySelectorAll('.tag-pill').forEach(function (btn) {
          btn.addEventListener('click', function () {
            sel.querySelectorAll('.tag-pill').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            _adminSelTag = btn.dataset.tag || '';
          });
        });
      })
      .catch(function () {});
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
      var body = {
        category: category,
        title: title,
        subtitle: subtitle || null,
        content: content,
        image_url: _adminCoverImg || null,
        tag: _adminSelTag || null,
        meta_tags: metaTags || null,
        author: author || undefined,
        ai_assisted: aiEl ? (aiEl.checked ? 1 : 0) : 0,
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

        // Load tag selector
        var sel = document.getElementById('admin-tag-selector');
        if (sel) {
          _adminSelTag = p.tag || '';
          sel.querySelectorAll('.tag-pill').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tag === _adminSelTag);
          });
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
    _adminSelTag = '';
    document.getElementById('art-title').value    = '';
    document.getElementById('art-subtitle').value = '';
    document.getElementById('art-metatags').value = '';
    var authorEl = document.getElementById('art-author');
    // Re-fill author with settings default
    fetch('/api/settings/author').then(function(r){return r.json();}).then(function(d){
      if (authorEl) authorEl.value = d.author || 'Editor.A';
    }).catch(function(){});

    document.getElementById('art-category').value = 'korea';
    var aiChk = document.getElementById('art-ai-assisted');
    if (aiChk) aiChk.checked = false;
    var preview = document.getElementById('admin-cover-preview');
    if (preview) preview.innerHTML = '';
    var sel = document.getElementById('admin-tag-selector');
    if (sel) { sel.querySelectorAll('.tag-pill').forEach(function(b){b.classList.remove('active');}); var f=sel.querySelector('[data-tag=""]'); if(f) f.classList.add('active'); }
    if (_adminEditor) { _adminEditor.isReady.then(function(){_adminEditor.clear();}); }
    document.getElementById('form-title').textContent  = '새 게시글 작성';
    document.getElementById('submit-btn').textContent  = '게재하기';
    document.getElementById('submit-btn').classList.remove('editing');
    document.getElementById('cancel-btn').classList.remove('visible');
    updateCatPreview();
  };

  // ─── Admin list loading (paginated) ──────────────────────
  function loadAdminList() {
    var url = '/api/posts?page=' + _listPage;
    if (_listCat !== 'all') url += '&category=' + _listCat;
    if (_listSearch) url += '&q=' + encodeURIComponent(_listSearch);

    GW.apiFetch(url)
      .then(function (data) {
        _listTotal = data.total;
        _allPosts  = _allPosts.concat(data.posts || []); // for hero search — rebuild separately
        renderAdminList(data.posts || []);
        renderPagination();
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
    list.innerHTML = posts.map(function (p) {
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      var isUnpublished = p.published === 0;
      return (
        '<div class="article-item"' + (isUnpublished ? ' style="opacity:0.65;"' : '') + '>' +
          '<div class="article-item-content">' +
            '<div style="margin-bottom:6px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' +
              '<span style="display:inline-block;font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;color:#f5f3ee;background:' + cat.color + ';">' + cat.label + '</span>' +
              (isUnpublished ? '<span style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;background:#cc4444;color:#fff;">비공개</span>' : '') +
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
  }

  function renderPagination() {
    var totalPages = Math.max(1, Math.ceil(_listTotal / _PAGE_SIZE));
    var pgEl = document.getElementById('admin-pagination');
    var infoEl = document.getElementById('admin-page-info');
    var prevEl = document.getElementById('admin-prev-btn');
    var nextEl = document.getElementById('admin-next-btn');
    if (!pgEl) return;
    pgEl.style.display = totalPages > 1 ? 'flex' : 'none';
    if (infoEl) infoEl.textContent = _listPage + ' / ' + totalPages;
    if (prevEl) prevEl.disabled = _listPage <= 1;
    if (nextEl) nextEl.disabled = _listPage >= totalPages;
  }

  window.adminListPageChange = function (delta) {
    var totalPages = Math.max(1, Math.ceil(_listTotal / _PAGE_SIZE));
    _listPage = Math.max(1, Math.min(totalPages, _listPage + delta));
    loadAdminList();
  };

  window.adminListFilter = function (cat) {
    _listCat  = cat;
    _listPage = 1;
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
  function loadAuthorAdmin() {
    fetch('/api/settings/author')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var inp = document.getElementById('author-name-input');
        if (inp) inp.value = data.author || 'Editor.A';
        var artAuthor = document.getElementById('art-author');
        if (artAuthor && !artAuthor.value) artAuthor.value = data.author || 'Editor.A';
      })
      .catch(function () {});
  }

  window.saveAuthorName = function () {
    var val = (document.getElementById('author-name-input').value || '').trim();
    if (!val) { GW.showToast('이름을 입력해주세요', 'error'); return; }
    GW.apiFetch('/api/settings/author', { method: 'PUT', body: JSON.stringify({ author: val }) })
      .then(function () { GW.showToast('에디터 이름이 저장됐습니다', 'success'); })
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
    fetch('/api/settings/tags').then(function(r){return r.json();}).then(function(data){
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

  // ─── Hero admin ───────────────────────────────────────────
  function loadHeroAdmin() {
    fetch('/api/settings/hero').then(function(r){return r.json();}).then(function(data){
      var el = document.getElementById('hero-current'); if(!el) return;
      if (data.post) {
        var cat = GW.CATEGORIES[data.post.category] || GW.CATEGORIES.korea;
        el.innerHTML = '<span style="font-size:9px;font-family:\'DM Mono\',monospace;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;color:#f5f3ee;background:'+cat.color+';margin-right:6px;">'+cat.label+'</span>' +
          '<strong>' + GW.escapeHtml(data.post.title) + '</strong>' +
          (data.post.subtitle ? '<br><span style="font-size:12px;color:var(--muted);">'+GW.escapeHtml(data.post.subtitle)+'</span>' : '');
      } else { el.textContent = '선택된 기사 없음'; }
    }).catch(function(){});
  }

  window.heroSearch = function () {
    var q = (document.getElementById('hero-search-input').value || '').toLowerCase().trim();
    var list = document.getElementById('hero-search-results'); if (!list) return;
    if (!q) { list.innerHTML = ''; return; }
    // Search via API
    GW.apiFetch('/api/posts?q=' + encodeURIComponent(q))
      .then(function(data){
        var results = (data.posts || []).slice(0, 8);
        if (!results.length) { list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">검색 결과 없음</div>'; return; }
        list.innerHTML = results.map(function(p){
          var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
          return '<div class="hero-result-item" onclick="selectHero(' + p.id + ')">' +
            '<span style="font-size:9px;font-family:\'DM Mono\',monospace;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;color:#f5f3ee;background:'+cat.color+';margin-right:6px;">'+cat.label+'</span>' +
            GW.escapeHtml(p.title) + '</div>';
        }).join('');
      }).catch(function(){ list.innerHTML = ''; });
  };

  window.selectHero = function (id) {
    GW.apiFetch('/api/settings/hero', { method: 'PUT', body: JSON.stringify({ post_id: id }) })
      .then(function(){ GW.showToast('히어로 기사가 설정됐습니다','success'); loadHeroAdmin(); document.getElementById('hero-search-results').innerHTML=''; document.getElementById('hero-search-input').value=''; })
      .catch(function(err){ GW.showToast(err.message||'설정 실패','error'); });
  };

  window.clearHero = function () {
    GW.apiFetch('/api/settings/hero', { method: 'PUT', body: JSON.stringify({ post_id: 0 }) })
      .then(function(){ GW.showToast('히어로가 해제됐습니다','success'); loadHeroAdmin(); })
      .catch(function(err){ GW.showToast(err.message||'해제 실패','error'); });
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
