/**
 * GET /api/memorabilia/countries
 * → [{code, name_ko, name_en}, ...] 한국어 가나다 정렬.
 *
 * 공개 도감 페이지(/memorabilia) + 관리자 도감 패널이 단일 카탈로그를 공유한다.
 * 새 국가 추가 시 functions/_shared/country-code-labels.js 만 수정하면 양쪽 자동 반영.
 */
import { getCountryCatalogSorted } from '../../_shared/country-code-labels.js';

export async function onRequestGet() {
  const list = getCountryCatalogSorted();
  let display;
  try {
    display = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch (_) {
    display = null;
  }
  const items = list.map(({ code, name_ko }) => ({
    code,
    name_ko,
    name_en: display ? (display.of(code) || code) : code,
  }));
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 1시간 edge cache + 24시간 SWR — 카탈로그는 거의 변하지 않음.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
