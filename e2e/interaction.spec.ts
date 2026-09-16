import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
const detail = (page: Page) => page.getByRole('region', { name: '草稿详情' });
const list = (page: Page) => page.getByRole('region', { name: '讨论列表' });
async function records(page: Page, topic: string) {
  const response = await page.request.get('/api/discussions?status=all');
  expect(response.status()).toBe(200);
  const data = await response.json();
  return data.items.filter((item: { topic: string }) => item.topic === topic);
}
async function createByApi(page: Page, topic: string) {
  const response = await page.request.post('/api/discussions', { data: { topic, requestId: randomUUID() } });
  expect(response.status()).toBe(201); return (await response.json()).discussionId as string;
}
test('真实流程：8位专家与active过滤，明确再次同题创建', async ({ page }) => {
  const topic = `八位专家-${randomUUID()}`;
  await page.goto('/'); await page.getByLabel('讨论话题',{exact:true}).fill(topic);
  await page.getByLabel('专家人数',{exact:true}).selectOption('8');
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(detail(page).getByText('8 位专家（不含主持人）')).toBeVisible();
  await page.getByRole('button',{name:'进行中',exact:true}).click();
  await expect(list(page).getByText('还没有进行中的讨论')).toBeVisible();
  expect(await records(page,topic)).toHaveLength(1);
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(page.getByRole('button',{name:'创建草稿',exact:true})).toBeEnabled();
  await expect.poll(async () => (await records(page,topic)).length).toBe(2);
});
test('真实流程：空白/人数空值拒绝；Unicode500/501边界；HTML作为文本', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('讨论话题',{exact:true}).fill('   ');
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('话题');
  const tooLong = '😀'.repeat(501);
  await page.getByLabel('讨论话题',{exact:true}).fill(tooLong);
  await expect(page.locator('#topic-count')).toHaveText('501 / 500');
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('500'); expect(await records(page,tooLong)).toHaveLength(0);
  const boundary = '😀'.repeat(498)+'e\u0301';
  await page.getByLabel('讨论话题',{exact:true}).fill(boundary);
  await page.getByLabel('专家人数',{exact:true}).selectOption('');
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('请选择1至8');
  await page.getByLabel('专家人数',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(detail(page).getByText(boundary,{exact:true})).toBeVisible();
  const html = '<img src=x onerror="document.body.dataset.injected=1">讨论';
  await page.getByLabel('讨论话题',{exact:true}).fill(html);
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(detail(page).getByText(html,{exact:true})).toBeVisible();
  expect(await page.locator('body').getAttribute('data-injected')).toBeNull();
  expect(await detail(page).locator('img').count()).toBe(0);
});
test('故障注入：服务端已保存但响应丢失，重试原请求不重复落库', async ({ page }) => {
  const topic = `响应丢失-${randomUUID()}`;
  const bodies: string[] = []; let lost = false;
  await page.route('**/api/discussions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    bodies.push(route.request().postData() ?? '');
    const response = await route.fetch();
    if (!lost) { lost = true; expect(response.status()).toBe(201); await route.abort('failed'); }
    else { expect(response.status()).toBe(200); await route.fulfill({ response }); }
  });
  await page.goto('/'); await page.getByLabel('讨论话题',{exact:true}).fill(topic);
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('网络连接中断');
  expect(await records(page,topic)).toHaveLength(1);
  await page.getByRole('button',{name:'重试创建草稿',exact:true}).click();
  await expect(detail(page).getByText(topic,{exact:true})).toBeVisible();
  expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]); expect(await records(page,topic)).toHaveLength(1);
});
test('故障注入：提交期间重复点击，创建成功后列表失败可独立恢复', async ({ page }) => {
  const topic = `列表故障-${randomUUID()}`; let failList = true; let posts = 0;
  page.on('request', request => { if (request.method()==='POST') posts++; });
  await page.route('**/api/discussions?status=all', route => failList ? route.fulfill({ status:500,body:'SQL内部故障' }) : route.continue());
  await page.goto('/'); await page.getByLabel('讨论话题',{exact:true}).fill(topic);
  await page.getByRole('button',{name:'创建草稿',exact:true}).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('status').filter({hasText:'草稿已保存'})).toContainText('列表更新失败');
  await expect(detail(page).getByText(topic,{exact:true})).toBeVisible();
  expect(posts).toBe(1); expect(await records(page,topic)).toHaveLength(1);
  mkdirSync('evidence/stage-5c/screenshots',{recursive:true});
  await page.screenshot({path:'evidence/stage-5c/screenshots/1366x768-list-error.png'});
  failList = false; await page.getByRole('button',{name:'重新加载列表'}).click();
  await expect(list(page).getByRole('button',{name:topic,exact:true})).toBeVisible(); expect(posts).toBe(1);
  await expect(page.locator('body')).not.toContainText('SQL内部故障');
});
test('故障注入：旧详情迟到不能覆盖新选择；详情失败后可重载', async ({ page }) => {
  const a = `旧详情-${randomUUID()}`, b = `新详情-${randomUUID()}`;
  const aid = await createByApi(page,a), bid = await createByApi(page,b);
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let received!: () => void; const seen = new Promise<void>(resolve => { received = resolve; });
  await page.route(`**/api/discussions/${aid}`, async route => { const response = await route.fetch(); received(); await hold; await route.fulfill({response}); });
  await page.goto('/'); await page.getByRole('button',{name:'全部讨论',exact:true}).click();
  await list(page).getByRole('button',{name:a,exact:true}).click(); await seen;
  await list(page).getByRole('button',{name:b,exact:true}).click(); await expect(detail(page).getByText(b,{exact:true})).toBeVisible();
  const late = page.waitForResponse(response => response.url().endsWith(aid)); release(); await late;
  await expect(detail(page).getByText(b,{exact:true})).toBeVisible();
  let fail = true;
  await page.route(`**/api/discussions/${bid}`, route => fail ? route.fulfill({status:500,body:'<html>stack</html>'}) : route.continue());
  await page.getByRole('button',{name:'重新加载详情'}).click(); await expect(detail(page).getByRole('alert')).toContainText('详情加载失败');
  fail = false; await page.getByRole('button',{name:'重新加载详情'}).click(); await expect(detail(page).getByText(b,{exact:true})).toBeVisible();
});
