import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'content-layout.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, expect: { timeout: 15_000 }, reporter: 'list', outputDir: '../test-results/content-layout',
  use: { baseURL: 'http://127.0.0.1:8794', browserName: 'chromium', channel: 'chrome', locale: 'ko-KR', timezoneId: 'Asia/Seoul', trace: 'off', actionTimeout: 15_000, navigationTimeout: 30_000 },
  webServer: { command: 'python3 tests/admin-static-server.py 8794', cwd: '..', url: 'http://127.0.0.1:8794/admin.html', reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore' },
});
