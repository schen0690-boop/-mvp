import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
declare global {interface Window {stage5cHalfCuts?:number}}
const shots='evidence/stage-5c/screenshots';
test.afterEach(async({request})=>{
 const response=await request.get('/api/discussions?status=active');const {items}=await response.json();
 for(const item of items)if(item.status==='running'||item.status==='stopping'){
  await request.post(`/api/discussions/${item.discussionId}/stop`,{data:{}});
  const s=await (await request.get(`/api/discussions/${item.discussionId}`)).json();const token=/\[run:([a-f0-9-]{36})\]/.exec(s.topic)?.[1];
  if(token&&s.topic.includes('[summary-gate]')){mkdirSync('.tmp/stage-5c/gates',{recursive:true});writeFileSync(`.tmp/stage-5c/gates/${token}-summary`,'cleanup');}
  await expect.poll(async()=>(await (await request.get(`/api/discussions/${item.discussionId}`)).json()).status).toMatch(/completed|failed/);
 }
});
function release(token:string,phase='continue'){mkdirSync('.tmp/stage-5c/gates',{recursive:true});writeFileSync(`.tmp/stage-5c/gates/${token}-${phase}`,'release',{flag:'wx'});}
async function shot(page:Page,name:string){mkdirSync(shots,{recursive:true});await page.screenshot({path:`${shots}/${name}.png`});}
async function prepare(page:Page,count=4,extra=''){
 const token=randomUUID();await page.goto('/');await page.getByLabel('讨论话题',{exact:true}).fill(`AI如何改善教育？ ${extra} [run:${token}]`);await page.getByLabel('专家人数',{exact:true}).selectOption(String(count));await page.getByRole('button',{name:'创建草稿',exact:true}).click();
 await page.getByRole('button',{name:'生成阵容',exact:true}).click();await page.getByRole('button',{name:'确认阵容',exact:true}).click();await expect(page.getByRole('button',{name:'开始讨论',exact:true})).toBeEnabled();return {token,id:new URL(page.url()).searchParams.get('discussion')!};
}
async function snapshot(page:Page,id:string){const r=await page.request.get(`/api/discussions/${id}`);expect(r.status()).toBe(200);return r.json();}
function calls(id:string){const db=new DatabaseSync(process.env.STAGE5C_DATABASE!,{readOnly:true});try{return db.prepare('SELECT calls_used FROM discussions WHERE id=?').get(id)?.calls_used;}finally{db.close();}}
test('完整动态流程经Vite SSE：中途观点、自然收尾、总结及刷新同一记录',async({page})=>{
 const {token,id}=await prepare(page,4,'[text]');let streamed=false;page.on('response',r=>{if(r.url().includes('/events?')&&r.headers()['content-type']?.includes('text/event-stream'))streamed=true;});
 await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);await expect(page.getByTestId('finding')).not.toHaveCount(0);await expect(page.getByTestId('discussion-status')).toHaveText('讨论运行中');expect(streamed).toBe(true);await shot(page,'desktop-running');
 const run=(await snapshot(page,id)).runtime.runId;release(token);await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束',{timeout:15000});await expect(page.getByTestId('utterance')).toHaveCount(13);await expect(page.getByRole('region',{name:'结束总结'})).toContainText('本场Fake讨论');await shot(page,'summary');
 await page.reload();await expect(page.getByTestId('utterance')).toHaveCount(13);expect((await snapshot(page,id)).runtime.runId).toBe(run);
});
test('同场两位观察者共享runner，另一个Tab开始可实时发现',async({page,context})=>{
 const {id}=await prepare(page);const other=await context.newPage();await other.goto(page.url());await expect(other.getByRole('button',{name:'开始讨论',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);await expect(other.getByTestId('utterance')).toHaveCount(3);expect((await snapshot(page,id)).utterances.filter((u:{seq:number})=>u.seq===1)).toHaveLength(1);const before=calls(id);await other.reload();await expect(other.getByTestId('utterance')).toHaveCount(3);expect(calls(id)).toBe(before);
 await other.getByRole('button',{name:'结束讨论',exact:true}).click();await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束');await expect(other.getByTestId('discussion-status')).toHaveText('讨论已结束');await other.close();
});
test('两场并行、首页加入、切换与刷新；结束A不影响B',async({page,context})=>{
 const a=await prepare(page);await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);
 const other=await context.newPage();const b=await prepare(other);await other.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(other.getByTestId('utterance')).toHaveCount(3);
 await page.getByRole('button',{name:'返回讨论列表'}).click();await page.getByRole('button',{name:'进行中',exact:true}).click();const topic=(await snapshot(page,b.id)).topic;await page.getByRole('button',{name:topic,exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);await page.reload();expect((await snapshot(page,b.id)).status).toBe('running');
 await page.goto('/?discussion='+a.id);await expect(page.getByTestId('utterance')).toHaveCount(3);await page.getByRole('button',{name:'结束讨论',exact:true}).click();await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束');expect((await snapshot(other,b.id)).status).toBe('running');await other.getByRole('button',{name:'结束讨论',exact:true}).click();await expect(other.getByTestId('discussion-status')).toHaveText('讨论已结束');await other.close();
});
test('离线期间运行到终态，重连补齐不重复；终态丢失由GET恢复',async({page,context})=>{
 const {token,id}=await prepare(page);await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);
 await context.setOffline(true);await expect(page.getByTestId('connection-status')).toContainText('连接中断');await shot(page,'disconnected');release(token);
 await expect.poll(async()=>(await snapshot(page,id)).status).toBe('completed');await context.setOffline(false);await expect(page.getByTestId('utterance')).toHaveCount(13);await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束');await expect(page.getByRole('region',{name:'结束总结'})).toBeVisible();expect(await page.getByTestId('utterance').evaluateAll(items=>new Set(items.map(item=>item.id)).size)).toBe(13);
});
test('start与stop响应丢失后只读核对，不重复提交；致命失败保留发言',async({page})=>{
 const {token,id}=await prepare(page,4,'[fatal]');let starts=0;
 await page.route('**/api/discussions/*/start',async route=>{starts++;await route.fetch();await route.abort('failed');});await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);expect(starts).toBe(1);release(token);await expect(page.getByTestId('discussion-status')).toHaveText('讨论已中断');await expect(page.getByTestId('utterance')).toHaveCount(3);expect((await snapshot(page,id)).status).toBe('failed');
 await page.unroute('**/api/discussions/*/start');await prepare(page);await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);let stops=0;
 await page.route('**/api/discussions/*/stop',async route=>{stops++;await route.fetch();await route.abort('failed');});await page.getByRole('button',{name:'结束讨论',exact:true}).click();await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束');expect(stops).toBe(1);
});
test('真实SSE在发言事务半批处断开，界面不显示半批并能完整恢复',async({page})=>{
 await page.addInitScript(()=>{
  const Native=window.EventSource;Object.assign(window,{stage5cHalfCuts:0});
  window.EventSource=class extends Native{constructor(url:string|URL,options?:EventSourceInit){super(url,options);let armed=false;
   super.addEventListener('utterance.created',()=>{armed=true;});super.addEventListener('role.status_changed',event=>{if(armed&&window.stage5cHalfCuts===0){event.stopImmediatePropagation();window.stage5cHalfCuts++;this.close();this.dispatchEvent(new Event('error'));}});
  }};
 });
 await prepare(page);await page.getByRole('button',{name:'开始讨论',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.stage5cHalfCuts)).toBe(1);await expect(page.getByTestId('utterance')).toHaveCount(0);
 await expect(page.getByTestId('utterance')).toHaveCount(3);expect(await page.getByTestId('utterance').evaluateAll(items=>new Set(items.map(item=>item.id)).size)).toBe(3);await page.getByRole('button',{name:'结束讨论',exact:true}).click();await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束');
});
test('用户向上阅读时保留滚动位置，点击新消息才回到底部',async({page})=>{
 const {token}=await prepare(page,4,'[text]');await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);
 const box=page.locator('.transcript-scroll');await box.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));});release(token);
 // This assertion waits for the complete remaining dynamic run, not one UI interaction.
 await expect(page.getByTestId('utterance')).toHaveCount(13,{timeout:15000});await expect(page.getByRole('button',{name:'有新发言，回到底部'})).toBeVisible();expect(await box.evaluate(el=>el.scrollTop)).toBeLessThan(5);await page.getByRole('button',{name:'有新发言，回到底部'}).click();await expect.poll(()=>box.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5);
});
for(const [width,height,n] of [[390,844,1],[1366,768,4],[2560,1080,8]] as const)test(`演播厅布局${width}，${n}专家、滚动与键盘`,async({page})=>{
 await page.setViewportSize({width,height});const {id}=await prepare(page,n,'[text] [long]'+(n===8?' [disagree]':''));await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);
 const body=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));expect(body.w).toBeLessThanOrEqual(width);expect(body.h).toBeLessThanOrEqual(height);
 if(width<900){await shot(page,'narrow-studio');await page.getByRole('button',{name:'嘉宾状态',exact:true}).click();await expect(page.locator('.studio-roles')).toBeVisible();await page.getByRole('button',{name:'共识与分歧',exact:true}).click();await expect(page.locator('.studio-findings')).toBeVisible();await page.getByRole('button',{name:'发言记录',exact:true}).click();}
 else{if(n===8)await expect(page.locator('.finding-position')).toHaveCount(2);await shot(page,`studio-${n}-experts`);await expect(page.locator('.role-window')).toHaveCount(n+1);}
 const scroll=page.locator('.transcript-scroll');await scroll.focus();await page.keyboard.press('Home');await expect(scroll).toBeFocused();await page.getByRole('button',{name:'结束讨论',exact:true}).click();await expect(page.getByTestId('discussion-status')).toHaveText('讨论已结束');expect((await snapshot(page,id)).utterances.length).toBe(3);
});
test('主动结束进入收尾，总结失败与已保存发言同时保留',async({page})=>{
 const {token}=await prepare(page,1,'[summary-gate] [summary-fail]');await page.getByRole('button',{name:'开始讨论',exact:true}).click();await expect(page.getByTestId('utterance')).toHaveCount(3);await page.getByRole('button',{name:'结束讨论',exact:true}).dblclick();
 await expect(page.getByTestId('discussion-status')).toHaveText('正在收尾');await shot(page,'stopping');release(token,'summary');await expect(page.getByText('讨论已结束，但总结生成失败。',{exact:true})).toBeVisible();await expect(page.getByTestId('utterance')).toHaveCount(3);await shot(page,'summary-unavailable');
});
