/**
 * Admin · 도감 댓글 승인 패널
 *
 * 의존:
 *   · admin-v3.js 의 패널 전환 (data-panel="memorabilia-comments") 활성화
 *   · /api/admin/memorabilia-comments  (GET 목록 / counts)
 *   · /api/admin/memorabilia-comments/:id  (PATCH approved/rejected/deleted)
 */
(function () {
  'use strict';

  const state = {
    initialized: false,
    status: 'pending',
    page: 1,
    pageSize: 30,
    total: 0,
    items: [],
    busy: false,
  };

  const $ = (sel) => document.querySelector(sel);

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    const filter = $('#memoc-filter-status');
    if (filter) filter.addEventListener('change', () => {
      state.status = filter.value;
      state.page = 1;
      load();
    });

    const refresh = $('#memoc-refresh-btn');
    if (refresh) refresh.addEventListener('click', () => load());

    load();
    loadCounts();
  }

  async function loadCounts() {
    try {
      const res = await fetch('/api/admin/memorabilia-comments?counts=1', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      const counts = data.counts || {};
      const wrap = $('#memoc-counts');
      if (wrap) {
        wrap.textContent = `대기 ${counts.pending} · 승인 ${counts.approved} · 거부 ${counts.rejected} · 삭제 ${counts.deleted}`;
      }
      const badge = document.getElementById('memo-comments-pending-badge');
      if (badge) {
        if (counts.pending > 0) {
          badge.textContent = String(counts.pending);
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }
    } catch (_) {}
  }

  async function load() {
    const wrap = $('#memoc-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:24px; text-align:center; color:var(--gray-700,#3f3f3f);">불러오는 중…</div>';

    try {
      const url = `/api/admin/memorabilia-comments?status=${encodeURIComponent(state.status)}&page=${state.page}&pageSize=${state.pageSize}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        wrap.innerHTML = `<div style="padding:24px; text-align:center; color:var(--color-fire-red,#ff5655);">불러오기 실패 (${res.status})</div>`;
        return;
      }
      const data = await res.json();
      state.items = data.items || [];
      state.total = data.total || 0;
      renderTable();
      renderPagination();
    } catch (err) {
      wrap.innerHTML = '<div style="padding:24px; text-align:center; color:var(--color-fire-red,#ff5655);">네트워크 오류</div>';
    }
  }

  function renderTable() {
    const wrap = $('#memoc-table-wrap');
    if (!wrap) return;
    if (!state.items.length) {
      wrap.innerHTML = '<div style="padding:24px; text-align:center; color:var(--gray-700,#3f3f3f);">해당 상태의 댓글이 없습니다.</div>';
      return;
    }

    const rows = state.items.map((c) => {
      const title = c.memorabilia_title_ko || c.memorabilia_title_en || `#${c.memorabilia_id}`;
      const link = c.memorabilia_slug ? `/memorabilia/${encodeURIComponent(c.memorabilia_slug)}` : '#';
      const statusBadge = renderStatusBadge(c.status);
      const actions = renderActions(c);
      return `
        <tr data-comment-id="${c.id}">
          <td style="white-space:nowrap; font-size:12px;">${esc(c.created_at)}</td>
          <td>
            <div style="font-weight:600;">${esc(c.author_name)}</div>
            <div style="font-size:12px; color:var(--gray-700,#3f3f3f);">${esc(c.affiliation)}</div>
          </td>
          <td style="max-width:340px;">
            <div style="white-space:pre-wrap; font-size:13px; line-height:1.5;">${esc(c.content)}</div>
            ${c.rejection_reason ? `<div style="margin-top:6px; font-size:11px; color:var(--color-fire-red,#ff5655);">거부 사유: ${esc(c.rejection_reason)}</div>` : ''}
          </td>
          <td style="font-size:12px;">
            <div><a href="${esc(link)}" target="_blank" rel="noopener">${esc(title)}</a></div>
            <div style="color:var(--gray-700,#3f3f3f);">#${c.memorabilia_id}</div>
          </td>
          <td style="font-size:12px; font-family:monospace;">${esc(c.ip_address)}</td>
          <td>${statusBadge}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="v3-table" style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="text-align:left; border-bottom:1px solid var(--gray-300,#c4c4c4); font-size:12px; color:var(--gray-700,#3f3f3f);">
            <th style="padding:8px;">작성시각 (UTC)</th>
            <th style="padding:8px;">작성자 / 소속</th>
            <th style="padding:8px;">내용</th>
            <th style="padding:8px;">도감 항목</th>
            <th style="padding:8px;">IP</th>
            <th style="padding:8px;">상태</th>
            <th style="padding:8px;">조치</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    `;

    wrap.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', onActionClick);
    });
  }

  function renderStatusBadge(status) {
    const colors = {
      pending:  { bg: '#fff3cd', fg: '#856404', label: '대기중' },
      approved: { bg: '#d4edda', fg: '#155724', label: '승인됨' },
      rejected: { bg: '#f8d7da', fg: '#721c24', label: '거부됨' },
      deleted:  { bg: '#e2e3e5', fg: '#383d41', label: '삭제됨' },
    };
    const c = colors[status] || colors.pending;
    return `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; background:${c.bg}; color:${c.fg};">${c.label}</span>`;
  }

  function renderActions(c) {
    if (c.status === 'deleted') return '<span style="color:var(--gray-700,#3f3f3f); font-size:12px;">—</span>';
    const buttons = [];
    if (c.status !== 'approved') {
      buttons.push(`<button type="button" class="v3-btn v3-btn-primary v3-btn-sm" data-action="approve" data-id="${c.id}">승인</button>`);
    }
    if (c.status !== 'rejected') {
      buttons.push(`<button type="button" class="v3-btn v3-btn-outline v3-btn-sm" data-action="reject" data-id="${c.id}">거부</button>`);
    }
    buttons.push(`<button type="button" class="v3-btn v3-btn-danger v3-btn-outline v3-btn-sm" data-action="delete" data-id="${c.id}">삭제</button>`);
    return `<div style="display:flex; gap:4px; flex-wrap:wrap;">${buttons.join('')}</div>`;
  }

  async function onActionClick(e) {
    const btn = e.currentTarget;
    const action = btn.getAttribute('data-action');
    const id = parseInt(btn.getAttribute('data-id'), 10);
    if (!Number.isFinite(id)) return;

    let nextStatus, reason;
    if (action === 'approve') nextStatus = 'approved';
    else if (action === 'reject') {
      nextStatus = 'rejected';
      reason = prompt('거부 사유 (선택, 500자 이하):') || '';
    } else if (action === 'delete') {
      if (!confirm('이 댓글을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
      nextStatus = 'deleted';
    } else return;

    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/memorabilia-comments/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, rejection_reason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || '처리 실패', 'error');
        return;
      }
      toast(`상태가 '${nextStatus}'(으)로 변경되었습니다.`, 'success');
      load();
      loadCounts();
    } catch (_) {
      toast('네트워크 오류', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function renderPagination() {
    const wrap = $('#memoc-pagination');
    if (!wrap) return;
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (totalPages <= 1) { wrap.innerHTML = ''; return; }
    const parts = [];
    for (let p = 1; p <= totalPages; p++) {
      const cls = p === state.page ? 'v3-btn v3-btn-primary v3-btn-sm' : 'v3-btn v3-btn-outline v3-btn-sm';
      parts.push(`<button type="button" class="${cls}" data-page="${p}">${p}</button>`);
    }
    wrap.innerHTML = parts.join('');
    wrap.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.page = parseInt(btn.getAttribute('data-page'), 10) || 1;
        load();
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg, kind) {
    if (window.GW && typeof window.GW.toast === 'function') return window.GW.toast(msg, kind);
    if (typeof window.gwToast === 'function') return window.gwToast(msg, kind);
    alert(msg);
  }

  // ── Hook: panel 전환 감지 ────────────────────────────────────────────
  // admin-v3.js 는 sidebar 버튼 클릭 시 data-panel 속성으로 패널을 전환한다.
  // 우리는 #panel-memorabilia-comments 가 활성화될 때 init() 1회만 실행.
  function watchPanel() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-panel="memorabilia-comments"]');
      if (!btn) return;
      // 약간의 딜레이: admin-v3.js 가 패널 전환 후 동작하도록.
      setTimeout(init, 30);
    });

    // 사이드바 뱃지는 로그인 직후에도 갱신 (별도 클릭 없이).
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(loadCounts, 500));
    } else {
      setTimeout(loadCounts, 500);
    }
  }

  watchPanel();
})();
