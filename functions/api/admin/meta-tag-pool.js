import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { queryRust } from '../../_shared/rust-server.js';

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
  const __gate = await gateMenuAccess(request, env, 'meta', 'view'); if (__gate) return __gate

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit')) || 200));

  try {
    const response = await queryRust({request, env}, 'meta-tag-pool', {});
    if (!response.ok) throw new Error('Rust meta tag pool failed');
    const {tags:counts} = await response.json();
    const tags = counts
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .slice(0, limit);

    return json({ tags });
  } catch (err) {
    console.error('GET /api/admin/meta-tag-pool error:', err);
    return json({ error: '처리에 실패했습니다.', code: 'server_error' }, 500);
  }
}
