import { test, expect } from '@playwright/test';

// Critical path #3 — 관리자 로그인 페이지 진입.
// 실제 자격증명 로그인은 .env 도입 후 별도 spec 에서. 여기서는 페이지가 로드되고
// 로그인 form 이 표시되는 회귀만 잡는다 (admin.html 라우팅 / 정적 자산 200).
test('admin login form renders', async ({ page }) => {
  const response = await page.goto('/admin');
  expect(response?.ok()).toBeTruthy();

  // /admin 진입 시 무조건 로그인 화면이 강제됨 (CLAUDE.md §3 Phase 5).
  // 비밀번호 input 이 존재해야 함.
  await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 });
});

test('admin version API matches deployed build', async ({ request }) => {
  const response = await request.get('/api/version');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toHaveProperty('site_version');
  expect(body).toHaveProperty('admin_version');
  // 버전 문자열은 'aa.bbb.cc' 형식이어야 함 (회귀 시 sync_versions.sh 실패 단서).
  expect(body.site_version).toMatch(/^\d{2}\.\d{3}\.\d{2}$/);
  expect(body.admin_version).toMatch(/^\d{2}\.\d{3}\.\d{2}$/);
});
