/**
 * GET /api/admin/card-news/articles  — 카드뉴스용 발행 기사 조회 (관리자 전용)
 *
 * 조건(특정 조건의 기사 자동 불러오기)으로 발행 기사를 정렬·필터해 카드용 데이터로 반환.
 *   ?sort=likes|recent|views   (기본 likes — '주간 좋아요 N개' 컨셉)
 *   ?days=7|30|0               (최근 N일, 0=전체. 기본 7)
 *   ?start=YYYY-MM-DD&end=...   (직접 기간 — days 보다 우선)
 *   ?category=korea|apr|wosm|people|...  (빈값=전체)
 *   ?limit=30                  (1..60, 기본 30)
 *
 * 반환 item: { id, title, subtitle, excerpt, image_url(대표이미지만), image_caption,
 *             category, author, publish_at, likes, views, url }
 * 카드 매핑은 클라이언트가 수행하며 NSO/Region 은 비워 둔다(서버에 적정 데이터 없음 → 수동 입력).
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';

const CATEGORIES = new Set(['korea', 'apr', 'wosm', 'people', 'help', 'notice', 'column']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

// Editor.js JSON 본문 → plain text 발췌. JSON 이 아니면 HTML strip.
function contentToExcerpt(content, max) {
  max = max || 280;
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
  } else {
    text = stripHtml(raw);
  }
  text = text.replace(/[ \t]+/g, ' ').trim();
  if (text.length > max) text = text.slice(0, max).trim() + '…';
  return text;
}

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'card-news', 'view');
  if (gate) return gate;

  const url = new URL(request.url);
  const sort = String(url.searchParams.get('sort') || 'likes').toLowerCase();
  const category = String(url.searchParams.get('category') || '').toLowerCase();
  const start = String(url.searchParams.get('start') || '').trim();
  const end = String(url.searchParams.get('end') || '').trim();
  let days = parseInt(url.searchParams.get('days'), 10);
  if (isNaN(days)) days = 7;
  let limit = parseInt(url.searchParams.get('limit'), 10);
  if (isNaN(limit) || limit < 1) limit = 30;
  if (limit > 60) limit = 60;

  const where = ['p.published = 1'];
  const binds = [];
  if (category && CATEGORIES.has(category)) { where.push('p.category = ?'); binds.push(category); }

  // 날짜 필드: publish_at 우선, 없으면 created_at. (publish_at 은 KST 벽시계 — 픽커 용도라 date 단위로 충분)
  const dateExpr = "date(COALESCE(p.publish_at, p.created_at))";
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) || /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) { where.push(`${dateExpr} >= ?`); binds.push(start); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) { where.push(`${dateExpr} <= ?`); binds.push(end); }
  } else if (days > 0) {
    where.push(`${dateExpr} >= date('now', ?)`);
    binds.push(`-${days} days`);
  }

  const orderBy = sort === 'recent'
    ? 'COALESCE(p.publish_at, p.created_at) DESC, p.id DESC'
    : sort === 'views'
    ? 'p.views DESC, COALESCE(p.publish_at, p.created_at) DESC'
    : 'likes DESC, COALESCE(p.publish_at, p.created_at) DESC';

  const sql =
    `SELECT p.id, p.title, p.subtitle, p.category, p.author, p.publish_at, p.created_at,
            p.views, p.image_url, p.image_caption, p.content,
            (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes
       FROM posts p
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit}`;

  try {
    const rs = await env.DB.prepare(sql).bind(...binds).all();
    const items = (rs && rs.results ? rs.results : []).map(function (r) {
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
    return json({ items, count: items.length, sort, days, category: category || null });
  } catch (err) {
    console.error('GET /api/admin/card-news/articles error:', err);
    return json({ error: 'db_error', reason: '기사를 불러오지 못했습니다.' }, 500);
  }
}
