import { extractToken, verifyTokenRole } from '../../_shared/auth.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

/**
 * GET /api/admin/meta-tag-pool
 *
 * 기사 작성 모달 meta_tags 입력 자동완성용. 전체 posts의 meta_tags를
 * 쉼표 분해 → 정규화 → 사용 횟수 집계 → 빈도 내림차순 상위 N 반환.
 *
 * 파라미터:
 *   - limit=N (기본 200, 최대 500)
 *
 * 반환: { tags: [{ name, count }] }
 */
export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env.ADMIN_SECRET, 'full'))) {
    return json({ error: '인증이 필요합니다.' }, 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit')) || 200));

  try {
    const { results } = await env.DB
      .prepare('SELECT meta_tags FROM posts WHERE meta_tags IS NOT NULL AND meta_tags <> ""')
      .all();

    const counts = new Map();
    (results || []).forEach((row) => {
      const raw = String(row.meta_tags || '');
      raw.split(',').forEach((t) => {
        const name = t.trim();
        if (!name) return;
        counts.set(name, (counts.get(name) || 0) + 1);
      });
    });

    const tags = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .slice(0, limit);

    return json({ tags });
  } catch (err) {
    return json({ error: 'DB 오류', detail: String((err && err.message) || err) }, 500);
  }
}
