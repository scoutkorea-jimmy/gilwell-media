(function () {
  'use strict';

  var _kmsLoaded = false;
  var _kmsRole = 'full';
  var _kmsSaveBusy = false;
  var _kmsMode = 'read';

  document.addEventListener('DOMContentLoaded', function () {
    bindKmsAuthEvents();
    bindKmsUi();
    bootKmsAccess();
  });

  function bindKmsUi() {
    var input = document.getElementById('kms-editor-input');
    var saveBtn = document.getElementById('kms-save-btn');
    var pwInput = document.getElementById('kms-pw-input');
    var loginBtn = document.getElementById('kms-login-btn');
    document.querySelectorAll('[data-kms-mode]').forEach(function (btn) {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        setKmsMode(btn.getAttribute('data-kms-mode') || 'read');
      });
    });
    if (input && input.dataset.bound !== 'true') {
      input.dataset.bound = 'true';
      input.addEventListener('input', function () {
        renderKmsDocument(input.value || '');
        renderKmsSectionList(input.value || '');
        updateKmsMeta(input.value || '');
      });
    }
    if (saveBtn && saveBtn.dataset.bound !== 'true') {
      saveBtn.dataset.bound = 'true';
      saveBtn.addEventListener('click', saveKmsDefinition);
    }
    if (loginBtn && loginBtn.dataset.bound !== 'true') {
      loginBtn.dataset.bound = 'true';
      loginBtn.addEventListener('click', doKmsLogin);
    }
    if (pwInput && pwInput.dataset.bound !== 'true') {
      pwInput.dataset.bound = 'true';
      pwInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') doKmsLogin();
      });
    }
  }

  function bindKmsAuthEvents() {
    if (document.body.dataset.kmsAuthBound === 'true') return;
    document.body.dataset.kmsAuthBound = 'true';
    document.addEventListener('gw:admin-auth-required', function (event) {
      var detail = event && event.detail ? event.detail : {};
      showKmsLogin(detail.message || '관리자 로그인이 필요합니다.');
    });
  }

  function bootKmsAccess() {
    if (!GW.getToken()) {
      showKmsLogin('');
      return;
    }
    verifyKmsSession()
      .then(function (session) {
        if (!session || session.authenticated !== true) {
          showKmsLogin('관리자 로그인이 필요합니다.');
          return;
        }
        _kmsRole = session.role || 'full';
        showKms();
      })
      .catch(function () {
        showKmsLogin('관리자 세션을 다시 확인해주세요.');
      });
  }

  function verifyKmsSession() {
    return GW.apiFetch('/api/admin/session', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function doKmsLogin() {
    var pw = String(document.getElementById('kms-pw-input').value || '').trim();
    var err = document.getElementById('kms-login-error');
    var btn = document.getElementById('kms-login-btn');
    if (!pw) {
      if (err) {
        err.textContent = '비밀번호를 입력해주세요.';
        err.style.display = 'block';
      }
      return;
    }
    btn.disabled = true;
    btn.textContent = '확인 중…';
    if (err) err.style.display = 'none';
    GW.apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw }),
    })
      .then(function (data) {
        GW.setToken(data.token);
        if (GW.setAdminRole) GW.setAdminRole(data.role || 'full');
        _kmsRole = data.role || 'full';
        showKms();
      })
      .catch(function (error) {
        if (err) {
          err.textContent = error.message || '비밀번호가 올바르지 않습니다.';
          err.style.display = 'block';
        }
        document.getElementById('kms-pw-input').value = '';
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'KMS 열기';
      });
  }

  function showKms() {
    var login = document.getElementById('kms-login-screen');
    var screen = document.getElementById('kms-screen');
    var saveBtn = document.getElementById('kms-save-btn');
    if (login) login.style.display = 'none';
    if (screen) {
      screen.hidden = false;
      screen.setAttribute('aria-hidden', 'false');
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '정의서 저장';
    }
    if (!_kmsLoaded) {
      loadKmsDefinition();
      _kmsLoaded = true;
    }
    setKmsMode('read');
  }

  function showKmsLogin(message) {
    GW.clearToken();
    var login = document.getElementById('kms-login-screen');
    var screen = document.getElementById('kms-screen');
    var err = document.getElementById('kms-login-error');
    if (login) login.style.display = 'flex';
    if (screen) {
      screen.hidden = true;
      screen.setAttribute('aria-hidden', 'true');
    }
    if (err) {
      if (message) {
        err.textContent = message;
        err.style.display = 'block';
      } else {
        err.textContent = '';
        err.style.display = 'none';
      }
    }
  }

  function loadKmsDefinition() {
    var preview = document.getElementById('kms-document-body');
    var list = document.getElementById('kms-section-list');
    GW.apiFetch('/api/settings/feature-definition')
      .then(function (data) {
        var content = data && typeof data.content === 'string' ? data.content : '';
        var input = document.getElementById('kms-editor-input');
        if (input) input.value = content;
        renderKmsDocument(content);
        renderKmsSectionList(content);
        updateKmsMeta(content);
      })
      .catch(function (error) {
        if (preview) preview.innerHTML = '<div class="list-empty">' + GW.escapeHtml(error.message || '기능 정의서를 불러오지 못했습니다.') + '</div>';
        if (list) list.innerHTML = '<div class="list-empty">목차를 불러오지 못했습니다.</div>';
      });
  }

  function saveKmsDefinition() {
    if (_kmsSaveBusy) return;
    var input = document.getElementById('kms-editor-input');
    var content = String(input && input.value || '').trim();
    if (!content) {
      GW.showToast('기능 정의서 내용이 비어 있습니다.', 'error');
      return;
    }
    var btn = document.getElementById('kms-save-btn');
    _kmsSaveBusy = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '저장 중…';
    }
    GW.apiFetch('/api/settings/feature-definition', {
      method: 'PUT',
      body: JSON.stringify({ content: content }),
    })
      .then(function () {
        GW.showToast('기능 정의서가 저장됐습니다.', 'success');
        renderKmsDocument(content);
        renderKmsSectionList(content);
        updateKmsMeta(content);
        setKmsMode('read');
      })
      .catch(function (error) {
        GW.showToast(error.message || '기능 정의서 저장 실패', 'error');
      })
      .finally(function () {
        _kmsSaveBusy = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = '정의서 저장';
        }
      });
  }

  function renderKmsSectionList(content) {
    var list = document.getElementById('kms-section-list');
    if (!list) return;
    var sections = extractKmsSections(content);
    if (!sections.length) {
      list.innerHTML = '<div class="list-empty">목차를 만들 수 있는 제목이 없습니다.</div>';
      return;
    }
    var tree = buildKmsSectionTree(sections);
    list.innerHTML = renderKmsTreeNodes(tree);
    Array.prototype.forEach.call(list.querySelectorAll('[data-kms-target]'), function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-kms-target');
        var target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    Array.prototype.forEach.call(list.querySelectorAll('[data-kms-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        var node = btn.closest('.kms-tree-node');
        if (!node) return;
        var collapsed = node.getAttribute('data-collapsed') === 'true';
        node.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
        btn.textContent = collapsed ? '−' : '+';
      });
    });
  }

  function setKmsMode(mode) {
    _kmsMode = mode === 'edit' ? 'edit' : 'read';
    var editorPanel = document.getElementById('kms-editor-panel');
    var readBtn = document.getElementById('kms-mode-read');
    var editBtn = document.getElementById('kms-mode-edit');
    if (editorPanel) editorPanel.hidden = _kmsMode !== 'edit';
    if (readBtn) {
      readBtn.classList.toggle('active', _kmsMode === 'read');
      readBtn.setAttribute('aria-selected', _kmsMode === 'read' ? 'true' : 'false');
    }
    if (editBtn) {
      editBtn.classList.toggle('active', _kmsMode === 'edit');
      editBtn.setAttribute('aria-selected', _kmsMode === 'edit' ? 'true' : 'false');
    }
  }

  function extractKmsSections(content) {
    var lines = String(content || '').split('\n');
    var sections = [];
    var count = 0;
    lines.forEach(function (line) {
      var raw = String(line || '').trim();
      if (!/^#{2,4}\s+/.test(raw)) return;
      var level = raw.match(/^#+/)[0].length;
      var title = raw.replace(/^##+\s+/, '').trim();
      count += 1;
      sections.push({
        id: 'kms-section-' + count + '-' + slugifyKms(title),
        title: title,
        level: level,
        levelLabel: level === 2 ? '대목차' : level === 3 ? '세목차 / 의도' : '기능 세부 / 각주'
      });
    });
    return sections;
  }

  function buildKmsSectionTree(sections) {
    var roots = [];
    var stack = [];
    sections.forEach(function (section) {
      var node = {
        id: section.id,
        title: section.title,
        level: section.level,
        levelLabel: section.levelLabel,
        children: [],
      };
      while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
      if (stack.length) {
        stack[stack.length - 1].children.push(node);
      } else {
        roots.push(node);
      }
      stack.push(node);
    });
    return roots;
  }

  function renderKmsTreeNodes(nodes) {
    return nodes.map(function (node) {
      var hasChildren = node.children && node.children.length > 0;
      return '<div class="kms-tree-node" data-collapsed="' + (hasChildren ? 'false' : 'false') + '">' +
        '<div class="kms-tree-row">' +
          (hasChildren
            ? '<button type="button" class="kms-tree-toggle" data-kms-toggle="true">−</button>'
            : '<span class="kms-tree-spacer" aria-hidden="true">·</span>') +
          '<button type="button" class="kms-section-link" data-kms-target="' + GW.escapeHtml(node.id) + '">' +
            '<strong>' + GW.escapeHtml(node.title) + '</strong>' +
            '<span>' + GW.escapeHtml(node.levelLabel) + '</span>' +
          '</button>' +
        '</div>' +
        (hasChildren ? '<div class="kms-tree-children">' + renderKmsTreeNodes(node.children) + '</div>' : '') +
      '</div>';
    }).join('');
  }

  function slugifyKms(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function renderKmsDocument(content) {
    var preview = document.getElementById('kms-document-body');
    if (!preview) return;
    var text = String(content || '').replace(/\r\n/g, '\n');
    if (!text.trim()) {
      preview.innerHTML = '<div class="list-empty">정의서를 입력하면 여기에 미리보기가 표시됩니다.</div>';
      return;
    }
    var sectionIndex = 0;
    var parts = text.split(/```/);
    preview.innerHTML = parts.map(function (part, index) {
      if (index % 2 === 1) {
        var lines = part.replace(/^\n+|\n+$/g, '').split('\n');
        var language = '';
        if (lines.length && /^[A-Za-z0-9_-]+$/.test(lines[0].trim())) {
          language = lines.shift().trim();
        }
        return '<div class="feature-definition-code-wrap">' +
          (language ? '<div class="feature-definition-code-label">' + GW.escapeHtml(language) + '</div>' : '') +
          '<pre class="feature-definition-code"><code>' + GW.escapeHtml(lines.join('\n')) + '</code></pre>' +
        '</div>';
      }
      return renderKmsText(part, function (title) {
        sectionIndex += 1;
        return 'kms-section-' + sectionIndex + '-' + slugifyKms(title);
      });
    }).join('');
  }

  function updateKmsMeta(content) {
    var text = String(content || '');
    var lines = text.split('\n');
    var titleLine = lines.find(function (line) { return /^#\s+/.test(String(line || '').trim()); }) || '';
    var title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '기능 정의서 / 운영 기준 문서';
    var sections = extractKmsSections(text);
    var detailCount = sections.filter(function (section) { return section.level >= 4; }).length;
    var summary = '대목차와 세목차를 중심으로 운영 기준, 기능 의도, 세부 규칙, 각주를 문서화합니다.';
    var titleEl = document.getElementById('kms-document-title');
    var summaryEl = document.getElementById('kms-document-summary');
    var buildEl = document.getElementById('kms-build-version');
    var sectionCountEl = document.getElementById('kms-section-count');
    var detailCountEl = document.getElementById('kms-detail-count');
    if (titleEl) titleEl.textContent = title;
    if (summaryEl) summaryEl.textContent = summary;
    if (buildEl) buildEl.textContent = 'V' + (GW.APP_VERSION || '');
    if (sectionCountEl) sectionCountEl.textContent = String(sections.filter(function (section) { return section.level === 2; }).length);
    if (detailCountEl) detailCountEl.textContent = String(detailCount);
  }

  function renderKmsText(text, idBuilder) {
    var lines = String(text || '').split('\n');
    var html = [];
    var inList = false;
    lines.forEach(function (line) {
      var raw = line.trim();
      if (!raw) {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        return;
      }
      if (/^####\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var detailTitle = raw.replace(/^####\s+/, '');
        html.push('<h5 id="' + GW.escapeHtml(idBuilder(detailTitle)) + '">' + GW.escapeHtml(detailTitle) + '</h5>');
        return;
      }
      if (/^###\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var subTitle = raw.replace(/^###\s+/, '');
        html.push('<h4 id="' + GW.escapeHtml(idBuilder(subTitle)) + '">' + GW.escapeHtml(subTitle) + '</h4>');
        return;
      }
      if (/^##\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        var title = raw.replace(/^##\s+/, '');
        html.push('<h3 id="' + GW.escapeHtml(idBuilder(title)) + '">' + GW.escapeHtml(title) + '</h3>');
        return;
      }
      if (/^#\s+/.test(raw)) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2>' + GW.escapeHtml(raw.replace(/^#\s+/, '')) + '</h2>');
        return;
      }
      if (/^-\s+/.test(raw)) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push('<li>' + formatKmsInline(raw.replace(/^-\s+/, '')) + '</li>');
        return;
      }
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push('<p>' + formatKmsInline(raw) + '</p>');
    });
    if (inList) html.push('</ul>');
    return html.join('');
  }

  function formatKmsInline(text) {
    return GW.escapeHtml(String(text || '')).replace(/`([^`]+)`/g, '<code>$1</code>');
  }
})();
