import { privacySnapshot } from './rust-server.js';
import { configuredAnalyticsId } from './site-analytics-config.js';

/**
 * Gilwell Media · Privacy Policy storage + default content
 *
 * The policy body is stored in `settings(key='privacy_policy_html')` as a
 * single HTML blob rendering inside <main> on /privacy. On fresh deploys or
 * if the setting is empty, the shared default below is used so the page is
 * never blank.
 *
 * Admin edit flow: owner PUTs plain HTML to /api/settings/privacy-policy.
 * The public renderer sanitises with DOMPurify before injecting.
 */

export const PRIVACY_SETTINGS_KEY = 'privacy_policy_html';
export const PRIVACY_SETTINGS_UPDATED_KEY = 'privacy_policy_updated_at';

// Keep the default aligned with what we shipped in Phase 4's static
// privacy.html so first-load UX matches regardless of DB state.
export const DEFAULT_PRIVACY_POLICY_HTML = `<h1>개인정보 처리방침</h1>
<p class="privacy-sub">최종 개정 2026-11-21 · 본 방침은 GDPR(EU 일반 개인정보보호법) 및 대한민국 개인정보 보호법의 기본 원칙에 맞춰 작성되었습니다.</p>

<div class="privacy-note">
  BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영되는 독립 미디어 아카이브입니다. 본 서비스는 최소한의 개인정보만 수집하며, 수집한 정보는 명시된 목적 외로는 사용하지 않습니다.
</div>

<h2>1. 처리자 정보 (Data Controller)</h2>
<ul>
  <li>서비스명: BP미디어 (bpmedia.net)</li>
  <li>운영 주체: 한국 스카우트 운동 자원봉사 네트워크</li>
  <li>문의: <a href="mailto:info@bpmedia.net">info@bpmedia.net</a></li>
  <li>기사제보: <a href="mailto:story@bpmedia.net">story@bpmedia.net</a></li>
</ul>

<h2>2. 수집하는 개인정보 항목 및 법적 근거 (Art. 6 GDPR)</h2>
<table>
  <thead>
    <tr><th>카테고리</th><th>수집 항목</th><th>목적</th><th>법적 근거</th><th>보관 기간</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>방문자</td>
      <td>IP 주소, 접속 국가·도시, User-Agent, 접속 시각, 열람 경로</td>
      <td>서비스 운영 통계, 보안 감사, 지역별 콘텐츠 품질 개선</td>
      <td>정당한 이익 (Art. 6(1)(f))</td>
      <td>90일 이후 IP 마지막 옥텟 마스킹, 12개월 이후 집계만 유지</td>
    </tr>
    <tr>
      <td>관리자·편집자 계정</td>
      <td>아이디, 표시 이름, 비밀번호 해시, 편집자 코드, 최근 로그인 시각</td>
      <td>사이트 운영, 권한 관리, 감사 추적</td>
      <td>계약 (Art. 6(1)(b)) · 정당한 이익</td>
      <td>계정 비활성 이후 30일, 삭제 요청 시 즉시 익명화</td>
    </tr>
    <tr>
      <td>로그·감사</td>
      <td>관리자 조작 로그, 로그인 성공/실패, AI 채점 호출 기록</td>
      <td>보안 사고 대응, 부정 사용 방지</td>
      <td>정당한 이익 · 법적 의무</td>
      <td>90일 이후 자동 삭제 또는 익명화</td>
    </tr>
    <tr>
      <td>쿠키</td>
      <td>세션 쿠키(<code>admin_token</code>, <code>admin_session</code>), 테마 선호 쿠키, 언어 선호 쿠키</td>
      <td>로그인 유지, UI 상태 보존</td>
      <td>서비스 제공에 꼭 필요한 기능 쿠키</td>
      <td>세션 쿠키는 24시간, 선호 쿠키는 1년</td>
    </tr>
    <tr>
      <td>기사 제보·문의</td>
      <td>수신 메일의 발신 이메일·본문</td>
      <td>제보·문의 응대</td>
      <td>동의 (메일 작성 행위)</td>
      <td>응대 완료 후 12개월</td>
    </tr>
    <tr>
      <td>도감 댓글 작성</td>
      <td>이름, 소속연맹, 비밀번호 해시(PBKDF2-SHA256), 본문, IP 주소, User-Agent</td>
      <td>댓글 게시·승인·삭제, 스팸·악성 댓글 방지, 작성자 자가 삭제 기능 제공</td>
      <td>동의 (댓글 등록 행위)</td>
      <td>IP·User-Agent 90일 이후 자동 익명화, 그 외 정보는 댓글이 유지되는 동안 보관 (작성자가 비밀번호로 직접 삭제 가능)</td>
    </tr>
  </tbody>
</table>

<h2>3. 정보주체의 권리 (Arts. 15–22 GDPR)</h2>
<p>정보주체는 언제든 다음 권리를 행사할 수 있으며, 운영자는 합리적인 기간 내에 응답합니다.</p>
<ul>
  <li><strong>열람권 (Art. 15)</strong> — 본인에 대해 저장된 데이터 확인. 관리자 계정 보유자는 <code>내 계정</code> 메뉴에서 프로필 + 활동 로그를 바로 확인할 수 있습니다.</li>
  <li><strong>정정권 (Art. 16)</strong> — 부정확한 정보의 수정 요청.</li>
  <li><strong>삭제권 / 잊혀질 권리 (Art. 17)</strong> — 계정·로그의 삭제 요청. 감사 목적의 로그는 사용자 식별자가 <code>[deleted:&lt;id&gt;]</code> 형태로 익명화되어 보존됩니다.</li>
  <li><strong>처리 제한권 (Art. 18)</strong> — 정보의 사용 중지 요청.</li>
  <li><strong>데이터 이동권 (Art. 20)</strong> — 본인 데이터를 기계 판독 가능 JSON 형태로 내보내기. 관리자 UI에서 다운로드 가능.</li>
  <li><strong>거부권 (Art. 21)</strong> — 정당한 이익 기반 처리에 대한 반대.</li>
</ul>
<p>권리 행사 요청은 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a>로 보내주세요.</p>

<h2>4. 제3자 제공 및 국외 이전 (Arts. 44–49)</h2>
<p>BP미디어는 원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 다만 서비스 운영을 위해 다음 처리 수탁자의 인프라를 이용합니다.</p>
<ul>
  <li><strong>Cloudflare, Inc.</strong> (미국) — 호스팅, DNS, CDN, Workers(서버리스 실행 환경), D1 데이터베이스, R2 오브젝트 저장소. GDPR 적정성 결정 대체 수단으로 SCC(Standard Contractual Clauses)가 적용됩니다.</li>
  <li><strong>Cloudflare Turnstile</strong> — 로그인 페이지 봇 방지 CAPTCHA. 쿠키를 사용하지 않으며 개인 식별 정보를 수집하지 않습니다.</li>
</ul>

<h2>5. 보안 대책 (Art. 32)</h2>
<ul>
  <li>관리자 비밀번호는 PBKDF2-SHA256 (100,000 iterations, 16 byte salt)로 해시 저장. 평문 저장 없음.</li>
  <li>세션 토큰은 HMAC-SHA256 서명, HttpOnly + Secure + SameSite=Lax 쿠키로 전달.</li>
  <li>로그인 시도는 IP + 아이디 조합으로 15분 10회 제한.</li>
  <li>전 구간 TLS (Cloudflare), HSTS 활성화.</li>
  <li>운영자 권한은 메뉴·행동별 세분화된 매트릭스로 관리되어 최소 권한 원칙을 따릅니다.</li>
  <li>감사 로그에 모든 운영자 조작이 기록되며 90일 보관 후 삭제·익명화됩니다.</li>
</ul>

<h2>6. 아동 정보</h2>
<p>BP미디어는 14세 미만 아동의 개인정보를 의도적으로 수집하지 않습니다. 부주의로 수집된 정보가 있다면 즉시 삭제합니다.</p>

<h2>7. 변경 고지</h2>
<p>본 방침이 변경될 경우 개정일과 주요 변경 내용을 이 페이지와 사이트 푸터에서 공지합니다. 중대한 변경은 운영자 페이지의 버전 기록에도 남습니다.</p>

<h2>8. 연락</h2>
<p>개인정보 관련 문의 또는 권리 행사 요청은 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a> 으로 연락해주세요. 감독기관(대한민국 개인정보보호위원회, EU 회원국 감독기관)에 불만을 제기할 권리도 있습니다.</p>`;

