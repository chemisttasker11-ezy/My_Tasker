import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  globalTeardown: process.platform === 'win32' ? './tests/playwright-teardown.ts' : undefined,
  use: { baseURL: 'http://127.0.0.1:5181', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: false, timeout: 120_000,
    // Playwright does not support graceful server shutdown on Windows.
    gracefulShutdown: process.platform === 'win32' ? undefined : { signal: 'SIGTERM', timeout: 5000 } },
});
