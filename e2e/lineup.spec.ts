import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const shots='evidence/stage-5c/screenshots';
const detail=(page:Page)=>page.getByRole('region',{name:'草稿详情'});
const action=(page:Page,name:string)=>detail(page).getByRole('button',{name,exact:true});
async function create(page:Page,topic='阵容流程',count=4){
  await page.goto('/');await page.getByLabel('讨论话题',{exact:true}).fill(`${topic} ${randomUUID()}`);await page.getByLabel('专家人数',{exact:true}).selectOption(String(count));
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();await expect(action(page,'生成阵容')).toBeVisible();
  await expect(page).toHaveURL(/discussion=/);return new URL(page.url()).searchParams.get('discussion')!;
}
async function ready(page:Page){await expect(action(page,'确认阵容')).toBeVisible();await expect(detail(page).locator('.member-card')).not.toHaveCount(0);}
async function generate(page:Page){await action(page,'生成阵容').click();await ready(page);}
async function snap(page:Page,id:string){const res=await page.request.get(`/api/discussions/${id}`);expect(res.status()).toBe(200);return res.json();}
function release(gate:string){mkdirSync('.tmp/stage-4d/gates',{recursive:true});writeFileSync(`.tmp/stage-4d/gates/${gate}`,'release',{flag:'wx'});}
async function shot(page:Page,name:string){mkdirSync(shots,{recursive:true});await page.screenshot({path:`${shots}/${name}.png`});}
test('正常闭环：4专家，确认及ready/confirmed刷新由SQLite恢复',async({page})=>{
  const id=await create(page);await generate(page);await expect(detail(page).locator('.member-card')).toHaveCount(5);await shot(page,'desktop-4');
  await detail(page).locator('.member-card').first().scrollIntoViewIfNeeded();await detail(page).locator('.pane-scroll').evaluate(el=>{const card=el.querySelector<HTMLElement>('.member-card');if(card)el.scrollTop+=card.getBoundingClientRect().top-el.getBoundingClientRect().top;});await shot(page,'desktop-4-members');
  const before=await snap(page,id);await page.reload();await ready(page);expect((await snap(page,id)).roles).toEqual(before.roles);
  await action(page,'确认阵容').click();await expect(detail(page).getByText('阵容已确认，可以开始讨论。')).toBeVisible();await page.reload();
  await expect(detail(page).locator('.member-card')).toHaveCount(5);await expect(action(page,'重新生成')).toHaveCount(0);await detail(page).locator('.confirmed-notice').scrollIntoViewIfNeeded();await shot(page,'confirmed');
  expect((await snap(page,id)).utterances).toEqual([]);
});
test('重新生成新阵容，旧generation无法确认',async({page})=>{
  const id=await create(page);await generate(page);const old=await snap(page,id);await action(page,'重新生成').click();await ready(page);
  await expect.poll(async()=>(await snap(page,id)).lineupRevision).toBe(2);
  const current=await snap(page,id);expect(current.roles[0].memberId).not.toBe(old.roles[0].memberId);
  expect((await page.request.post(`/api/discussions/${id}/lineup/confirm`,{data:{generationId:old.lineupGeneration.generationId,lineupRevision:old.lineupRevision}})).status()).toBe(409);
});
test('Provider失败显示安全错误，重试新代成功；失败刷新',async({page})=>{
  const id=await create(page,'[retry]');await action(page,'生成阵容').click();await expect(action(page,'重试生成')).toBeVisible();await shot(page,'failed');const failed=await snap(page,id);
  await page.reload();await expect(action(page,'重试生成')).toBeVisible();await action(page,'重试生成').click();await ready(page);expect((await snap(page,id)).lineupGeneration.generationId).not.toBe(failed.lineupGeneration.generationId);
});
test('生成中刷新继续GET，不再次生成；释放受控Provider后完成',async({page})=>{
  const gate=randomUUID();await create(page,`[gate:${gate}]`);let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/lineup'))posts++;});
  await action(page,'生成阵容').click();await expect(detail(page).getByText('正在生成主持人与专家阵容……')).toBeVisible();await page.reload();await expect(detail(page).getByText('正在生成主持人与专家阵容……')).toBeVisible();release(gate);await ready(page);expect(posts).toBe(1);
});
test('confirm409读取新快照并提示，不自动确认',async({page})=>{
  const id=await create(page);await generate(page);const old=await snap(page,id);
  await page.request.post(`/api/discussions/${id}/lineup`,{data:{requestId:randomUUID(),expectedGenerationId:old.lineupGeneration.generationId}});
  await expect.poll(async()=>(await snap(page,id)).status).toBe('awaiting_confirmation');
  await action(page,'确认阵容').click();await expect(detail(page).getByText('阵容已发生变化，请确认最新版本。')).toBeVisible();await ready(page);expect((await snap(page,id)).status).toBe('awaiting_confirmation');
});
for(const status of [500,503])test(`网络故障注入：confirm ${status}保留卡片并允许重试`,async({page})=>{
  await create(page);await generate(page);const names=await detail(page).locator('.member-card h4').allTextContents();
  await page.route('**/lineup/confirm',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{message:'private SQL stack'}})}),{times:1});
  await action(page,'确认阵容').click();await expect(detail(page).getByText('确认失败，请重试。')).toBeVisible();expect(await detail(page).locator('.member-card h4').allTextContents()).toEqual(names);await expect(page.getByText('private SQL stack')).toHaveCount(0);
  await action(page,'确认阵容').click();await expect(detail(page).getByText('阵容已确认，可以开始讨论。')).toBeVisible();
});
test('重新生成失败隐藏旧卡片且禁止确认，重试可恢复',async({page})=>{
  await create(page,'[regen-fail]');await generate(page);await action(page,'重新生成').click();await expect(action(page,'重试生成')).toBeVisible();await expect(detail(page).locator('.member-card')).toHaveCount(0);await expect(action(page,'确认阵容')).toHaveCount(0);await page.reload();await expect(detail(page).locator('.member-card')).toHaveCount(0);await action(page,'重试生成').click();await ready(page);
});
test('生成中切换讨论，旧结果不污染B',async({page})=>{
  const gate=randomUUID();const a=await create(page,`[gate:${gate}]`);await action(page,'生成阵容').click();await expect(detail(page).getByText('正在生成主持人与专家阵容……')).toBeVisible();
  await page.getByLabel('讨论话题',{exact:true}).fill('另一场独立草稿');await page.getByRole('button',{name:'创建草稿',exact:true}).click();await expect(action(page,'生成阵容')).toBeVisible();release(gate);
  await expect.poll(async()=>(await snap(page,a)).status).toBe('awaiting_confirmation');await expect(detail(page).getByText('另一场独立草稿',{exact:true})).toBeVisible();await expect(detail(page).locator('.member-card')).toHaveCount(0);
});
test('同一事件循环重复点击生成和确认，各只提交一次',async({page})=>{
  await create(page);const paths:string[]=[];page.on('request',r=>{if(r.method()==='POST')paths.push(new URL(r.url()).pathname);});
  await action(page,'生成阵容').evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await ready(page);
  await action(page,'确认阵容').evaluate((el:HTMLButtonElement)=>{el.click();el.click();});await expect(detail(page).getByText('阵容已确认，可以开始讨论。')).toBeVisible();expect(paths.filter(p=>p.endsWith('/lineup'))).toHaveLength(1);expect(paths.filter(p=>p.endsWith('/confirm'))).toHaveLength(1);
});
test('浏览器离线保留生成态，联网GET恢复而非POST重发',async({page,context})=>{
  const gate=randomUUID();await create(page,`[gate:${gate}]`);let posts=0;page.on('request',r=>{if(r.method()==='POST')posts++;});await action(page,'生成阵容').click();await expect(detail(page).getByText('正在生成主持人与专家阵容……')).toBeVisible();
  await context.setOffline(true);await expect(detail(page).getByText('网络连接中断，正在等待恢复……')).toBeVisible();await expect(action(page,'重试生成')).toHaveCount(0);await shot(page,'offline');release(gate);await context.setOffline(false);await ready(page);expect(posts).toBe(1);
});
test('两个Tab：旧Tab冲突接受新版，另一Tab确认后重新GET恢复已确认',async({page,context})=>{
  await create(page);await generate(page);const other=await context.newPage();await other.goto(page.url());await ready(other);await action(other,'重新生成').click();await ready(other);
  await action(page,'确认阵容').click();await expect(detail(page).getByText('阵容已发生变化，请确认最新版本。')).toBeVisible();await ready(page);
  await action(other,'确认阵容').click();await expect(detail(other).getByText('阵容已确认，可以开始讨论。')).toBeVisible();await action(page,'重新加载详情').click();await expect(detail(page).getByText('阵容已确认，可以开始讨论。')).toBeVisible();await other.close();
});
for(const [width,height,count] of [[390,844,1],[1366,768,8],[2560,1080,8]] as const)test(`阵容布局 ${width}x${height} / ${count}专家长字段与键盘滚动`,async({page})=>{
  await page.setViewportSize({width,height});await create(page,'[long] 长字段阵容',count);await generate(page);await expect(detail(page).locator('.member-card')).toHaveCount(count+1);
  await action(page,'确认阵容').focus();await expect(action(page,'确认阵容')).toBeFocused();await page.keyboard.press('Tab');await expect(action(page,'重新生成')).toBeFocused();
  const scroll=detail(page).locator('.pane-scroll');await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  const dimensions=await page.locator('body').evaluate(el=>({w:el.scrollWidth,h:el.scrollHeight}));expect(dimensions.w).toBeLessThanOrEqual(width);expect(dimensions.h).toBeLessThanOrEqual(height);expect(await page.locator('.create-pane .pane-scroll').evaluate(el=>el.scrollTop)).toBe(0);
  await shot(page,`lineup-${width}-${count}-bottom`);await scroll.evaluate(el=>{el.scrollTop=250;});await shot(page,`lineup-${width}-${count}`);
});
test('真实确认请求等待时禁用两个按钮，成功后恢复为只读',async({page})=>{
  await create(page);await generate(page);
  let releaseRequest!:()=>void;const gate=new Promise<void>(resolve=>{releaseRequest=resolve;});
  await page.route('**/lineup/confirm',async route=>{await gate;await route.continue();});
  await action(page,'确认阵容').click();await expect(action(page,'确认阵容')).toBeDisabled();await expect(action(page,'重新生成')).toBeDisabled();await expect(detail(page).getByText('正在提交…')).toBeVisible();
  releaseRequest();await expect(detail(page).getByText('阵容已确认，可以开始讨论。')).toBeVisible();
});
