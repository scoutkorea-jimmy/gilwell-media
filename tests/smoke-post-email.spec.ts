import { test, expect } from '@playwright/test';

// 00.176.01 회귀 가드.
//
// 정적 HTML 페이지는 mailto 링크를 <!--email_off--> 로 감싸 Cloudflare Email
// Obfuscation 을 끈다. SSR 템플릿(functions/post/[id].js, feature/[slug].js)이
// 이 관례를 빠뜨리면 Cloudflare 가 주소를 [email protected] 자리표시자로 바꾸고,
// 되돌리는 /cdn-cgi/scripts/…/email-decode.min.js 는 공개 페이지 CSP 의
// script-src 'strict-dynamic' 에 막혀(같은 오리진이어도 nonce 없으면 차단)
// 실행되지 않는다. 결과적으로 방문자에게 자리표시자가 그대로 노출된다.
//
// 주의: Email Obfuscation 은 bpmedia.net 존에만 켜져 있고 *.pages.dev 프리뷰
// 도메인에는 적용되지 않는다. 그래서 이 테스트를 프리뷰 URL 로 돌리면 수정 전
// 빌드에서도 통과한다 — 반드시 프로덕션(baseURL 기본값)에서 의미가 있다.
// 수정 전 프로덕션 실측: /post/6 에 data-cfemail 3건 + 화면에 "[email protected]".
// 수정 후: 0건.

const SSR_PAGES = ['/post/6', '/post/371'];

for (const path of SSR_PAGES) {
  test(`${path} 는 이메일을 자리표시자로 노출하지 않는다`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} 가 200 이어야 함`).toBeTruthy();

    // Cloudflare 가 난독화했다면 이 마크업이 남는다.
    await expect(page.locator('.__cf_email__, [data-cfemail]')).toHaveCount(0);

    // 방문자 눈에 보이는 문자열로도 확인 (마크업이 바뀌어도 잡히도록).
    await expect(page.getByText(/\[email.{0,3}protected\]/i)).toHaveCount(0);

    // 실제 mailto 링크는 살아 있어야 한다 — 난독화가 아니라 링크 자체가
    // 사라진 경우를 "통과"로 오판하지 않기 위한 대조 단언.
    await expect(page.locator('a[href^="mailto:"]').first()).toBeAttached();
  });
}
