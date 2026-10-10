const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const QUERY_URL = 'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Abpmedia.net/searchAnalytics/query';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export class GoogleSearchError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const encode = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));
async function googleJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    if (!response.ok) console.warn('[search-performance-google]', url === TOKEN_URL ? 'oauth' : 'query', response.status);
    if (!response.ok) throw new GoogleSearchError(response.status === 403
      ? 'Google 보고서 접근 권한이 없습니다. 서비스 계정의 BP미디어 Search Console 권한과 API 활성화를 확인해주세요.'
      : 'Google 보고서 요청에 실패했습니다. API 연결 상태를 확인하고 다시 시도해주세요.');
    return await response.json();
  } catch (error) {
    if (error instanceof GoogleSearchError) throw error;
    throw new GoogleSearchError('Google 연결이 지연되거나 응답이 올바르지 않습니다. 이전 보고서를 유지합니다.');
  } finally { clearTimeout(timer); }
}
async function accessToken(env) {
  if (!env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON) {
    throw new GoogleSearchError('Google API 연결 설정이 필요합니다. 운영자가 서버에 Search Console 서비스 계정을 연결해주세요.', 503);
  }
  let assertion;
  try {
    const account = JSON.parse(env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON);
    if (account.type !== 'service_account' || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(account.client_email) ||
        typeof account.private_key !== 'string' || !account.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) throw new Error();
    const der = Uint8Array.from(atob(account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;
  } catch (_) {
    throw new GoogleSearchError('Google 서비스 계정 설정이 올바르지 않습니다. 서버 설정을 확인해주세요.', 503);
  }
  const result = await googleJson(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (typeof result.access_token !== 'string' || !result.access_token) throw new GoogleSearchError('Google 인증 응답을 확인하지 못했습니다.');
  return result.access_token;
}
export function googleReportPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type) => parts.find(part => part.type === type).value;
  const day = Date.UTC(+value('year'), +value('month') - 1, +value('day'));
  // shortcut: Google 확정 데이터 지연을 고려해 PT 3일 전까지 조회, 최신 잠정 데이터가 필요하면 별도 범위를 제공한다.
  const end = day - 3 * 86400000;
  return { startDate: new Date(end - 27 * 86400000).toISOString().slice(0, 10), endDate: new Date(end).toISOString().slice(0, 10) };
}
export async function fetchGoogleSearchPerformance(env) {
  const token = await accessToken(env);
  const period = googleReportPeriod();
  const query = (extra) => googleJson(QUERY_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...period, type: 'web', dataState: 'final', aggregationType: 'byProperty', ...extra }),
  });
  const total = await query({ rowLimit: 1 });
  const rows = [];
  while (true) {
    const data = await query({ dimensions: ['query'], rowLimit: 5000, startRow: rows.length });
    const page = data.rows || [];
    if (!Array.isArray(page)) throw new GoogleSearchError('Google 검색어 응답 구조가 변경되었습니다.');
    // shortcut: 최대 10000행·1 MiB 스냅샷, 초과하면 부분 저장하지 않고 검색어별 저장소로 이관한다.
    if (rows.length + page.length > 10000) throw new GoogleSearchError('Google 공개 검색어가 저장 한도를 초과했습니다. 부분 보고서는 저장하지 않습니다.', 413);
    rows.push(...page.map(row => ({ keyword: row.keys?.length === 1 ? row.keys[0] : null, clicks: row.clicks, impressions: row.impressions })));
    if (page.length < 5000) break;
  }
  if (total.rows && (!Array.isArray(total.rows) || total.rows.length > 1)) throw new GoogleSearchError('Google 전체 클릭 응답을 확인하지 못했습니다.');
  return { engine: 'google', site: 'bpmedia.net', period_days: 28, data_through: period.endDate, total_clicks: total.rows?.[0]?.clicks ?? 0, row_count: rows.length, rows };
}
