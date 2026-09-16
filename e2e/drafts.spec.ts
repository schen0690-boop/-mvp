import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('真实流程：默认4专家创建、全部列表、详情与刷新读取', async ({ page }) => {
  const topic = `中文教育讨论-${Date.now()}`;
  await page.goto('/');
  await page.getByLabel('讨论话题', { exact: true }).fill(topic);
  await expect(page.getByLabel('专家人数', { exact: true })).toHaveValue('4');
  await page.getByRole('button', { name: '创建草稿', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '草稿已保存' })).toBeVisible();
  const list = page.getByRole('region', { name: '讨论列表' });
  await expect(list.getByRole('button', { name: topic, exact: true })).toBeVisible();
  const detail = page.getByRole('region', { name: '草稿详情' });
  await expect(detail.getByText(topic, { exact: true })).toBeVisible();
  await expect(detail.getByText('阵容尚未生成', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '全部讨论', exact: true }).click();
  await list.getByRole('button', { name: topic, exact: true }).click();
  await expect(detail.getByText(topic, { exact: true })).toBeVisible();
  mkdirSync('evidence/stage-4d/screenshots',{recursive:true});
  await page.screenshot({path:'evidence/stage-4d/screenshots/1366x768-normal.png'});
});
