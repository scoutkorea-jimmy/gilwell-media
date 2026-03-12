/**
 * Gilwell Media · Admin Panel Logic
 * Depends on GW namespace from js/main.js.
 * All write operations require a valid server-issued token.
 */
(function () {
  'use strict';

  var editingId = null;
  var posts     = [];

  // ─── Boot ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // If a valid token is already in sessionStorage, skip login
    if (GW.getToken()) {
      showAdmin();
    }
    // Set up Enter key on password input
    var pwInput = document.getElementById('pw-input');
    if (pwInput) {
      pwInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doLogin();
      });
    }
    // Set today's date in the post form
    setTodayDate();
    updateCatPreview();
  });

  // ─── Login ───────────────────────────────────────────────
  window.doLogin = function () {
    var pw  = (document.getElementById('pw-input').value || '').trim();
    var err = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');

    if (!pw) return;

    btn.disabled    = true;
    btn.textContent = '로그인 중…';
    err.style.display = 'none';

    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body:   JSON.stringify({ password: pw }),
    })
      .then(function (data) {
        GW.setToken(data.token);
        showAdmin();
      })
      .catch(function (e) {
        err.textContent   = e.message || '비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        document.getElementById('pw-input').value = '';
        document.getElementById('pw-input').focus();
      })
      .finally(function () {
        btn.disabled    = false;
        btn.textContent = '관리자 입장';
      });
  };

  window.doLogout = function () {
    GW.clearToken();
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-screen').style.display  = 'none';
    document.getElementById('pw-input').value = '';
  };

  function showAdmin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display  = 'block';
    loadPosts();
  }

  // ─── Load all posts (admin view) ─────────────────────────
  function loadPosts() {
    // Fetch all categories and merge
    var cats     = ['korea', 'apr', 'worm'];
    var promises = cats.map(function (c) {
      return GW.apiFetch('/api/posts?category=' + c + '&page=1');
    });

    Promise.all(promises)
      .then(function (results) {
        posts = [];
        results.forEach(function (r) { posts = posts.concat(r.posts || []); });
        // Sort newest first by created_at
        posts.sort(function (a, b) {
          return new Date(b.created_at) - new Date(a.created_at);
        });
        updateStats();
        // Dispatch event so admin.html tab filter can re-render the list
        document.dispatchEvent(new CustomEvent('admin:postsLoaded', { detail: posts }));
      })
      .catch(function (err) {
        console.error('Failed to load posts:', err);
        if (err.status === 401) {
          GW.showToast('세션이 만료됐습니다. 다시 로그인해주세요.', 'error');
          doLogout();
        } else {
          GW.showToast('게시글 목록을 불러오지 못했습니다.', 'error');
        }
      });
  }

  // ─── Save (create or update) ──────────────────────────────
  window.savePost = function () {
    var category  = document.getElementById('art-category').value;
    var title     = (document.getElementById('art-title').value    || '').trim();
    var content   = (document.getElementById('art-content').value  || '').trim();
    var image_url = (document.getElementById('art-image').value    || '').trim();

    if (!title)   { GW.showToast('제목을 입력해주세요', 'error');  return; }
    if (!content) { GW.showToast('내용을 입력해주세요', 'error'); return; }

    var body = JSON.stringify({ category, title, content, image_url: image_url || null });

    var url    = editingId ? '/api/posts/' + editingId : '/api/posts';
    var method = editingId ? 'PUT' : 'POST';

    GW.apiFetch(url, { method, body })
      .then(function () {
        GW.showToast(editingId ? '수정됐습니다' : '게재됐습니다', 'success');
        cancelEdit();
        loadPosts();
      })
      .catch(function (err) {
        if (err.status === 401) {
          GW.showToast('세션이 만료됐습니다. 다시 로그인해주세요.', 'error');
          doLogout();
        } else {
          GW.showToast(err.message || '저장 실패', 'error');
        }
      });
  };

  // ─── Edit ────────────────────────────────────────────────
  window.editPost = function (id) {
    // Fetch full post to get content
    GW.apiFetch('/api/posts/' + id)
      .then(function (data) {
        var p = data.post;
        editingId = p.id;

        document.getElementById('art-category').value = p.category;
        document.getElementById('art-title').value    = p.title;
        document.getElementById('art-content').value  = p.content;
        document.getElementById('art-image').value    = p.image_url || '';
        updateCatPreview();

        document.getElementById('form-title').textContent      = '게시글 수정';
        document.getElementById('submit-btn').textContent      = '수정 완료';
        document.getElementById('submit-btn').classList.add('editing');
        document.getElementById('cancel-btn').classList.add('visible');

        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () {
        GW.showToast('게시글을 불러오지 못했습니다.', 'error');
      });
  };

  // ─── Delete ──────────────────────────────────────────────
  window.deletePost = function (id) {
    if (!confirm('이 게시글을 삭제할까요?\n삭제된 내용은 복구되지 않습니다.')) return;

    GW.apiFetch('/api/posts/' + id, { method: 'DELETE' })
      .then(function () {
        GW.showToast('삭제됐습니다', 'success');
        loadPosts();
      })
      .catch(function (err) {
        if (err.status === 401) {
          GW.showToast('세션이 만료됐습니다. 다시 로그인해주세요.', 'error');
          doLogout();
        } else {
          GW.showToast(err.message || '삭제 실패', 'error');
        }
      });
  };

  // ─── Cancel edit ──────────────────────────────────────────
  window.cancelEdit = function () {
    editingId = null;
    clearForm();
    document.getElementById('form-title').textContent       = '새 게시글 작성';
    document.getElementById('submit-btn').textContent       = '게재하기';
    document.getElementById('submit-btn').classList.remove('editing');
    document.getElementById('cancel-btn').classList.remove('visible');
  };

  function clearForm() {
    document.getElementById('art-title').value    = '';
    document.getElementById('art-content').value  = '';
    document.getElementById('art-image').value    = '';
    document.getElementById('art-category').value = 'korea';
    setTodayDate();
    updateCatPreview();
  }

  // ─── Render article list ──────────────────────────────────
  function renderList() {
    var list  = document.getElementById('article-list');
    var count = document.getElementById('article-count');

    if (count) count.textContent = posts.length + '건';

    if (posts.length === 0) {
      list.innerHTML = '<div class="list-empty">아직 게재된 게시글이 없습니다</div>';
      return;
    }

    list.innerHTML = posts.map(function (p) {
      var cat = GW.CATEGORIES[p.category] || GW.CATEGORIES.korea;
      return (
        '<div class="article-item">' +
          '<div class="article-item-content">' +
            '<div style="margin-bottom:6px;">' +
              '<span style="display:inline-block;font-family:\'DM Mono\',monospace;font-size:9px;' +
              'letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;' +
              'color:#f5f3ee;background:' + cat.color + ';">' + cat.label + '</span>' +
            '</div>' +
            '<h4>' + GW.escapeHtml(p.title) + '</h4>' +
            '<div class="item-meta">' + GW.formatDate(p.created_at) + '</div>' +
          '</div>' +
          '<div class="item-actions">' +
            '<button class="btn-edit"   onclick="editPost('   + p.id + ')">수정</button>' +
            '<button class="btn-delete" onclick="deletePost(' + p.id + ')">삭제</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ─── Stats row ────────────────────────────────────────────
  function updateStats() {
    var total  = posts.length;
    var korea  = posts.filter(function (p) { return p.category === 'korea'; }).length;
    var apr    = posts.filter(function (p) { return p.category === 'apr';   }).length;
    var worm   = posts.filter(function (p) { return p.category === 'worm';  }).length;

    var el = function (id) { return document.getElementById(id); };
    if (el('stat-total')) el('stat-total').textContent = total;
    if (el('stat-korea')) el('stat-korea').textContent = korea;
    if (el('stat-apr'))   el('stat-apr').textContent   = apr;
    if (el('stat-worm'))  el('stat-worm').textContent  = worm;
  }

  // ─── Category preview ─────────────────────────────────────
  window.updateCatPreview = function () {
    var cat     = document.getElementById('art-category');
    var preview = document.getElementById('cat-preview');
    if (!cat || !preview) return;
    var meta = GW.CATEGORIES[cat.value] || GW.CATEGORIES.korea;
    preview.textContent = meta.label;
    preview.style.background = meta.color;
  };

  function setTodayDate() {
    var el = document.getElementById('art-date-display');
    if (el) el.textContent = GW.formatDate(new Date().toISOString());
  }

})();
