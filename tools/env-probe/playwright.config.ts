import { defineConfig } from '@playwright/test';

// Isolated nonpersistent browser context; never attaches to a personal profile.
const channel = process.env.ENV_PROBE_BROWSER ?? 'msedge';
if (!['msedge', 'chrome', 'chromium'].includes(channel)) throw new Error('Unknown probe browser');
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 10000 },
  outputDir: 'evidence/raw/playwright-results',
  reporter: [['list'], ['json', { outputFile: 'evidence/raw/playwright-report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:41731',
    browserName: 'chromium', channel,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `"${process.execPath}" dist/server/index.js`,
      url: 'http://127.0.0.1:41732/probe/health',
      reuseExistingServer: false, timeout: 15000,
    },
    {
      command: `"${process.execPath}" node_modules/vite/bin/vite.js preview`,
      url: 'http://127.0.0.1:41731',
      reuseExistingServer: false, timeout: 15000,
    },
  ],
});
