// One authorized sample only. Not an npm test target; no automatic retries.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const out='evidence/stage-4d-b', auth='.local/stage-4d-live/authorization';
mkdirSync(out,{recursive:true});
const save=(name,value)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const load=name=>JSON.parse(readFileSync(`${auth}/${name}.json`,'utf8'));
assert(!existsSync(`${auth}/binding.json`)&&!existsSync(`${auth}/request-1.json`)&&!existsSync(`${auth}/closed.json`),'Existing authorization requires read-only recovery');
const record={startedAt:new Date().toISOString(),codeVersion:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),frontend:'http://127.0.0.1:41851',backend:'http://127.0.0.1:41852',topic:'AI 如何改善教育？',expertCount:4,steps:{},posts:[]};
save('ui-start',record);
let browser,context,page,id,stage='startup';
const select=s=>({discussionId:s.discussionId,topic:s.topic,expertCount:s.expertCount,status:s.status,version:s.version,lastEventId:s.lastEventId,lineupRevision:s.lineupRevision,lineupGeneration:s.lineupGeneration,roles:s.roles.map(m=>({memberId:m.memberId,role:m.role,name:m.name,profession:m.profession,title:m.title,stance:m.stance,color:m.color,displayOrder:m.displayOrder})),lastNotice:s.lastNotice});
async function snapshot(){const response=await page.request.get(`/api/discussions/${id}`);assert.equal(response.status(),200);return response.json();}
async function screenshot(name){await page.screenshot({path:`${out}/${name}.png`});}
try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  context=await browser.newContext({baseURL:record.frontend,viewport:{width:1600,height:1400}});
  page=await context.newPage();page.setDefaultTimeout(15000);
  // Browser can only use the loopback frontend. Count POST paths, never bodies or headers.
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==record.frontend)return route.abort();return route.continue();});
  page.on('request',r=>{if(r.method()==='POST')record.posts.push(new URL(r.url()).pathname);});
  await page.goto('/');
  const initial=await page.request.get('/api/discussions?status=all');assert.equal(initial.status(),200);assert.deepEqual((await initial.json()).items,[]);
  stage='create';await page.getByLabel('讨论话题',{exact:true}).fill(record.topic);await page.getByLabel('专家人数',{exact:true}).selectOption('4');
  const created=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/discussions');
  await page.getByRole('button',{name:'创建草稿',exact:true}).click();const response=await created;assert.equal(response.status(),201);
  const result=await response.json();id=result.discussionId;record.discussionId=id;save('created',select(result.snapshot));record.steps.created=true;
  const detail=page.getByRole('region',{name:'草稿详情'}),action=name=>detail.getByRole('button',{name,exact:true});
  stage='generate';const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/discussions/${id}/lineup`);
  await action('生成阵容').click();const acceptedResponse=await accepted;assert.equal(acceptedResponse.status(),202);
  const acceptedBody=await acceptedResponse.json();record.generationId=acceptedBody.snapshot.lineupGeneration.generationId;save('accepted',select(acceptedBody.snapshot));
  assert.deepEqual(load('binding'),{discussionId:id,generationId:record.generationId});record.steps.accepted=true;
  stage='await_terminal';let terminal;
  await expect.poll(async()=>{terminal=await snapshot();return terminal.status;},{timeout:70000,intervals:[300,500,1000]}).not.toBe('generating_lineup');
  save('terminal',select(terminal));record.terminalStatus=terminal.status;
  if(terminal.status==='lineup_generation_failed'){
    await expect(detail.getByText('阵容生成失败',{exact:true})).toBeVisible();await screenshot('failed');record.outcome='generation_failed';
  }else{
    assert.equal(terminal.status,'awaiting_confirmation');assert.equal(terminal.roles.length,5);assert.equal(terminal.roles.filter(m=>m.role==='moderator').length,1);assert.equal(terminal.roles.filter(m=>m.role==='expert').length,4);
    const palette=['#193455','#2157a5','#137568','#8b4c20','#734a9c'];
    for(const [n,m] of terminal.roles.entries()){assert.equal(m.color,palette[n]);assert.equal(m.displayOrder,n);assert.match(m.memberId,/^[0-9a-f-]{36}$/);for(const k of ['name','profession','title','stance'])assert(m[k].trim());}
    assert.equal(new Set(terminal.roles.map(m=>m.memberId)).size,5);assert.equal(load('closed').reason,'valid_result');
    await expect(action('确认阵容')).toBeVisible();await expect(detail.locator('.member-card')).toHaveCount(5);
    for(const m of terminal.roles){const card=detail.getByRole('article',{name:`${m.role==='moderator'?'主持人':'专家'}：${m.name}`,exact:true});for(const k of ['name','profession','title','stance'])await expect(card).toContainText(m[k]);}
    assert(!/reasoning_content|Authorization|"roles"\s*:|"choices"\s*:/.test(await page.locator('body').innerText()));
    record.steps.generatedSavedDisplayed=true;await screenshot('awaiting-confirmation');
    stage='public_review';console.log(JSON.stringify({stage,discussionId:id,generationId:record.generationId,roles:terminal.roles}));
    const end=Date.now()+120000;while(!existsSync(`${out}/review-approved.json`)){if(Date.now()>end)throw new Error('Review not completed');await delay(500);}
    stage='confirm';const confirmedResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/discussions/${id}/lineup/confirm`);
    await action('确认阵容').click();assert.equal((await confirmedResponse).status(),200);
    await expect(detail.getByText('阵容已确认，讨论功能将在后续阶段启用。',{exact:true})).toBeVisible();
    const confirmed=await snapshot();assert.equal(confirmed.status,'lineup_confirmed');assert.deepEqual(confirmed.roles,terminal.roles);assert.equal(confirmed.lineupRevision,terminal.lineupRevision);assert.deepEqual(confirmed.lineupGeneration,terminal.lineupGeneration);
    save('confirmed',select(confirmed));await screenshot('confirmed');record.steps.confirmed=true;
    stage='refresh';await page.reload();await expect(detail.getByText('阵容已确认，讨论功能将在后续阶段启用。',{exact:true})).toBeVisible();await expect(detail.locator('.member-card')).toHaveCount(5);
    const refreshed=await snapshot();assert.deepEqual(refreshed,confirmed);save('refreshed',select(refreshed));await screenshot('refreshed-confirmed');record.steps.refreshed=true;record.outcome='single_sample_passed';
  }
  assert.equal(record.posts.filter(p=>p.endsWith('/lineup')).length,1);assert.equal(record.posts.filter(p=>p==='/api/discussions').length,1);
}catch{
  record.outcome='interrupted_needs_read_only_verification';record.stoppedAt=stage;process.exitCode=1;
  if(id&&page){try{save('recovery-snapshot',select(await snapshot()));record.recoveryGet=true;}catch{record.recoveryGet=false;}try{await screenshot('interrupted');}catch{}}
}finally{
  await context?.close();await browser?.close();record.browserClosed=true;record.endedAt=new Date().toISOString();save('ui-result',record);console.log(JSON.stringify(record));
}
