import { defineConfig, devices } from '@playwright/test';

// Critical-path smoke tests against the live production site (https://bpmedia.net).
// 점진 도입 — 첫 단계는 인증 없는 공개 페이지 + admin 로그인 페이지 접근성만.
// 인증 필요한 admin 시나리오는 별도 PR에서 storageState 또는 .env 자격증명 도입 후 확장.
export default defineConfig({
  testDir: './tests',
  // 다크모드 대비 검증은 css/dark-mode.css 가 완성될 때까지 기본 실행에서 제외한다.
  // 수동 실행: npx playwright test tests/darkmode-contrast.spec.ts
  testIgnore: ["**/darkmode-contrast.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://bpmedia.net',
    trace: 'on-first-retry',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
