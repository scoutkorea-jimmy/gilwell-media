const ENGINES=['google','naver'];
export function validateReportLegacy(input) {
  if (!input || !ENGINES.includes(input.engine) || input.site !== 'bpmedia.net') {
    throw new Error('BP미디어의 Google 또는 Naver 보고서만 저장할 수 있습니다.');
  }
  if (input.period_days !== (input.engine === 'google' ? 28 : 30)) {
    throw new Error('보고서 기간이 올바르지 않습니다.');
  }
  const date = input.data_through;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('보고서 기준일이 올바르지 않습니다.');
  }
  if (date > new Date().toISOString().slice(0, 10)) throw new Error('미래의 보고서는 저장할 수 없습니다.');
  // shortcut: 1 MiB 보고서 스냅샷, 이 한도를 넘으면 검색어별 테이블로 이관한다.
  if (!Array.isArray(input.rows) || input.rows.length > 10000 || input.rows.length !== input.row_count) {
    throw new Error('검색어 전체 행 수가 일치하지 않습니다. 부분 수집은 저장하지 않습니다.');
  }
  const keywords = new Set();
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  const rows = input.rows.map((row) => {
    if (!row || typeof row.keyword !== 'string' || !row.keyword.trim() || row.keyword.length > 300 ||
        !count(row.clicks) || !count(row.impressions) || row.clicks > row.impressions) {
      throw new Error('검색어 또는 클릭·노출 수가 올바르지 않습니다.');
    }
    const keyword = row.keyword.trim();
    if (keywords.has(keyword)) throw new Error('중복 검색어가 있습니다.');
    keywords.add(keyword);
    return { keyword, clicks: row.clicks, impressions: row.impressions };
  });
  if (!count(input.total_clicks) || rows.reduce((sum, row) => sum + row.clicks, 0) > input.total_clicks) {
    throw new Error('보고서 전체 클릭 수가 검색어별 클릭 합계보다 작습니다.');
  }
  return {
    engine: input.engine, site: input.site, period_days: input.period_days,
    data_through: date, total_clicks: input.total_clicks, row_count: rows.length,
    rows: rows.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.keyword.localeCompare(b.keyword, 'ko')),
    source: input.engine === 'google' ? 'google_api' : 'naver_manual',
    synced_at: new Date().toISOString(),
  };
}
