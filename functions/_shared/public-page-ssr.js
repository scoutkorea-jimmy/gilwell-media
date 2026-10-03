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
    parts.board = posts.map(post => `<article class="post-card no-thumb"><div class="post-card-body"><div class="post-card-head"><h3><a class="post-card-title-link" href="/post/${Number(post.id)}">${escapeText(post.title)}</a></h3></div>${post.subtitle ? `<p class="post-card-subtitle">${escapeText(post.subtitle)}</p>` : ''}</div></article>`).join('') || '<p class="board-empty">해당 조건의 기사가 없습니다.</p>';
    parts.pagination = renderPagination(url, page, Math.ceil(Number(data.total || 0) / 16));
    return {parts, posts, page, status: page > 1 && !posts.length ? 404 : 200};
  }
  if (key === 'glossary') {
    const {results=[]} = await env.DB.prepare('SELECT id, term_ko, term_en, term_fr, description_ko FROM glossary_terms ORDER BY bucket, COALESCE(sort_order, 0), term_ko').all();
    parts.glossaryCount = `${results.length}개 용어`;
    parts.glossary = '<dl>' + results.map(row => `<dt id="term-${Number(row.id)}"><strong>${escapeText([row.term_ko,row.term_en,row.term_fr].filter(Boolean).join(' · '))}</strong></dt><dd>${escapeText(row.description_ko)}</dd>`).join('') + '</dl>';
  }
  if (key === 'privacy') {
    const policy = await loadPrivacyPolicy(env);
    // Stored policy HTML is administrative content. A text-only SSR fallback
    // escapes everything; the existing client renderer uses DOMPurify.
    const text = policy.html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/(?:p|h[1-6]|li)>/gi, '\n').replace(/<[^>]*>/g, '');
    parts.privacy = '<h1>개인정보처리방침</h1>' + text.split(/\n+/).filter(s => s.trim()).map(s => `<p>${escapeText(s.trim())}</p>`).join('');
  }
  if (key === 'wosm_members') {
    const data = await (await getMembers({env})).json();
    const rows = data.items || [];
    parts.membersCount = `${rows.length}개 회원 연맹`;
    const columns = data.columns || [];
    const valueFor = (row, column) => column.key === 'country_names'
      ? [row.country_ko,row.country_en,row.country_fr].filter(Boolean).join(' · ')
      : row[column.key] || row.extra_fields?.[column.key] || '—';
    parts.membersHead = '<tr>' + columns.map(column => `<th scope="col">${escapeText(column.label)}</th>`).join('') + '</tr>';
    parts.members = rows.map(row => '<tr>' + columns.map(column => `<td>${escapeText(valueFor(row,column))}</td>`).join('') + '</tr>').join('');
    parts.membersCards = rows.map(row => `<article class="members-card"><h2>${escapeText(row.country_ko || row.country_en)}</h2><dl>${columns.filter(column => column.key !== 'country_names').map(column => `<dt>${escapeText(column.label)}</dt><dd>${escapeText(valueFor(row,column))}</dd>`).join('')}</dl></article>`).join('');
  }
  if (key === 'calendar') {
    const {results=[]} = await env.DB.prepare(`SELECT c.title, c.start_at, c.end_at, c.location_name, p.id AS post_id FROM calendar_events c LEFT JOIN posts p ON p.id = c.related_post_id AND p.published = 1 ORDER BY c.start_at DESC LIMIT 100`).all();
    parts.calendar = results.map(row => `<article><h2>${row.post_id ? `<a href="/post/${Number(row.post_id)}">${escapeText(row.title)}</a>` : escapeText(row.title)}</h2><p>${escapeText(row.start_at)}${row.end_at ? ' ~ '+escapeText(row.end_at) : ''} · ${escapeText(row.location_name)}</p></article>`).join('') || '<p>등록된 일정이 없습니다.</p>';
  }
  if (key === 'memorabilia') {
    const {results=[]} = await env.DB.prepare(`SELECT id, slug, title_ko, title_en FROM memorabilia WHERE status = 'public' ORDER BY COALESCE(published_at, updated_at) DESC, id DESC LIMIT 48`).all();
    parts.memorabiliaCount = `공개 자료 ${results.length}개`;
    parts.memorabilia = results.map(row => `<a class="memo-card" href="/memorabilia/${encodeURIComponent(row.slug || String(row.id))}"><div class="memo-card-body"><h2 class="memo-card-title">${escapeText(row.title_ko || row.title_en)}</h2></div></a>`).join('') || '<p>공개된 도감 자료가 없습니다.</p>';
  }
  return {parts};
}
export function applyPublicParts(html, data) {
  for (const [key, value] of Object.entries(data?.parts || {})) html = html.replace(`<!-- PUBLIC_SSR:${key} -->`, value);
  return html;
}
