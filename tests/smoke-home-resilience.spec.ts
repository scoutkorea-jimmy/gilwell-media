import { test, expect } from '@playwright/test';

// 홈 복원력 회귀 테스트 (00.175.00).
//
// 배경: nav 노출 스위치(.is-ready)가 site-chrome.js renderManagedNav 에만 달려
// 있었고, 홈은 그 호출을 bootstrapStandardPage 에서 꺼 둔 채 /api/home 응답 후
// applyLang 경로에서만 그렸다. 그래서 /api/home 이 실패·지연되면 상단 메뉴가
// 영구히 보이지 않았고, 동시에 renderLoadFailure 가 SSR 이 이미 채워 둔 기사
// 목록까지 오류 문구로 덮어썼다. 아래 두 테스트가 그 회귀를 잡는다.

/** /api/home 을 죽인 채 홈을 연다. SSR HTML 과 정적 자산은 정상 제공된다. */
async function gotoHomeWithDeadHomeApi(page: import('@playwright/test').Page) {
  await page.route('**/api/home*', (route) => route.abort('failed'));
  await page.goto('/');
}

test('상단 메뉴는 /api/home 이 실패해도 보인다', async ({ page }) => {
  await gotoHomeWithDeadHomeApi(page);

  const nav = page.locator('nav.nav[data-managed-nav]').first();
  await expect(nav).toBeVisible({ timeout: 10_000 });

  // CSS 가 .is-ready 없이는 visibility:hidden 으로 감추므로, 클래스 자체도 확인한다.
  await expect(nav).toHaveClass(/is-ready/, { timeout: 10_000 });

  // 실제로 이동 가능한 링크가 있어야 "메뉴가 보인다"고 할 수 있다.
  await expect(nav.locator('a[href="/latest"]')).toBeVisible();
  await expect(nav.locator('a[href="/jamboree16"]')).toBeVisible();
});

test('/api/home 실패가 SSR 로 채워진 기사 목록을 지우지 않는다', async ({ page }) => {
  await gotoHomeWithDeadHomeApi(page);

  const latest = page.locator('#latest-list');
  await expect(latest).toBeVisible({ timeout: 10_000 });

  // 실패 경로가 한 번 돌 시간을 준다 (abort 는 즉시 반환되므로 넉넉).
  await page.waitForTimeout(2_000);

  // SSR 이 넣어 둔 기사 링크가 남아 있어야 한다.
  await expect(latest.locator('a[href^="/post/"]').first()).toBeVisible();

  // 그리고 그 자리에 오류 문구가 덮여 있으면 안 된다.
  await expect(latest.getByText(/불러오지 못했습니다/)).toHaveCount(0);

  // 통계도 0 으로 리셋되면 안 된다 — 네트워크 오류를 "기사 0건"으로 표시하던 회귀.
  const statsText = (await page.locator('#masthead-stats').first().innerText().catch(() => '')) || '';
  if (statsText.trim()) {
    expect(statsText).not.toMatch(/한국소식\s*0건/);
  }
});

test('서버가 nav 라벨을 부트스트랩으로 주입한다', async ({ page }) => {
  await gotoHomeWithDeadHomeApi(page);

  // GW_BOOT_NAV_LABELS 가 없으면 nav 는 GW.STRINGS 기본값으로 그려지고,
  // 관리자가 바꾼 라벨이 /api/home 도착 후에야 반영돼 한 번 바뀌어 보인다.
  const bootLabels = await page.evaluate(() => (window as any).GW_BOOT_NAV_LABELS || null);
  expect(bootLabels).toBeTruthy();
  // 키에 점이 들어 있으므로 배열 경로로 지정한다 (문자열이면 중첩 경로로 해석됨).
  expect(bootLabels).toHaveProperty(['nav.latest', 'ko'], '최신 소식');
  expect(bootLabels).toHaveProperty(['nav.jamboree16', 'ko'], '제16회 한국잼버리');
});
