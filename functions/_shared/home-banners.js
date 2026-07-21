/**
 * 홈 팝업 배너 — 공용 조회 로직
 *
 * `/api/home` 과 SSR 폴백(functions/[[path]].js) 양쪽이 같은 결과를 써야
 * 초기 페인트 후 배너가 바뀌지 않는다. 그래서 조회를 여기로 모은다.
 *
 * 노출 규칙:
 *   · active = 1
 *   · starts_at 이 있으면 현재 시각 이후여야 한다
 *   · ends_at 이 있으면 현재 시각 이전이어야 한다
 *   · 최대 2개 (MAX_HOME_BANNERS). DB 에 더 있어도 잘라서 반환한다.
 *
 * 시각은 다른 테이블과 동일하게 UTC 문자열로 저장·비교한다.
 */

export const MAX_HOME_BANNERS = 2;

const SELECT_COLUMNS = 'id, image_url, link_url, title, sort_order, active, starts_at, ends_at';

/** 공개 노출 대상 배너 (기간·활성 필터 적용, 최대 2개) */
export async function loadActiveHomeBanners(env) {
  if (!env || !env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT ${SELECT_COLUMNS}
         FROM home_banners
        WHERE active = 1
          AND (starts_at IS NULL OR trim(starts_at) = '' OR datetime(starts_at) <= datetime('now'))
          AND (ends_at   IS NULL OR trim(ends_at)   = '' OR datetime(ends_at)   >= datetime('now'))
        ORDER BY sort_order ASC, id ASC
        LIMIT ?`
    ).bind(MAX_HOME_BANNERS).all();
    return (results || []).map(serializeBanner);
  } catch (err) {
    // 테이블이 아직 없는 환경(로컬 D1 등)에서도 홈이 죽지 않게 한다.
    return [];
  }
}

/** 관리자용 — 기간·활성 무관 전체 목록 */
export async function loadAllHomeBanners(env) {
  const { results } = await env.DB.prepare(
    `SELECT ${SELECT_COLUMNS}, created_at, updated_at
       FROM home_banners
      ORDER BY sort_order ASC, id ASC`
  ).all();
  return (results || []).map((row) => ({ ...serializeBanner(row), created_at: row.created_at, updated_at: row.updated_at }));
}

function serializeBanner(row) {
  return {
    id: row.id,
    image_url: row.image_url || '',
    link_url: row.link_url || '',
    title: row.title || '',
    sort_order: Number(row.sort_order) || 0,
    active: row.active ? 1 : 0,
    starts_at: row.starts_at || '',
    ends_at: row.ends_at || '',
  };
}
