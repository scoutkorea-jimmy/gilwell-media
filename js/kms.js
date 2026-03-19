(function () {
  'use strict';

  var _kmsLoaded = false;
  var _kmsRole = 'full';
  var _kmsSaveBusy = false;

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
    if (input && input.dataset.bound !== 'true') {
      input.dataset.bound = 'true';
      input.addEventListener('input', function () {
        renderKmsPreview(input.value || '');
        renderKmsSectionList(input.value || '');
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
      saveBtn.disabled = _kmsRole === 'limited';
      saveBtn.textContent = _kmsRole === 'limited' ? '읽기 전용 계정' : '정의서 저장';
    }
    if (!_kmsLoaded) {
      loadKmsDefinition();
      _kmsLoaded = true;
    }
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
    var preview = document.getElementById('kms-preview');
    var list = document.getElementById('kms-section-list');
    GW.apiFetch('/api/settings/feature-definition')
      .then(function (data) {
        var content = data && typeof data.content === 'string' ? data.content : '';
        var input = document.getElementById('kms-editor-input');
        if (input) input.value = content;
        renderKmsPreview(content);
        renderKmsSectionList(content);
      })
      .catch(function (error) {
        if (preview) preview.innerHTML = '<div class="list-empty">' + GW.escapeHtml(error.message || '기능 정의서를 불러오지 못했습니다.') + '</div>';
        if (list) list.innerHTML = '<div class="list-empty">목차를 불러오지 못했습니다.</div>';
      });
  }

  function saveKmsDefinition() {
    if (_kmsSaveBusy) return;
    if (_kmsRole === 'limited') {
      GW.showToast('full 관리자만 기능 정의서를 저장할 수 있습니다.', 'error');
      return;
    }
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
        renderKmsPreview(content);
        renderKmsSectionList(content);
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
    list.innerHTML = sections.map(function (section) {
      return '<button type="button" class="kms-section-link" data-kms-target="' + GW.escapeHtml(section.id) + '">' +
        '<strong>' + GW.escapeHtml(section.title) + '</strong>' +
        '<span>' + GW.escapeHtml(section.levelLabel) + '</span>' +
      '</button>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-kms-target]'), function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-kms-target');
        var target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function extractKmsSections(content) {
    var lines = String(content || '').split('\n');
    var sections = [];
    var count = 0;
    lines.forEach(function (line) {
      var raw = String(line || '').trim();
      if (!/^##+\s+/.test(raw)) return;
      var level = raw.match(/^#+/)[0].length;
      var title = raw.replace(/^##+\s+/, '').trim();
      count += 1;
      sections.push({
        id: 'kms-section-' + count + '-' + slugifyKms(title),
        title: title,
        level: level,
        levelLabel: level === 2 ? '상위 메뉴' : '세부 설명'
      });
    });
    return sections;
  }

  function slugifyKms(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function renderKmsPreview(content) {
    var preview = document.getElementById('kms-preview');
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
