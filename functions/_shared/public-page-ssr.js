import { queryRust } from './rust-server.js';
import { onRequestGet as getPosts } from '../api/posts/index.js';
import { onRequestGet as getMembers } from '../api/settings/wosm-members.js';
import { loadPrivacyPolicy } from './privacy-policy.js';

export const BOARD_KEYS = ['korea', 'apr', 'wosm', 'people', 'latest'];
export function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function pageNumber(url) {
  const raw = url.searchParams.get('page') || '1';
  return /^[1-9]\d{0,5}$/.test(raw) ? Math.min(Number(raw), 100000) : 1;
}
export function pageHref(url, page) {
  const next = new URL(url);
  if (page === 1) next.searchParams.delete('page');
  else next.searchParams.set('page', String(page));
  return next.pathname + next.search;
}
export function renderPagination(url, page, totalPages) {
  if (totalPages < 2) return '';
  const pages = [...new Set([1, ...Array.from({length: 5}, (_, i) => page - 2 + i), totalPages])].filter(n => n > 0 && n <= totalPages).sort((a,b) => a-b);
  return pages.map(n => `<a class="board-page-btn${n === page ? ' active' : ''}" href="${escapeText(pageHref(url, n))}"${n === page ? ' aria-current="page"' : ''} aria-label="${n}페이지">${n}</a>`).join(' ');
}
export function publicBoardRequest(url, key, originalRequest) {
  // Only the edge-provided visitor identity crosses this public read boundary.
  // Cookies, authorization and admin query parameters must never be forwarded.
  // Construct a public request: never forward cookies or admin-scope parameters.
  const api = new URL('/api/posts', url.origin);
  for (const param of ['sort','period','days','q','tag']) if (url.searchParams.has(param)) api.searchParams.set(param, url.searchParams.get(param));
  if (key !== 'latest') api.searchParams.set('category', key);
  if (!api.searchParams.has('sort')) api.searchParams.set('sort', key === 'latest' ? 'latest' : 'manual');
  if (key === 'latest' && !api.searchParams.has('days')) api.searchParams.set('days', '30');
  const page = pageNumber(url);
  api.searchParams.set('page', String(page)); api.searchParams.set('limit', '16');
  const headers = new Headers();
  const visitorIp = originalRequest?.headers.get('CF-Connecting-IP');
  if (visitorIp) headers.set('CF-Connecting-IP', visitorIp);
  return new Request(api, {headers});
}
export async function loadPublicPage(env, url, key, originalRequest) {
  const parts = {};
  if (BOARD_KEYS.includes(key)) {
    const page = pageNumber(url);
    const publicRequest = publicBoardRequest(url, key, originalRequest);
    const response = await getPosts({request: publicRequest, env});
    if (!response.ok) throw new Error(`Public board response ${response.status}`);
    const data = await response.json();
    const posts = data.posts || [];
    const totalPages = Math.ceil(Number(data.total || 0) / 16);
    try {
      const rust = await queryRust({env, request: {url: url.href}}, 'public-board-render', {posts, page, total_pages: totalPages, url: url.href});
      if (!rust.ok) throw new Error('Rust board rendering failed');
      const rendered = await rust.json();
      if (typeof rendered.board !== 'string' || typeof rendered.pagination !== 'string') throw new Error('Invalid board rendering');
      Object.assign(parts, rendered);
    } catch (error) {
      parts.board = posts.map(post => `<article class="post-card no-thumb"><div class="post-card-body"><div class="post-card-head"><h3><a class="post-card-title-link" href="/post/${Number(post.id)}">${escapeText(post.title)}</a></h3></div>${post.subtitle ? `<p class="post-card-subtitle">${escapeText(post.subtitle)}</p>` : ''}</div></article>`).join('') || '<p class="board-empty">해당 조건의 기사가 없습니다.</p>';
      parts.pagination = renderPagination(url, page, totalPages);
    }
    return {parts, posts, page, status: page > 1 && !posts.length ? 404 : 200};
  }
  if (['glossary', 'calendar', 'memorabilia'].includes(key)) {
    const rust = await queryRust({ env, request: { url: url.href } }, 'public-ssr', {key});
    if (!rust.ok) throw new Error('Rust public SSR failed');
    return rust.json();
  }
  if (key === 'privacy') {
    const policy = await loadPrivacyPolicy(env);
    try {
      const rust = await queryRust({env, request: {url: url.href}}, 'privacy-render', {html: policy.html});
      if (!rust.ok) throw new Error('Rust privacy rendering failed');
      const rendered = await rust.json();
      if (typeof rendered.privacy !== 'string') throw new Error('Invalid privacy rendering');
      parts.privacy = rendered.privacy;
    } catch (error) {
      // Administrative HTML is always escaped in this text-only fallback.
      const text = policy.html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/(?:p|h[1-6]|li)>/gi, '\n').replace(/<[^>]*>/g, '');
      parts.privacy = '<h1>개인정보처리방침</h1>' + text.split(/\n+/).filter(s => s.trim()).map(s => `<p>${escapeText(s.trim())}</p>`).join('');
    }
  }
  if (key === 'wosm_members') {
    const data = await (await getMembers({env})).json();
    const rows = data.items || [];
    const columns = data.columns || [];
    try {
      // shortcut: constructor inherits a JavaScript prototype value; migrate when legacy columns are normalized.
      if (columns.some(column => column.key === 'constructor')) throw new Error('Legacy constructor column');
      const rust = await queryRust({env, request: {url: url.href}}, 'members-render', {rows, columns});
      if (!rust.ok) throw new Error('Rust members rendering failed');
      const rendered = await rust.json();
      if (!['membersCount','membersHead','members','membersCards'].every(key => typeof rendered[key] === 'string')) throw new Error('Invalid members rendering');
      Object.assign(parts, rendered);
    } catch (error) {
      parts.membersCount = `${rows.length}개 회원 연맹`;
      const valueFor = (row, column) => column.key === 'country_names'
        ? [row.country_ko,row.country_en,row.country_fr].filter(Boolean).join(' · ')
        : row[column.key] || row.extra_fields?.[column.key] || '—';
      parts.membersHead = '<tr>' + columns.map(column => `<th scope="col">${escapeText(column.label)}</th>`).join('') + '</tr>';
      parts.members = rows.map(row => '<tr>' + columns.map(column => `<td>${escapeText(valueFor(row,column))}</td>`).join('') + '</tr>').join('');
      parts.membersCards = rows.map(row => `<article class="members-card"><h2>${escapeText(row.country_ko || row.country_en)}</h2><dl>${columns.filter(column => column.key !== 'country_names').map(column => `<dt>${escapeText(column.label)}</dt><dd>${escapeText(valueFor(row,column))}</dd>`).join('')}</dl></article>`).join('');
    }
  }
  return {parts};
}
export function applyPublicParts(html, data) {
  for (const [key, value] of Object.entries(data?.parts || {})) html = html.replace(`<!-- PUBLIC_SSR:${key} -->`, value);
  return html;
}