export const PRIVACY_POLICY_MAX_CHARS = 100_000;

const ANALYTICS_POLICY_DATE = '2026-11-21T00:00:00+09:00';
const ANALYTICS_POLICY_HTML = `
<h2 id="analytics-privacy">9. 선택적 방문 분석과 개인정보 국외 이전</h2>
<p>2026년 11월 21일부터, 방문 분석과 국외 이전에 동의한 경우에만 공개 사이트의 이용 통계를 Google Analytics 4로 측정합니다. 대한민국 개인정보 보호법 제28조의8 제1항 제1호의 별도 동의에 근거합니다.</p>
<ul>
  <li><strong>이전 항목</strong> — 분석 쿠키 식별자, 열람한 공개 페이지 경로와 유입 경로, 방문 시각, 기기·브라우저 정보, 접속 지역, 기사 클릭·본문 끝 도달·다음 기사 이동·검색 결과 열람 등 이용 기록. 검색어 원문과 URL 쿼리 문자열은 계측 이벤트에서 제외합니다. Google은 접속 지역을 추정할 때 IP 주소를 일시적으로 처리합니다.</li>
  <li><strong>이전받는 자·국가</strong> — Google LLC와 Google Analytics 운영을 지원하는 Google 계열사 및 수탁사. 미국과 <a href="https://www.google.com/about/datacenters/locations/">Google 데이터센터가 위치한 국가</a>에서 처리될 수 있습니다. 문의는 <a href="https://support.google.com/policies/contact/general_privacy_form">Google 개인정보 문의 양식</a> 또는 <a href="mailto:info@bpmedia.net">info@bpmedia.net</a>으로 보내실 수 있습니다.</li>
  <li><strong>이전 시점과 방법</strong> — 동의한 이후 공개 페이지를 열거나 측정 대상 행동을 할 때, 브라우저가 암호화된 HTTPS 연결로 Google에 전송합니다.</li>
  <li><strong>목적과 보관 기간</strong> — 사이트 이용 통계를 만들어 기사 탐색과 열람 경험을 개선합니다. GA4의 사용자 및 이벤트 수준 데이터는 2개월로 설정했습니다. 표준 보고서의 집계 통계에는 이 보관 기간이 적용되지 않습니다. 분석 쿠키는 최대 60일로 설정합니다.</li>
  <li><strong>거부와 철회</strong> — ‘허용 안 함’을 선택해 거부할 수 있고, 페이지 하단 ‘방문 분석 설정’에서 언제든 선택을 바꿀 수 있습니다. 거부하거나 철회해도 기사 열람과 공개 검색을 이용할 수 있습니다. 만 14세 미만 방문자는 ‘허용 안 함’을 선택해 주세요.</li>
</ul>`;

