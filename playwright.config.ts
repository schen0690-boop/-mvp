import { defineConfig } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
mkdirSync('.tmp/stage-3', { recursive: true });
const database = join(mkdtempSync(resolve('.tmp/stage-3/browser-')), 'test.sqlite');
export default defineConfig({
  testDir: './e2e', workers: 1, retries: 0, forbidOnly: true, timeout: 20000,
  expect: { timeout: 5000 },
  outputDir: 'evidence/stage-3/raw/results',
  reporter: [['list'], ['json', { outputFile: 'evidence/stage-3/raw/report.json' }]],
  use: { baseURL: 'http://127.0.0.1:41841', browserName: 'chromium', channel: 'msedge',
    headless: true, viewport: { width: 1366, height: 768 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node dist/server.js', url: 'http://127.0.0.1:41842/api/discussions',
      env: { PORT: '41842', DATABASE_PATH: database }, reuseExistingServer: false, timeout: 15000 },
    { command: 'node node_modules/vite/bin/vite.js --config web/vite.config.ts --port 41841',
      url: 'http://127.0.0.1:41841', env: { WEB_API_TARGET: 'http://127.0.0.1:41842' },
      reuseExistingServer: false, timeout: 15000 }
  ]
});
