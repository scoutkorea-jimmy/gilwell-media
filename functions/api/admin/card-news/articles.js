/**
 * GET /api/admin/card-news/articles  — 카드뉴스용 발행 기사 조회 (관리자 전용)
 *
 * 기간(KST) 안에 "발행된" 기사를 조회하고, 조회수·좋아요는 **전체 누적값**으로
 * 집계한다. 카드뉴스는 "이번 주에 발행된 기사 중 조회수 높은 순"을 뽑는 도구라,
 * 기간 내 발생분만 세면(과거 기사는 0이 되어) 정렬이 무의미해진다 → 누적값 사용.
 *   ?start=YYYY-MM-DDTHH:MM  ?end=YYYY-MM-DDTHH:MM   (KST, 시 단위. 생략 시 최근 7일)
 *   ?sort=views|likes|recent  (기본 views — 전체 조회수 높은 순)
 *   ?category=korea|apr|wosm|people|...   (빈값=전체)
 *   ?limit=30   (1..100, 기본 30)
 *
 * 타임존: created_at 은 UTC, publish_at 은 KST 벽시계.
 *   - 발행 필터: publish_at(KST) 또는 created_at+9h(=KST)를 KST 범위와 비교.
 *   - 조회수: posts.views(전체 누적 카운터). 좋아요: post_likes 전체 개수.
 *
 * 반환 item: { id, title, subtitle, excerpt, image_url(대표이미지만), image_caption,
 *             category, author, publish_at, likes(전체), views(전체), url }
 */
import { queryRust } from '../../../_shared/rust-server.js';
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function contentToExcerpt(content, max) {
  max = max || 400; // 본문 발췌 기본 400자
  const raw = String(content || '').trim();
  let text = '';
  if (raw.charAt(0) === '{') {
    try {
      const j = JSON.parse(raw);
      const blocks = (j && Array.isArray(j.blocks)) ? j.blocks : [];
      const parts = [];
      for (const b of blocks) {
        const d = b && b.data;
        if (!d) continue;
        if (typeof d.text === 'string') parts.push(stripHtml(d.text));
        else if (Array.isArray(d.items)) {
          parts.push(d.items.map(function (it) {
            return typeof it === 'string' ? stripHtml(it) : (it && typeof it.content === 'string' ? stripHtml(it.content) : '');
          }).join(' '));
        }
        if (parts.join(' ').length > max) break;
      }
      text = parts.join('\n\n');
    } catch (_) { text = stripHtml(raw); }
  } else { text = stripHtml(raw); }
  text = text.replace(/[ \t]+/g, ' ').trim();
  if (text.length > max) text = text.slice(0, max).trim() + '…';
  return text;
}

// KST now / now-7d 를 'YYYY-MM-DD HH:MM:SS' 문자열로(시 단위 충분, 분·초 포함).
function kstString(offsetMs) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + (offsetMs || 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;

  const url = new URL(request.url);
  try {
    const response = await queryRust({request, env}, 'card-news-articles-request', {
      sort:url.searchParams.get('sort'), category:url.searchParams.get('category'), limit:url.searchParams.get('limit'),
      start:url.searchParams.get('start'), end:url.searchParams.get('end'),
      fallbackStart:kstString(-7 * 24 * 3600 * 1000), fallbackEnd:kstString(0),
    });
    if (!response.ok) throw new Error('Rust card news article query failed');
    const result=await response.json();
    const rows=result.items || [];
    const items = result.projected === true ? rows : rows.map(function (r) {
      return {
        id: r.id,
        title: r.title || '',
        subtitle: r.subtitle || '',
        excerpt: contentToExcerpt(r.content),
        image_url: r.image_url || null,
        image_caption: r.image_caption || '',
        category: r.category || '',
        author: r.author || '',
        publish_at: r.publish_at || r.created_at || '',
        likes: r.likes || 0,
        views: r.views || 0,
        url: `/post/${r.id}`,
      };
    });
    return json({ items, count: items.length, sort:result.sort, start:result.start, end:result.end, category:result.category, scope:result.scope });
  } catch (err) {
    console.error('GET /api/admin/card-news/articles error:', err);
    return json({ error: 'db_error', reason: '기사를 불러오지 못했습니다.' }, 500);
  }
}
