/**
 * GET /api/admin/card-news/articles  — 카드뉴스용 발행 기사 조회 (관리자 전용)
 *
 * 년·월·일·시 기준 기간(KST)으로 발행 기사를 조회하고, 조회수·좋아요는 그 기간 내
 * 발생분만 집계한다("최근 7일 조회수"면 7일 내 조회만).
 *   ?start=YYYY-MM-DDTHH:MM  ?end=YYYY-MM-DDTHH:MM   (KST, 시 단위. 생략 시 최근 7일)
 *   ?sort=likes|views|recent  (기본 likes — 기간 좋아요순)
 *   ?category=korea|apr|wosm|people|...   (빈값=전체)
 *   ?limit=30   (1..100, 기본 30)
 *
 * 타임존: viewed_at/liked_at/created_at 은 UTC, publish_at 은 KST 벽시계.
 *   - 기간 집계(views/likes): 사용자 KST 범위를 UTC(−9h)로 변환해 비교.
 *   - 발행 필터: publish_at(KST) 또는 created_at+9h(=KST)를 KST 범위와 비교.
 *
 * 반환 item: { id, title, subtitle, excerpt, image_url(대표이미지만), image_caption,
 *             category, author, publish_at, likes(기간), views(기간), url }
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';

const CATEGORIES = new Set(['korea', 'apr', 'wosm', 'people', 'help', 'notice', 'column']);

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

// 'YYYY-MM-DDTHH:MM' / 'YYYY-MM-DD HH:MM[:SS]' → SQLite 'YYYY-MM-DD HH:MM:SS' (KST 벽시계 그대로).
function normKstDt(s, fallbackSecs) {
  let v = String(s || '').trim().replace('T', ' ');
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || fallbackSecs || '00'}`;
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
  const sort = String(url.searchParams.get('sort') || 'views').toLowerCase();
  const category = String(url.searchParams.get('category') || '').toLowerCase();
  let limit = parseInt(url.searchParams.get('limit'), 10);
  if (isNaN(limit) || limit < 1) limit = 30;
  if (limit > 100) limit = 100;

  // 기간(KST). 생략 시 최근 7일.
  const startKst = normKstDt(url.searchParams.get('start'), '00') || kstString(-7 * 24 * 3600 * 1000);
  const endKst = normKstDt(url.searchParams.get('end'), '59') || kstString(0);

  // 기간 집계용 UTC 경계(−9h).
  const where = ['p.published = 1'];
  const binds = [];
  // SELECT 의 서브쿼리(views, likes)가 먼저 → 바인드 순서: views(start,end), likes(start,end)
  binds.push(startKst, endKst, startKst, endKst);
  if (category && CATEGORIES.has(category)) { where.push('p.category = ?'); binds.push(category); }
  // 발행 필터: KST 발행시각이 기간 내. (publish_at=KST, created_at=UTC→+9h)
  const pubKst = "COALESCE(p.publish_at, datetime(p.created_at, '+9 hours'))";
  where.push(`${pubKst} >= ?`); binds.push(startKst);
  where.push(`${pubKst} <= ?`); binds.push(endKst);

  const orderBy = sort === 'recent'
    ? `${pubKst} DESC, p.id DESC`
    : sort === 'views'
    ? 'views DESC, likes DESC, p.id DESC'
    : 'likes DESC, views DESC, p.id DESC';

  const sql =
    `SELECT p.id, p.title, p.subtitle, p.category, p.author, p.publish_at, p.created_at,
            p.image_url, p.image_caption, p.content,
            (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id
               AND v.viewed_at >= datetime(?, '-9 hours') AND v.viewed_at <= datetime(?, '-9 hours')) AS views,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id
               AND l.liked_at >= datetime(?, '-9 hours') AND l.liked_at <= datetime(?, '-9 hours')) AS likes
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
    return json({ items, count: items.length, sort, start: startKst, end: endKst, category: category || null, period_scoped: true });
  } catch (err) {
    console.error('GET /api/admin/card-news/articles error:', err);
    return json({ error: 'db_error', reason: '기사를 불러오지 못했습니다.' }, 500);
  }
}
