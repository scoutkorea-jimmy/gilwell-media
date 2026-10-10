export function parseNaverSearchPerformance(input) {
  if (!input || typeof input.text !== 'string' || (!input.text.trim() && input.row_count !== 0) || input.text.length > 100000 ||
      !Number.isInteger(input.row_count) || input.row_count < 0 || input.row_count > 30 || input.complete !== true) {
    throw new Error('최근 30일·PC + Mobile 표를 마지막 페이지까지 붙여넣고 전체 행 수와 확인란을 입력해주세요.');
  }
  const fields = input.text.replace(/\uFEFF/g, '').split(/[\t\r\n]+/).map(text => text.trim()).filter(Boolean);
  const header = ['No', '검색 키워드', '클릭', '노출', 'CTR(%)'];
  const rows = [];
  const count = (text) => {
    const digits = text.replace(/,/g, '');
    if (!/^\d+$/.test(digits) || !Number.isSafeInteger(Number(digits))) throw new Error('정확한 클릭·노출 수를 확인해주세요.');
    return Number(digits);
  };
  for (let i = 0; i < fields.length;) {
    if (fields[i] === '검색 키워드 TOP 30') { i++; continue; }
    if (header.every((text, offset) => fields[i + offset] === text)) { i += 5; continue; }
    const row = fields.slice(i, i + 5);
    if (row.length !== 5 || count(row[0]) !== rows.length + 1) throw new Error('검색어 표의 순위가 누락되거나 중복되었습니다. 1번부터 마지막 순위까지 순서대로 붙여넣어주세요.');
    const ctr = row[4].replace(/%$/, '');
    if (!/^\d+(\.\d+)?$/.test(ctr) || Number(ctr) > 100) throw new Error('검색어 표의 CTR 열을 확인해주세요.');
    rows.push({ keyword: row[1], clicks: count(row[2]), impressions: count(row[3]) });
    i += 5;
  }
  if (rows.length !== input.row_count) throw new Error('붙여넣은 검색어 수와 표의 마지막 순위가 다릅니다. 모든 페이지를 확인해주세요.');
  return { engine: 'naver', site: 'bpmedia.net', period_days: 30, data_through: input.data_through, total_clicks: input.total_clicks, row_count: rows.length, rows };
}
