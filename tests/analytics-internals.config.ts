import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'analytics-internals.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, expect: { timeout: 15_000 }, reporter: 'list',
  outputDir: '../test-results/analytics-internals',
  use: { baseURL: 'http://127.0.0.1:8781', browserName: 'chromium', channel: 'chrome', locale: 'ko-KR', timezoneId: 'Asia/Seoul', hasTouch: true,
    trace: 'retain-on-failure', actionTimeout: 15_000, navigationTimeout: 30_000 },
  webServer: { command: 'python3 tests/admin-static-server.py 8781', cwd: '..',
    url: 'http://127.0.0.1:8781/admin.html', reuseExistingServer: false, timeout: 15_000, stdout: 'ignore', stderr: 'ignore' },
});
