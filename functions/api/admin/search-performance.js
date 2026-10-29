import { queryRust } from '../../_shared/rust-server.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { ensureSettingsHistoryTable } from '../../_shared/settings-audit.js';
import { fetchGoogleSearchPerformance, GoogleSearchError } from '../../_shared/google-search-performance.js';
import { parseNaverSearchPerformanceRust } from '../../_shared/naver-search-performance.js';

const ENGINES = ['google', 'naver'];
const MAX_BYTES = 1024 * 1024;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function validateReportCompat(input) {
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

export async function validateReport(input) {
  // shortcut: isolated UTF-16 surrogates use the legacy parser until Wasm supports them.
  if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(input) || '')) return validateReportCompat(input);
  const response = await queryRust({env:{}, request:{url:'https://internal.invalid/'}}, 'search-report-validate', {report:input ?? null, nowIso:new Date().toISOString()});
  if (!response.ok) throw new Error('보고서 검증에 실패했습니다.');
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result.report;
}

export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'analytics-visits', 'view');
  if (gate) return gate;
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);
  try {
    const response = await queryRust({request, env}, 'search-reports', {operation:'list'});
    if (!response.ok) throw new Error('Rust search report query failed');
    const { rows: results } = await response.json();
    return json({ reports: (results || []).map((row) => JSON.parse(row.value)), google_configured: Boolean(env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON) });
  } catch (_) {
    return json({ error: '검색 성과 보고서를 불러오지 못했습니다.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'analytics-visits', 'write');
  if (gate) return gate;
  if (!env.DB) return json({ error: 'DB 바인딩이 없습니다.' }, 503);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
    return json({ error: 'JSON 보고서만 저장할 수 있습니다.' }, 415);
  }
  let report;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('보고서가 없습니다.');
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return json({ error: '보고서가 1 MiB를 초과했습니다.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input = JSON.parse(new TextDecoder().decode(bytes));
    let raw;
    if (input?.action === 'fetch-google') raw = await fetchGoogleSearchPerformance(env);
    else if (input?.action === 'import-naver') raw = await parseNaverSearchPerformanceRust(input);
    else throw new Error('구글 API 불러오기 또는 네이버 표 가져오기를 선택해주세요.');
    try { report = await validateReport(raw); }
    catch (error) { if (input.action === 'fetch-google') throw new GoogleSearchError('Google 보고서 검증에 실패했습니다. 이전 보고서를 유지합니다.'); throw error; }
    if (new TextEncoder().encode(JSON.stringify(report)).length > MAX_BYTES) return json({ error: '보고서가 1 MiB를 초과했습니다. 이전 보고서를 유지합니다.' }, 413);
  } catch (error) {
    if (error instanceof GoogleSearchError) console.warn('[search-performance-google]', error.message);
    return json({ error: error instanceof SyntaxError ? 'JSON 보고서가 올바르지 않습니다.' : error.message }, error instanceof GoogleSearchError ? error.status : 400);
  }
  try {
    const snapshot = await queryRust({request, env}, 'search-reports', {operation:'get', engine:report.engine});
    if (!snapshot.ok) throw new Error('Rust search report snapshot failed');
    const { row: previous } = await snapshot.json();
    if (previous && JSON.parse(previous.value).data_through > report.data_through) {
      return json({ error: '최신 보고서보다 오래된 보고서는 저장하지 않습니다.' }, 409);
    }
    await ensureSettingsHistoryTable(env);
    const response = await queryRust({request, env}, 'search-reports', {
      operation:'commit', engine:report.engine, value:JSON.stringify(report), previous:previous?.value || null,
    });
    if (!response.ok) throw new Error('Rust search report commit failed');
    if (!(await response.json()).changes) return json({ error: '다른 요청이 먼저 갱신했습니다. 불러오기를 다시 눌러주세요.' }, 409);
    return json({ engine: report.engine, row_count: report.row_count, synced_at: report.synced_at });
  } catch (_) {
    return json({ error: '저장하지 못했습니다. 이전 보고서를 유지합니다.' }, 500);
  }
}
