/**
 * Gilwell Media · Shared Utilities
 * Exposes a global GW namespace used by board.js and admin.js.
 */
(function () {
  'use strict';

  const GW = window.GW = {};

  // ── Category metadata ─────────────────────────────────────
  GW.CATEGORIES = {
    korea: { label: 'Korea', tagClass: 'tag-korea', color: '#1a3a5c' },
    apr:   { label: 'APR',   tagClass: 'tag-apr',   color: '#5a3a1a' },
    worm:  { label: 'Worm',  tagClass: 'tag-worm',  color: '#2d5a27' },
  };

  // ── Date formatting ───────────────────────────────────────
  /** Format an ISO date string as Korean: 2026년 3월 12일 */
  GW.formatDate = function (dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  /** Set today's date in the masthead element. */
  GW.setMastheadDate = function (id) {
    const el = document.getElementById(id || 'today-date');
    if (!el) return;
    const d    = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    el.textContent =
      `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  };

  // ── XSS protection ────────────────────────────────────────
  /** Escape HTML special characters to prevent XSS. */
  GW.escapeHtml = function (str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** Render plain text with line breaks preserved (safe). */
  GW.renderText = function (str) {
    return GW.escapeHtml(str).replace(/\n/g, '<br>');
  };

  /** Truncate a string to maxLen chars, appending "…". */
  GW.truncate = function (str, maxLen) {
    if (!str) return '';
    return str.length <= maxLen ? str : str.slice(0, maxLen).trimEnd() + '…';
  };

  // ── Toast notifications ───────────────────────────────────
  /** Show a toast message. type: 'success' | 'error' */
  GW.showToast = function (msg, type) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className   = 'toast ' + (type || 'success') + ' show';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.className = 'toast'; }, 2800);
  };

  // ── Session token ─────────────────────────────────────────
  GW.getToken  = function () { return sessionStorage.getItem('admin_token'); };
  GW.setToken  = function (t) { sessionStorage.setItem('admin_token', t); };
  GW.clearToken = function () { sessionStorage.removeItem('admin_token'); };

  // ── API fetch ─────────────────────────────────────────────
  /**
   * Fetch a JSON API endpoint.
   * Automatically attaches the admin token if present.
   * Throws an Error with .status if the response is not ok.
   */
  GW.apiFetch = async function (url, options) {
    const token   = GW.getToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' },
                                   (options && options.headers) || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res  = await fetch(url, Object.assign({}, options, { headers }));
    const data = await res.json().catch(function () { return {}; });

    if (!res.ok) {
      const err = new Error(data.error || 'API 오류가 발생했습니다');
      err.status = res.status;
      throw err;
    }
    return data;
  };

  // ── DOM helpers ───────────────────────────────────────────
  GW.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };

  // ── Mark active nav link ──────────────────────────────────
  /** Add .active to the nav link whose href matches the current page. */
  GW.markActiveNav = function () {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach(function (a) {
      const href = (a.getAttribute('href') || '').split('/').pop();
      if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
      }
    });
  };

})();
