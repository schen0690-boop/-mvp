import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('real local React page, interaction and Express response', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '环境验证样本' })).toBeVisible();
  await expect(page.getByText('操作次数：0')).toBeVisible();
  await page.getByRole('button', { name: '验证交互' }).click();
  await expect(page.getByText('操作次数：1')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('本地后端已连接');
  expect(errors).toEqual([]);
  mkdirSync('evidence/screenshots', { recursive: true });
  await page.screenshot({ path: 'evidence/screenshots/environment.png', fullPage: true });
  const metadata = {
    statement: 'Windows 10 本机实验，不属于官方支持认证。',
    browserVersion: browser.version(), channel: testInfo.project.use.channel,
    headless: testInfo.project.use.headless, url: page.url(),
  };
  writeFileSync('evidence/browser.json', JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify(metadata));
});
