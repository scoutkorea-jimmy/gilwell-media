import { defineConfig } from '@playwright/test';

// Synthetic local Admin checks. Never inherit the production smoke-test baseURL.
export default defineConfig({
  testDir: '.',
  testMatch: 'admin-reorganization.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: '../test-results/admin-reorganization',
  use: {
    baseURL: 'http://127.0.0.1:8767',
    browserName: 'chromium',
    channel: 'chrome',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'python3 tests/admin-static-server.py 8767',
    cwd: '..',
    url: 'http://127.0.0.1:8767/admin.html',
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