function withAnalyticsPolicy(env, policy) {
  if (!configuredAnalyticsId(env)) return policy;
  const newer = Date.parse(policy.updated_at) > Date.parse(ANALYTICS_POLICY_DATE);
  return {
    ...policy,
    html: (newer ? policy.html : policy.html.replace(/최종 개정 \d{4}-\d{2}-\d{2}/, '최종 개정 2026-11-21')) + ANALYTICS_POLICY_HTML,
    updated_at: newer ? policy.updated_at : ANALYTICS_POLICY_DATE,
  };
}

export async function loadPrivacyPolicy(env) {
  try {
    const { results } = env?.DB ? await privacySnapshot(env) : {};
    const rows = Object.fromEntries((results || []).map(row => [row.key, row]));
    const bodyRow = rows[PRIVACY_SETTINGS_KEY];
    const tsRow = rows[PRIVACY_SETTINGS_UPDATED_KEY];
    const stored = bodyRow && typeof bodyRow.value === 'string' ? bodyRow.value.trim() : '';
    if (stored) {
      return withAnalyticsPolicy(env, {
        html: stored,
        updated_at: (tsRow && tsRow.value) || null,
        is_default: false,
      });
    }
  } catch (_) { /* fall through */ }
  return withAnalyticsPolicy(env, { html: DEFAULT_PRIVACY_POLICY_HTML, updated_at: null, is_default: true });
}

export function normalizePrivacyHtml(raw) {
  if (raw == null) return '';
  const text = String(raw).replace(/\r\n?/g, '\n');
  if (text.length > PRIVACY_POLICY_MAX_CHARS) return text.slice(0, PRIVACY_POLICY_MAX_CHARS);
  return text;
}
