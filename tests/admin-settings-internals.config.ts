import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'admin-settings-internals.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, expect: { timeout: 15_000 }, reporter: 'list', outputDir: '../test-results/admin-settings-internals',
  use: { baseURL: 'http://127.0.0.1:8767', browserName: 'chromium', channel: 'chrome', locale: 'ko-KR', timezoneId: 'Asia/Seoul', trace: 'retain-on-failure' },
  webServer: { command: 'python3 tests/admin-static-server.py 8767', cwd: '..', url: 'http://127.0.0.1:8767/admin.html', reuseExistingServer: false, timeout: 15_000, stdout: 'ignore', stderr: 'ignore' },
});
